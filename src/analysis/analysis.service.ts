import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GmailService } from '../gmail/gmail.service';
import { resolveService } from '../common/registry/service-registry';

type AiSecurityLevel = '위험' | '주의' | '양호';

interface AiProblemMail {
  subject?: string;
  date?: string;
  body?: string;
  matched_keywords?: string;
}

interface AiAccountAnalysis {
  account_id?: string;
  account?: string;
  security_score?: number;
  security_level?: AiSecurityLevel | string;
  interpretation?: string;
  problem_mails?: AiProblemMail[];
}

interface AiAnalyzeResponse {
  accounts?: AiAccountAnalysis[];
}

type RiskType =
  | 'new_device_login'
  | 'password_reset'
  | 'verification_code'
  | 'account_recovery'
  | 'permission_grant'
  | 'security_recommendation';

type RiskLevel = 'high' | 'medium' | 'low' | 'safe';
type AccountStatus =
  | 'action_required'
  | 'watch'
  | 'safe'
  | 'resolved'
  | 'skipped'
  | 'dormant';

const FORCE_HIGH_RISK_TYPES = new Set<RiskType>([
  'new_device_login',
  'password_reset',
  'verification_code',
  'account_recovery',
]);

const STEP_MESSAGES: Record<string, string> = {
  waiting: '분석을 준비하고 있어요.',
  checking_connected_mail: '연결된 Gmail을 확인하고 있어요.',
  collecting_account_signals: '계정 보안 신호를 수집하고 있어요.',
  preparing_home: '홈 화면을 준비하고 있어요.',
  completed: '메일 원문은 저장하지 않고 분석 결과만 정리했어요.',
  failed: '분석을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
};

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailService: GmailService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async startAnalysis(userId: string, mailAccountIds?: string[]) {
    const accounts = await this.prisma.gmailAccount.findMany({
      where: {
        userId,
        status: 'connected',
        ...(mailAccountIds?.length ? { id: { in: mailAccountIds } } : {}),
      },
    });

    if (!accounts.length) {
      throw new BadRequestException('연결된 Gmail 계정이 없습니다.');
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

    setImmediate(() =>
      this.runPipeline(run.id, userId, accounts).catch(() => {}),
    );

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
    try {
      await this.updateStep(runId, 'checking_connected_mail', 10);

      for (const account of accounts) {
        await this.updateStep(runId, 'collecting_account_signals', 30);
        this.logger.log(`[${account.email}] mbox 수집 시작`);

        const { mbox, count, sizeBytes, lastEmailDate } =
          await this.gmailService.fetchAllEmailsAsMbox(account.id);

        if (count === 0) {
          this.logger.warn(`[${account.email}] 메일 없음, 건너뜀`);
          continue;
        }

        this.logger.log(
          `[${account.email}] ${count}개, ${sizeBytes} bytes → AI 전송`,
        );

        let aiResult: AiAnalyzeResponse = { accounts: [] };
        try {
          aiResult = await this.uploadMboxToAI(mbox);
        } catch (e) {
          this.logger.error(`[${account.email}] AI 분석 실패: ${e}`);
        }

        await this.updateStep(runId, 'preparing_home', 70);
        await this.saveResults(account.id, runId, aiResult, lastEmailDate);
      }

      await this.prisma.analysisRun.update({
        where: { id: runId },
        data: {
          status: 'completed',
          progress: 100,
          currentStep: 'completed',
          displayMessage: STEP_MESSAGES['completed'],
          completedAt: new Date(),
        },
      });
    } catch (e) {
      this.logger.error(`[runId=${runId}] 파이프라인 실패: ${e}`);
      await this.prisma.analysisRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          currentStep: 'failed',
          displayMessage: STEP_MESSAGES['failed'],
          failedReason: String(e),
          completedAt: new Date(),
        },
      });
    }
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

  private async uploadMboxToAI(mbox: Buffer): Promise<AiAnalyzeResponse> {
    const aiUrl = this.config.get('AI_SERVER_URL', 'http://localhost:8000');
    const form = new FormData();
    form.append('file', mbox, {
      filename: 'analysis.mbox',
      contentType: 'application/mbox',
    });

    const { data } = await firstValueFrom(
      this.httpService.post(`${aiUrl}/analyze`, form, {
        headers: form.getHeaders(),
        timeout: 300_000,
      }),
    );
    return data;
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
          skippedAt: status === 'skipped' ? existing?.skippedAt ?? null : null,
          resolvedAt: status === 'resolved' ? existing?.resolvedAt ?? null : null,
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
              ? existing?.skippedAt ?? null
              : shouldKeepUserDisposition
                ? existing?.skippedAt ?? null
                : null,
          resolvedAt:
            status === 'resolved'
              ? existing?.resolvedAt ?? null
              : shouldKeepUserDisposition
                ? existing?.resolvedAt ?? null
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

      const existingActions = await this.prisma.actionItem.count({
        where: { serviceAccountId: sa.id },
      });
      const shouldRefreshActions =
        riskLevel !== 'safe' &&
        primaryRiskType &&
        (existingActions === 0 ||
          (hasNewEvidence && existing?.primaryRiskType !== primaryRiskType));

      if (shouldRefreshActions) {
        if (existingActions > 0) {
          await this.prisma.actionItem.deleteMany({
            where: { serviceAccountId: sa.id },
          });
        }
        const template = this.getActionTemplate(primaryRiskType, registry);
        for (const [i, step] of template.entries()) {
          await this.prisma.actionItem.create({
            data: {
              serviceAccountId: sa.id,
              title: step.title,
              description: step.description,
              isRequired: step.isRequired,
              externalUrl: step.externalUrl ?? null,
              order: i,
            },
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

  // ─── 분류 ──────────────────────────────────────────────────────────────────

  private toRiskLevel(
    level?: string,
    score?: number,
    riskType?: RiskType | null,
  ): RiskLevel {
    const normalizedScore =
      typeof score === 'number' && Number.isFinite(score) ? score : null;
    const hasForceHighRisk = riskType
      ? FORCE_HIGH_RISK_TYPES.has(riskType)
      : false;

    if (level === '위험') {
      if (hasForceHighRisk || (normalizedScore ?? 0) >= 7) return 'high';
      return 'medium';
    }

    if (level === '주의') {
      if (hasForceHighRisk || (normalizedScore ?? 0) >= 8) return 'high';
      return 'medium';
    }

    if (level === '양호') {
      if ((normalizedScore ?? 0) >= 6 && hasForceHighRisk) return 'medium';
      if ((normalizedScore ?? 0) >= 4) return 'low';
      return 'safe';
    }

    if (normalizedScore === null) return hasForceHighRisk ? 'medium' : 'safe';
    if (hasForceHighRisk && normalizedScore >= 4) return 'high';
    if (normalizedScore >= 7) return 'high';
    if (normalizedScore >= 4) return 'medium';
    if (normalizedScore > 0) return 'low';
    return 'safe';
  }

  private toStatus(riskLevel: RiskLevel): AccountStatus {
    if (riskLevel === 'high' || riskLevel === 'medium')
      return 'action_required';
    if (riskLevel === 'low') return 'watch';
    return 'safe';
  }

  private nextStatus(
    existingStatus: AccountStatus | undefined,
    computedStatus: AccountStatus,
    hasNewEvidence: boolean,
  ): AccountStatus {
    if (
      !hasNewEvidence &&
      (existingStatus === 'resolved' || existingStatus === 'skipped')
    ) {
      return existingStatus;
    }
    if (existingStatus === 'dormant') return 'dormant';
    return computedStatus;
  }

  private toHeadline(riskLevel: RiskLevel): string {
    if (riskLevel === 'high') return '오늘 안에 확인 필요';
    if (riskLevel === 'medium') return '확인이 필요해요';
    return '지켜보는 중이에요';
  }

  private inferRiskType(ai: AiAccountAnalysis): RiskType {
    const haystack = [
      ai.interpretation,
      ...(ai.problem_mails ?? []).flatMap((m) => [
        m.subject,
        m.matched_keywords,
        m.body,
      ]),
    ]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();

    if (this.has(haystack, ['새 기기', '새 로그인', 'new device', 'new login']))
      return 'new_device_login';
    if (this.has(haystack, ['비밀번호 재설정', 'password reset', 'recover']))
      return 'password_reset';
    if (
      this.has(haystack, ['인증 코드', 'verification code', 'otp', '인증번호'])
    )
      return 'verification_code';
    if (this.has(haystack, ['계정 복구', 'account recovery']))
      return 'account_recovery';
    if (this.has(haystack, ['권한', 'permission', 'authorized app']))
      return 'permission_grant';
    return 'security_recommendation';
  }

  private has(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => text.includes(kw.toLowerCase()));
  }

  private buildEvidenceHash(serviceName: string, mail: AiProblemMail): string {
    const normalizedKeywords = this.parseKeywords(mail.matched_keywords).join('|');
    const hashInput = [
      serviceName,
      mail.subject,
      mail.date,
      normalizedKeywords,
    ]
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

  private getActionTemplate(
    riskType: RiskType,
    registry: ReturnType<typeof resolveService>,
  ): {
    title: string;
    description: string;
    isRequired: boolean;
    externalUrl?: string | null;
  }[] {
    const officialStep = registry.officialUrl
      ? [
          {
            title: '공식 페이지 열기',
            description: '메일 링크가 아닌 공식 사이트로 이동해요.',
            isRequired: false,
            externalUrl: registry.officialUrl,
          },
        ]
      : [];
    const passwordStep = {
      title: '새 비밀번호로 변경',
      description: '이전 조합과 겹치지 않는 비밀번호를 사용해요.',
      isRequired: true,
      externalUrl: registry.passwordUrl,
    };

    const templates: Record<
      RiskType,
      {
        title: string;
        description: string;
        isRequired: boolean;
        externalUrl?: string | null;
      }[]
    > = {
      new_device_login: [
        ...officialStep,
        passwordStep,
        {
          title: '알 수 없는 기기 로그아웃',
          description: '최근 로그인 기기 목록에서 모르는 기기를 제거해요.',
          isRequired: true,
        },
        {
          title: '같은 비밀번호를 쓰는 계정 점검',
          description: '비밀번호를 재사용 중인 다른 계정도 바꿔요.',
          isRequired: false,
        },
      ],
      password_reset: [
        {
          title: '재설정 요청이 본인 활동인지 확인',
          description: '내가 요청한 게 아니라면 바로 비밀번호를 바꿔요.',
          isRequired: true,
        },
        passwordStep,
        {
          title: '복구 이메일·전화번호 확인',
          description: '내 정보로 설정되어 있는지 확인해요.',
          isRequired: false,
        },
      ],
      verification_code: [
        {
          title: '인증 코드 요청이 본인 활동인지 확인',
          description: '내가 요청한 게 아니라면 무시하고 비밀번호를 바꿔요.',
          isRequired: true,
        },
        {
          title: '최근 로그인 기록 확인',
          description: '모르는 접속 기록이 있는지 확인해요.',
          isRequired: true,
        },
      ],
      account_recovery: [
        {
          title: '복구 요청이 본인 활동인지 확인',
          description: '내가 요청한 게 아니라면 즉시 비밀번호를 바꿔요.',
          isRequired: true,
        },
        passwordStep,
        {
          title: '복구 이메일·전화번호 재설정',
          description: '내 정보로 다시 설정해요.',
          isRequired: false,
        },
      ],
      permission_grant: [
        {
          title: '연결된 앱·권한 목록 확인',
          description: '모르는 앱이 있으면 권한을 해제해요.',
          isRequired: true,
        },
        {
          title: '모르는 앱 권한 해제',
          description: '사용하지 않거나 모르는 앱은 바로 해제해요.',
          isRequired: true,
        },
        {
          title: '비밀번호 변경',
          description: '의심스러운 접근이 있었다면 비밀번호도 바꿔요.',
          isRequired: false,
        },
      ],
      security_recommendation: [
        ...officialStep,
        {
          title: '보안 알림 확인',
          description: '공식 사이트에서 직접 보안 상태를 확인해요.',
          isRequired: false,
        },
        {
          title: '2단계 인증 설정 확인',
          description: '2단계 인증이 켜져 있는지 확인해요.',
          isRequired: false,
        },
      ],
    };

    return templates[riskType] ?? templates.security_recommendation;
  }
}
