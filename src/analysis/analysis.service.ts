import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { createHash } from 'crypto';
import { createReadStream, unlink } from 'fs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GmailService } from '../gmail/gmail.service';
import { resolveService } from '../common/registry/service-registry';
import { planKbActionMerge } from '../risks/policy/action-kb';
import {
  ANALYSIS_COOLDOWN_MS,
  ANALYSIS_ORPHAN_TTL_MS,
  nextAnalysisAccountStatus,
} from '../common/domain/status';
import { SolarService } from '../common/solar/solar.service';
import {
  computeSecurityScore,
  isActiveForHomeMetrics,
} from '../common/domain/metrics';
import type { AccountStatus, RiskLevel } from '../common/domain/status';
import { gmailAccountLogRef } from '../common/logging/redact';
import {
  parseAiAnalyzeResponse,
  type AiAccountAnalysis,
  type AiAnalyzeResponse,
  type AiProblemMail,
} from './ai-analyze-response';
import {
  inferRiskType,
  riskLevelToAccountStatus,
  toHeadline,
  toRiskLevel,
  type RiskType,
} from './ai-risk-mapping';

const STEP_MESSAGES: Record<string, string> = {
  waiting: '분석을 준비하고 있어요.',
  checking_connected_mail: '연결된 Gmail을 확인하고 있어요.',
  collecting_account_signals: '계정 보안 신호를 수집하고 있어요.',
  preparing_home: '홈 화면을 준비하고 있어요.',
  completed: '메일 원문은 저장하지 않고 분석 결과만 정리했어요.',
  failed: '분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
};

@Injectable()
export class AnalysisService implements OnModuleInit {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailService: GmailService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    private readonly solarService: SolarService,
  ) {}

  async onModuleInit() {
    await this.recoverOrphanRuns();
  }

  /** Mark runs stuck in queued/scanning longer than TTL as failed (process crash recovery). */
  async recoverOrphanRuns() {
    const cutoff = new Date(Date.now() - ANALYSIS_ORPHAN_TTL_MS);
    const result = await this.prisma.analysisRun.updateMany({
      where: {
        status: { in: ['queued', 'scanning'] },
        startedAt: { lt: cutoff },
      },
      data: {
        status: 'failed',
        currentStep: 'failed',
        displayMessage: STEP_MESSAGES['failed'],
        failedReason: 'analysis_orphaned_timeout',
        completedAt: new Date(),
      },
    });
    if (result.count > 0) {
      this.logger.warn(`Recovered ${result.count} orphan analysis run(s)`);
    }
  }

  async startAnalysis(userId: string, mailAccountIds?: string[]) {
    const accounts = await this.prisma.gmailAccount.findMany({
      where: {
        userId,
        status: 'connected',
        ...(mailAccountIds?.length ? { id: { in: mailAccountIds } } : {}),
      },
    });

    if (!accounts.length) {
      throw new BadRequestException(
        '연결된 Gmail 계정이 없습니다. 재연결이 필요한 계정은 마이 화면에서 다시 연동해 주세요.',
      );
    }

    const running = await this.prisma.analysisRun.findFirst({
      where: { userId, status: { in: ['queued', 'scanning'] } },
    });
    if (running) {
      return {
        analysisId: running.id,
        status: running.status as 'queued' | 'scanning',
        targetMailAccounts: [],
        message: STEP_MESSAGES[running.currentStep] ?? STEP_MESSAGES['waiting'],
      };
    }

    const recentRun = await this.prisma.analysisRun.findFirst({
      where: {
        userId,
        startedAt: { gte: new Date(Date.now() - ANALYSIS_COOLDOWN_MS) },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (recentRun) {
      throw new HttpException(
        '분석 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const run = await this.prisma.analysisRun.create({
      data: {
        userId,
        status: 'queued',
        mode: 'initial',
        progress: 0,
        currentStep: 'waiting',
        displayMessage: STEP_MESSAGES['waiting'],
      },
    });

    setImmediate(() => {
      this.runPipeline(run.id, userId, accounts).catch((e) => {
        this.logger.error(`[runId=${run.id}] unhandled pipeline error: ${e}`);
      });
    });

    return {
      analysisId: run.id,
      status: 'queued' as const,
      targetMailAccounts: accounts.map((a) => ({
        id: a.id,
        email: a.email,
        role: a.isPrimary ? ('primary' as const) : ('connected' as const),
      })),
      message: STEP_MESSAGES['waiting'],
    };
  }

  async getStatus(analysisId: string, userId: string) {
    const run = await this.prisma.analysisRun.findFirst({
      where: { id: analysisId, userId },
    });
    if (!run) throw new NotFoundException('분석을 찾을 수 없습니다.');

    return {
      analysisId: run.id,
      status: run.status,
      progress: run.progress,
      currentStep: run.currentStep,
      displayMessage:
        run.displayMessage ?? STEP_MESSAGES[run.currentStep] ?? '',
      completedAt: run.completedAt?.toISOString() ?? null,
      errorMessage: run.status === 'failed' ? (run.failedReason ?? null) : null,
    };
  }

  // ─── 파이프라인 ─────────────────────────────────────────────────────────────

  private async runPipeline(
    runId: string,
    userId: string,
    accounts: { id: string; email: string }[],
  ) {
    let gmailAttempts = 0;
    let gmailSuccesses = 0;
    let aiAttempts = 0;
    let aiSuccesses = 0;
    const partialErrors: string[] = [];

    try {
      await this.updateStep(runId, 'checking_connected_mail', 10);

      for (const account of accounts) {
        await this.updateStep(runId, 'collecting_account_signals', 30);
        const accountRef = gmailAccountLogRef(account);
        this.logger.log(`[${accountRef}] mbox 수집 시작`);

        gmailAttempts += 1;
        let tmpPath: string | null = null;
        let count: number;
        let sizeBytes: number;
        let lastEmailDate: Date | null;

        try {
          ({ tmpPath, count, sizeBytes, lastEmailDate } =
            await this.gmailService.fetchAllEmailsAsMbox(account.id, userId));
          gmailSuccesses += 1;
        } catch (e) {
          const msg = this.safeErrorMessage(e);
          this.logger.error(`[${accountRef}] Gmail 수집 실패: ${msg}`);
          partialErrors.push(`${account.id}: gmail_fetch_failed`);
          continue;
        }

        if (count === 0) {
          this.logger.warn(`[${accountRef}] 메일 없음, 건너뜀`);
          if (tmpPath) unlink(tmpPath, () => {});
          continue;
        }

        this.logger.log(
          `[${accountRef}] ${count}개, ${sizeBytes} bytes → AI 전송`,
        );

        aiAttempts += 1;
        let aiResult: AiAnalyzeResponse = { accounts: [] };
        try {
          aiResult = await this.uploadMboxToAI(tmpPath!);
          aiSuccesses += 1;
        } catch (e) {
          const msg = this.safeErrorMessage(e);
          this.logger.error(`[${accountRef}] AI 분석 실패: ${msg}`);
          partialErrors.push(`${account.id}: ai_analyze_failed`);
          continue;
        } finally {
          if (tmpPath) unlink(tmpPath, () => {});
          tmpPath = null;
        }

        await this.updateStep(runId, 'preparing_home', 70);
        await this.saveResults(account.id, runId, aiResult, lastEmailDate);
      }

      // Fail the run if every Gmail or AI attempt failed (no usable results)
      if (gmailAttempts > 0 && gmailSuccesses === 0) {
        await this.markFailed(
          runId,
          '모든 Gmail 계정 메일 수집에 실패했습니다.',
        );
        return;
      }

      if (aiAttempts > 0 && aiSuccesses === 0) {
        await this.markFailed(runId, 'AI 분석 서버 호출에 모두 실패했습니다.');
        return;
      }

      await this.prisma.analysisRun.update({
        where: { id: runId },
        data: {
          status: 'completed',
          progress: 100,
          currentStep: 'completed',
          displayMessage: STEP_MESSAGES['completed'],
          completedAt: new Date(),
          failedReason:
            partialErrors.length > 0
              ? `partial_errors: ${partialErrors.slice(0, 5).join('; ')}`
              : null,
        },
      });

      // Solar snapshot은 비동기로 patch — 분석 완료 UX를 블로킹하지 않음
      setImmediate(() => {
        this.buildAndPatchSnapshot(runId, userId).catch((e) =>
          this.logger.error(`[runId=${runId}] Solar snapshot 생성 실패: ${e}`),
        );
      });
    } catch (e) {
      this.logger.error(`[runId=${runId}] 파이프라인 실패: ${e}`);
      await this.markFailed(runId, this.safeErrorMessage(e));
    }
  }

  private safeErrorMessage(error: unknown): string {
    if (error instanceof HttpException) {
      const res = error.getResponse();
      if (typeof res === 'string') return res.slice(0, 300);
      if (typeof res === 'object' && res && 'message' in res) {
        const msg = (res as { message: string | string[] }).message;
        return (Array.isArray(msg) ? msg.join(', ') : msg).slice(0, 300);
      }
    }
    if (error instanceof Error) return error.message.slice(0, 300);
    return 'unknown_error';
  }

  private async buildAndPatchSnapshot(runId: string, userId: string) {
    const gmailAccounts = await this.prisma.gmailAccount.findMany({
      where: { userId },
      include: {
        serviceAccounts: {
          where: { status: { notIn: ['dormant', 'skipped'] } },
          include: {
            riskEvidences: {
              select: {
                id: true,
                subject: true,
                summary: true,
                riskType: true,
              },
              orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
              take: 3,
            },
          },
        },
      },
    });

    const serviceAccounts = gmailAccounts.flatMap((ga) => ga.serviceAccounts);
    const activeServices = serviceAccounts.filter(
      (sa) => sa.riskLevel !== 'safe',
    );
    if (activeServices.length === 0) return;

    // high risk 서비스 우선, 서비스당 최대 2개 evidence — Solar 프롬프트 품질 유지
    const riskOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sortedServices = [...activeServices].sort(
      (a, b) => (riskOrder[a.riskLevel] ?? 3) - (riskOrder[b.riskLevel] ?? 3),
    );
    const evidences = sortedServices.flatMap((sa) =>
      sa.riskEvidences
        .slice(0, 2)
        .map((e) => ({ ...e, serviceAccountId: sa.id })),
    );

    const activeAll = serviceAccounts.filter((a) =>
      isActiveForHomeMetrics(a.status),
    );
    const score = computeSecurityScore(activeAll);

    const snapshot = await this.solarService.generateReportSnapshot(
      {
        securityScore: score,
        services: sortedServices.map((sa) => ({
          serviceAccountId: sa.id,
          serviceName: sa.serviceName,
          riskLevel: sa.riskLevel,
          primaryRiskType: sa.primaryRiskType,
          interpretation: sa.interpretation,
          evidenceSubjects: sa.riskEvidences
            .map((e) => e.subject ?? '')
            .filter(Boolean),
        })),
      },
      evidences,
    );

    if (!snapshot) return;

    // reportSnapshot이 이미 null인 run에만 patch — 조치 무효화 이후 stale 복귀 방지
    await this.prisma.analysisRun.updateMany({
      where: { id: runId, reportSnapshot: { equals: Prisma.DbNull } },
      data: {
        reportSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async markFailed(runId: string, reason: string) {
    await this.prisma.analysisRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        currentStep: 'failed',
        displayMessage: STEP_MESSAGES['failed'],
        failedReason: reason.slice(0, 500),
        completedAt: new Date(),
      },
    });
  }

  private async updateStep(runId: string, step: string, progress: number) {
    await this.prisma.analysisRun.update({
      where: { id: runId },
      data: {
        status: 'scanning',
        currentStep: step,
        progress,
        displayMessage: STEP_MESSAGES[step],
      },
    });
  }

  private async uploadMboxToAI(tmpPath: string): Promise<AiAnalyzeResponse> {
    const aiUrl = this.config.get('AI_SERVER_URL', 'http://localhost:8000');
    const form = new FormData();
    form.append('file', createReadStream(tmpPath), {
      filename: 'analysis.mbox',
      contentType: 'application/mbox',
    });

    const { data } = await firstValueFrom(
      this.httpService.post(`${aiUrl}/analyze`, form, {
        headers: form.getHeaders(),
        timeout: 300_000,
      }),
    );

    // 내부 스키마 검증 — 실패 시 throw → 기존 run failed 경로 (클라이언트 status 필드 동일)
    return parseAiAnalyzeResponse(data);
  }

  private async saveResults(
    gmailAccountId: string,
    runId: string,
    result: AiAnalyzeResponse,
    lastEmailDate: Date | null,
  ) {
    for (const ai of result?.accounts ?? []) {
      const accountName = ai.account ?? 'Unknown';
      const mails = ai.problem_mails ?? [];
      const registry = resolveService(
        accountName,
        ai.account_id,
        ...mails.flatMap((mail) => [
          mail.subject,
          mail.matched_keywords,
          this.senderCandidateFromSubject(mail.subject),
        ]),
      );
      const primaryRiskType =
        mails.length > 0 || ai.security_level !== '양호'
          ? this.inferRiskType(ai)
          : null;
      const riskLevel = this.toRiskLevel(
        ai.security_level,
        ai.security_score,
        primaryRiskType,
      );
      const computedStatus = this.toStatus(riskLevel);

      const evidenceInputs = mails
        .filter((mail) => mail.subject || mail.date || mail.matched_keywords)
        .map((mail) => {
          const riskType = primaryRiskType ?? 'security_recommendation';
          const evidenceHash = this.buildEvidenceHash(
            registry.serviceName,
            mail,
          );
          return {
            evidenceHash,
            riskType,
            sender: registry.serviceName,
            subject: mail.subject ?? null,
            receivedAt: this.parseDate(mail.date),
            summary: this.toEvidenceSummary(mail, ai, riskType),
          };
        });

      const existing = await this.prisma.serviceAccount.findUnique({
        where: {
          gmailAccountId_serviceName: {
            gmailAccountId,
            serviceName: registry.serviceName,
          },
        },
        include: {
          riskEvidences: { select: { evidenceHash: true } },
        },
      });
      const existingHashes = new Set(
        existing?.riskEvidences
          .map((e) => e.evidenceHash)
          .filter((hash): hash is string => Boolean(hash)) ?? [],
      );
      const hasNewEvidence = evidenceInputs.some(
        (e) => !existingHashes.has(e.evidenceHash),
      );
      const status = this.nextStatus(
        existing?.status as AccountStatus | undefined,
        computedStatus,
        hasNewEvidence,
      );
      const shouldKeepUserDisposition =
        !hasNewEvidence && (status === 'resolved' || status === 'skipped');

      const sa = await this.prisma.serviceAccount.upsert({
        where: {
          gmailAccountId_serviceName: {
            gmailAccountId,
            serviceName: registry.serviceName,
          },
        },
        create: {
          gmailAccountId,
          analysisRunId: runId,
          aiAccountId: ai.account_id ?? null,
          serviceName: registry.serviceName,
          displayName: registry.serviceName,
          iconUrl: registry.iconUrl,
          iconLabel: registry.iconLabel,
          riskLevel,
          status,
          primaryRiskType,
          headline: riskLevel !== 'safe' ? this.toHeadline(riskLevel) : null,
          summary: ai.interpretation ?? null,
          interpretation: ai.interpretation ?? null,
          skippedAt:
            status === 'skipped' ? (existing?.skippedAt ?? null) : null,
          resolvedAt:
            status === 'resolved' ? (existing?.resolvedAt ?? null) : null,
          lastAnalyzedAt: new Date(),
        },
        update: {
          analysisRunId: runId,
          aiAccountId: ai.account_id ?? null,
          iconUrl: registry.iconUrl,
          iconLabel: registry.iconLabel,
          riskLevel,
          status,
          primaryRiskType,
          headline: riskLevel !== 'safe' ? this.toHeadline(riskLevel) : null,
          summary: ai.interpretation ?? null,
          interpretation: ai.interpretation ?? null,
          skippedAt:
            status === 'skipped'
              ? (existing?.skippedAt ?? null)
              : shouldKeepUserDisposition
                ? (existing?.skippedAt ?? null)
                : null,
          resolvedAt:
            status === 'resolved'
              ? (existing?.resolvedAt ?? null)
              : shouldKeepUserDisposition
                ? (existing?.resolvedAt ?? null)
                : null,
          lastAnalyzedAt: new Date(),
        },
      });

      for (const evidence of evidenceInputs) {
        await this.prisma.riskEvidence.upsert({
          where: {
            serviceAccountId_evidenceHash: {
              serviceAccountId: sa.id,
              evidenceHash: evidence.evidenceHash,
            },
          },
          create: {
            serviceAccountId: sa.id,
            ...evidence,
          },
          update: {
            riskType: evidence.riskType,
            sender: evidence.sender,
            subject: evidence.subject,
            receivedAt: evidence.receivedAt,
            summary: evidence.summary,
          },
        });
      }

      const existingActions = await this.prisma.actionItem.findMany({
        where: { serviceAccountId: sa.id },
        orderBy: { order: 'asc' },
      });

      // non-safe 계정은 매 분석마다 KB merge — enrich 스크립트/특정 메일함에 의존하지 않도록 일반화
      const shouldRefreshActions =
        riskLevel !== 'safe' && Boolean(primaryRiskType);

      if (shouldRefreshActions) {
        const plan = planKbActionMerge(
          existingActions,
          primaryRiskType,
          registry,
        );

        for (const u of plan.updates) {
          await this.prisma.actionItem.update({
            where: { id: u.id },
            data: {
              type: u.type,
              title: u.title,
              why: u.why,
              description: u.description,
              isRequired: u.isRequired,
              externalUrl: u.externalUrl,
              order: u.order,
            },
          });
        }

        for (const c of plan.creates) {
          await this.prisma.actionItem.create({
            data: {
              serviceAccountId: sa.id,
              type: c.type,
              title: c.title,
              description: c.description,
              why: c.why,
              isRequired: c.isRequired,
              externalUrl: c.externalUrl,
              order: c.order,
              status: c.status,
            },
          });
        }

        if (plan.skipIds.length > 0) {
          await this.prisma.actionItem.updateMany({
            where: { id: { in: plan.skipIds } },
            data: { status: 'skipped' },
          });
        }
      }
    }

    if (lastEmailDate) {
      await this.prisma.gmailAccount.update({
        where: { id: gmailAccountId },
        data: { lastSyncedAt: new Date(), lastEmailReceivedAt: lastEmailDate },
      });
    }
  }

  // ─── 분류 (순수 로직: ai-risk-mapping / domain/status) ─────────────────────

  private toRiskLevel(
    level?: string,
    score?: number,
    riskType?: RiskType | null,
  ): RiskLevel {
    return toRiskLevel(level, score, riskType);
  }

  private toStatus(riskLevel: RiskLevel): AccountStatus {
    return riskLevelToAccountStatus(riskLevel);
  }

  private nextStatus(
    existingStatus: AccountStatus | undefined,
    computedStatus: AccountStatus,
    hasNewEvidence: boolean,
  ): AccountStatus {
    return nextAnalysisAccountStatus(
      existingStatus,
      computedStatus,
      hasNewEvidence,
    );
  }

  private toHeadline(riskLevel: RiskLevel): string {
    return toHeadline(riskLevel);
  }

  private inferRiskType(ai: AiAccountAnalysis): RiskType {
    return inferRiskType(ai);
  }

  private buildEvidenceHash(serviceName: string, mail: AiProblemMail): string {
    const normalizedKeywords = this.parseKeywords(mail.matched_keywords).join(
      '|',
    );
    const hashInput = [serviceName, mail.subject, mail.date, normalizedKeywords]
      .map((value) => this.normalizeHashPart(value))
      .join('::');

    return createHash('sha256').update(hashInput).digest('hex');
  }

  private normalizeHashPart(value?: string | null): string {
    return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private parseKeywords(value?: string | null): string[] {
    return (value ?? '')
      .split(/[,|;/\n]+/)
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .map((keyword) => keyword.toLowerCase())
      .filter((keyword, index, array) => array.indexOf(keyword) === index);
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private senderCandidateFromSubject(subject?: string): string | null {
    if (!subject) return null;
    const domain = subject.match(/[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
    return domain ?? null;
  }

  private toEvidenceSummary(
    mail: AiProblemMail,
    ai: AiAccountAnalysis,
    riskType: RiskType,
  ): string | null {
    const keywords = this.parseKeywords(mail.matched_keywords).slice(0, 4);
    const keywordText = keywords.length
      ? `감지 키워드: ${keywords.join(', ')}`
      : this.riskTypeLabel(riskType);

    if (mail.subject) {
      return `${keywordText} · "${mail.subject}"`;
    }

    if (ai.interpretation) {
      return `${keywordText} · ${ai.interpretation}`;
    }

    return keywordText;
  }

  private riskTypeLabel(riskType: RiskType): string {
    const map: Record<RiskType, string> = {
      new_device_login: '새 기기 로그인 신호',
      password_reset: '비밀번호 재설정 신호',
      verification_code: '인증 코드 신호',
      account_recovery: '계정 복구 신호',
      permission_grant: '권한 허용 신호',
      security_recommendation: '보안 알림 신호',
    };
    return map[riskType];
  }
}
