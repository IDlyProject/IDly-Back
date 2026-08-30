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
import { withRetry } from '../common/http/with-retry';
import {
  isEmptyAiAnalyzeResult,
  parseAiAnalyzeResponse,
  sanitizeAiInterpretation,
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
  waiting: '분석을 준비하고 있어요. 시간이 걸리니 나가셔도 괜찮아요.',
  fetching_mails: '메일을 불러오고 있어요.',
  finding_security: '보안 관련 메일을 찾고 있어요. 나가셔도 분석은 계속돼요.',
  grouping_accounts: '계정별로 묶고 있어요.',
  assessing_risks: '위험도를 판단하고 있어요.',
  preparing_actions: '필요한 조치를 정리하고 있어요.',
  completed: '분석이 끝났어요. 메일 원문은 저장하지 않고 결과만 정리했어요.',
  failed: '분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
};

const DEFAULT_AI_ANALYSIS_TIMEOUT_MS = 15 * 60 * 1000;

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
      where: {
        userId,
        status: { in: ['queued', 'scanning'] },
        startedAt: { gte: new Date(Date.now() - ANALYSIS_ORPHAN_TTL_MS) },
      },
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
        status: { in: ['queued', 'scanning', 'completed'] },
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

  /** 스케줄러 전용 — cooldown 체크 없이 재분석 실행. 진행 중인 run이 있으면 skip. */
  async triggerScheduledAnalysis(userId: string): Promise<'started' | 'skipped'> {
    const accounts = await this.prisma.gmailAccount.findMany({
      where: { userId, status: 'connected' },
    });
    if (!accounts.length) return 'skipped';

    const running = await this.prisma.analysisRun.findFirst({
      where: {
        userId,
        status: { in: ['queued', 'scanning'] },
        startedAt: { gte: new Date(Date.now() - ANALYSIS_ORPHAN_TTL_MS) },
      },
    });
    if (running) return 'skipped';

    const run = await this.prisma.analysisRun.create({
      data: {
        userId,
        status: 'queued',
        mode: 'manual',
        progress: 0,
        currentStep: 'waiting',
        displayMessage: STEP_MESSAGES['waiting'],
      },
    });

    setImmediate(() => {
      this.runPipeline(run.id, userId, accounts).catch((e) => {
        this.logger.error(`[scheduled][runId=${run.id}] pipeline error: ${e}`);
      });
    });

    return 'started';
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

    // 계정당 progress 구간: 10%~72% 를 N등분 (각 계정당 3 sub-step)
    const totalAccounts = accounts.length;
    const progressSlice = totalAccounts > 0 ? Math.floor(62 / totalAccounts) : 62;

    const accountProgress = (i: number, sub: 0 | 1 | 2) =>
      10 + i * progressSlice + Math.floor((sub / 3) * progressSlice);

    try {
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        const accountRef = gmailAccountLogRef(account);

        await this.updateStep(runId, 'fetching_mails', accountProgress(i, 0));
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

        await this.updateStep(
          runId,
          'finding_security',
          accountProgress(i, 1),
          `보안 관련 메일을 찾고 있어요. (${count.toLocaleString('ko-KR')}건 검토 중)`,
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

        // HTTP/파싱 성공이어도 accounts 가 비면 홈 카드가 안 생김 — 관측 + partial 기록
        // (run status shape 동일: completed 가능, failedReason에 partial_errors)
        if (isEmptyAiAnalyzeResult(aiResult)) {
          this.logger.warn(
            `[${accountRef}] AI 응답 accounts 비어 있음 — SA 갱신 없음`,
          );
          partialErrors.push(`${account.id}: ai_empty_accounts`);
        } else {
          this.logger.log(
            `[${accountRef}] AI accounts=${aiResult.accounts?.length ?? 0}`,
          );
        }

        const accountCount = aiResult.accounts?.length ?? 0;
        await this.updateStep(
          runId,
          'grouping_accounts',
          accountProgress(i, 2),
          accountCount > 0
            ? `계정별로 묶고 있어요. (${accountCount}개 계정 확인)`
            : undefined,
        );
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

      await this.updateStep(runId, 'assessing_risks', 75);
      await this.updateStep(runId, 'preparing_actions', 90);

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
      this.logPipelineStep(
        runId,
        'completed',
        100,
        STEP_MESSAGES['completed'],
      );

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
    this.logPipelineStep(runId, 'failed', 0, STEP_MESSAGES['failed']);
  }

  private async updateStep(runId: string, step: string, progress: number, message?: string) {
    const displayMessage = message ?? STEP_MESSAGES[step] ?? '';
    await this.prisma.analysisRun.update({
      where: { id: runId },
      data: {
        status: 'scanning',
        currentStep: step,
        progress,
        displayMessage,
      },
    });
    this.logPipelineStep(runId, step, progress, displayMessage);
  }

  private logPipelineStep(
    runId: string,
    step: string,
    progress: number,
    displayMessage: string,
  ) {
    this.logger.log(
      `[runId=${runId}] step=${step} progress=${progress} message="${displayMessage}"`,
    );
  }

  private async uploadMboxToAI(tmpPath: string): Promise<AiAnalyzeResponse> {
    const aiUrl = this.config.get('AI_SERVER_URL', 'http://localhost:8000');
    const configuredTimeout = Number(
      this.config.get<string>('AI_ANALYSIS_TIMEOUT_MS'),
    );
    const pollDeadlineMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_AI_ANALYSIS_TIMEOUT_MS;

    // Step 1: 업로드 → job_id 수신 (202 Accepted)
    const UPLOAD_TIMEOUT_MS = 2 * 60 * 1000;
    const form = new FormData();
    form.append('file', createReadStream(tmpPath), {
      filename: 'analysis.mbox',
      contentType: 'application/mbox',
    });

    const { data: jobData } = await withRetry(() =>
      firstValueFrom(
        this.httpService.post(`${aiUrl}/analyze`, form, {
          headers: form.getHeaders(),
          timeout: UPLOAD_TIMEOUT_MS,
        }),
      ),
    );

    const jobId: string = jobData?.job_id;
    if (!jobId) {
      throw new Error('AI server did not return a job_id');
    }
    this.logger.log(`AI job created: ${jobId}`);

    // Step 2: GET /analyze/{job_id} 폴링 — succeeded/failed 될 때까지
    const POLL_INTERVAL_MS = 5_000;
    const deadline = Date.now() + pollDeadlineMs;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const { data: statusData } = await withRetry(() =>
        firstValueFrom(
          this.httpService.get(`${aiUrl}/analyze/${jobId}`, {
            timeout: 30_000,
          }),
        ),
      );

      const status: string = statusData?.status;
      this.logger.log(
        `AI job ${jobId}: status=${status} progress=${statusData?.progress ?? 0}%`,
      );

      if (status === 'succeeded') {
        return parseAiAnalyzeResponse(statusData);
      }

      if (status === 'failed') {
        throw new Error(
          `AI job failed: ${statusData?.error ?? 'unknown error'}`,
        );
      }
      // queued / running → 계속 폴링
    }

    throw new Error(
      `AI job ${jobId} timed out after ${Math.round(pollDeadlineMs / 1000)}s`,
    );
  }

  private async saveResults(
    gmailAccountId: string,
    runId: string | null,
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
          summary: sanitizeAiInterpretation(ai.interpretation) ?? null,
          interpretation: sanitizeAiInterpretation(ai.interpretation) ?? null,
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
          summary: sanitizeAiInterpretation(ai.interpretation) ?? null,
          interpretation: sanitizeAiInterpretation(ai.interpretation) ?? null,
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

  /**
   * Push 기반 증분 동기화용. mini mbox 경로를 받아 AI 분석 후 결과를 저장한다.
   * AnalysisRun을 생성하지 않으므로 analysisRunId는 null로 기록된다.
   * tmpMboxPath 파일은 호출 측에서 삭제해야 한다.
   */
  async analyzeAndSaveIncremental(
    gmailAccountId: string,
    tmpMboxPath: string,
    lastEmailDate: Date | null,
  ): Promise<void> {
    const result = await this.uploadMboxToAI(tmpMboxPath);
    await this.saveResults(gmailAccountId, null, result, lastEmailDate);
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
