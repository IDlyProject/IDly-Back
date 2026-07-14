import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
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
type AccountStatus = 'action_required' | 'watch' | 'safe' | 'resolved';

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
      throw new ConflictException({ analysisId: running.id, status: running.status });
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

    setImmediate(() => this.runPipeline(run.id, userId, accounts).catch(() => {}));

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

  async getStatus(analysisId: string) {
    const run = await this.prisma.analysisRun.findUniqueOrThrow({ where: { id: analysisId } });
    return {
      analysisId: run.id,
      status: run.status,
      progress: run.progress,
      currentStep: run.currentStep,
      displayMessage: run.displayMessage ?? STEP_MESSAGES[run.currentStep] ?? '',
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

        this.logger.log(`[${account.email}] ${count}개, ${sizeBytes} bytes → AI 전송`);

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
    form.append('file', mbox, { filename: 'analysis.mbox', contentType: 'application/mbox' });

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
      const registry = resolveService(accountName);
      const riskLevel = this.toRiskLevel(ai.security_level, ai.security_score);
      const status = this.toStatus(riskLevel);
      const primaryRiskType = riskLevel !== 'safe' ? this.inferRiskType(ai) : null;

      const sa = await this.prisma.serviceAccount.upsert({
        where: { gmailAccountId_serviceName: { gmailAccountId, serviceName: registry.serviceName } },
        create: {
          gmailAccountId,
          analysisRunId: runId,
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
          lastAnalyzedAt: new Date(),
        },
        update: {
          analysisRunId: runId,
          iconUrl: registry.iconUrl,
          iconLabel: registry.iconLabel,
          riskLevel,
          status,
          primaryRiskType,
          headline: riskLevel !== 'safe' ? this.toHeadline(riskLevel) : null,
          summary: ai.interpretation ?? null,
          interpretation: ai.interpretation ?? null,
          lastAnalyzedAt: new Date(),
        },
      });

      await this.prisma.riskEvidence.deleteMany({ where: { serviceAccountId: sa.id } });

      for (const mail of ai.problem_mails ?? []) {
        if (!mail.subject && !mail.date) continue;
        await this.prisma.riskEvidence.create({
          data: {
            serviceAccountId: sa.id,
            riskType: primaryRiskType ?? 'security_recommendation',
            sender: registry.serviceName,
            subject: mail.subject ?? null,
            receivedAt: mail.date ? new Date(mail.date) : null,
            summary: ai.interpretation ?? null,
            // body는 저장 금지
          },
        });
      }

      const existingActions = await this.prisma.actionItem.count({
        where: { serviceAccountId: sa.id },
      });
      if (existingActions === 0 && riskLevel !== 'safe' && primaryRiskType) {
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

  private toRiskLevel(level?: string, score?: number): RiskLevel {
    if (level === '위험') return score && score >= 7 ? 'high' : 'medium';
    if (level === '주의') return 'low';
    return 'safe';
  }

  private toStatus(riskLevel: RiskLevel): AccountStatus {
    if (riskLevel === 'high' || riskLevel === 'medium') return 'action_required';
    if (riskLevel === 'low') return 'watch';
    return 'safe';
  }

  private toHeadline(riskLevel: RiskLevel): string {
    if (riskLevel === 'high') return '오늘 안에 확인 필요';
    if (riskLevel === 'medium') return '확인이 필요해요';
    return '지켜보는 중이에요';
  }

  private inferRiskType(ai: AiAccountAnalysis): RiskType {
    const haystack = [
      ai.interpretation,
      ...(ai.problem_mails ?? []).flatMap((m) => [m.subject, m.matched_keywords]),
    ]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();

    if (this.has(haystack, ['새 기기', '새 로그인', 'new device', 'new login'])) return 'new_device_login';
    if (this.has(haystack, ['비밀번호 재설정', 'password reset', 'recover'])) return 'password_reset';
    if (this.has(haystack, ['인증 코드', 'verification code', 'otp', '인증번호'])) return 'verification_code';
    if (this.has(haystack, ['계정 복구', 'account recovery'])) return 'account_recovery';
    if (this.has(haystack, ['권한', 'permission', 'authorized app'])) return 'permission_grant';
    return 'security_recommendation';
  }

  private has(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => text.includes(kw.toLowerCase()));
  }

  private getActionTemplate(
    riskType: RiskType,
    registry: ReturnType<typeof resolveService>,
  ): { title: string; description: string; isRequired: boolean; externalUrl?: string | null }[] {
    const officialStep = registry.officialUrl
      ? [{ title: '공식 페이지 열기', description: '메일 링크가 아닌 공식 사이트로 이동해요.', isRequired: false, externalUrl: registry.officialUrl }]
      : [];
    const passwordStep = { title: '새 비밀번호로 변경', description: '이전 조합과 겹치지 않는 비밀번호를 사용해요.', isRequired: true, externalUrl: registry.passwordUrl };

    const templates: Record<RiskType, { title: string; description: string; isRequired: boolean; externalUrl?: string | null }[]> = {
      new_device_login: [
        ...officialStep,
        passwordStep,
        { title: '알 수 없는 기기 로그아웃', description: '최근 로그인 기기 목록에서 모르는 기기를 제거해요.', isRequired: true },
        { title: '같은 비밀번호를 쓰는 계정 점검', description: '비밀번호를 재사용 중인 다른 계정도 바꿔요.', isRequired: false },
      ],
      password_reset: [
        { title: '재설정 요청이 본인 활동인지 확인', description: '내가 요청한 게 아니라면 바로 비밀번호를 바꿔요.', isRequired: true },
        passwordStep,
        { title: '복구 이메일·전화번호 확인', description: '내 정보로 설정되어 있는지 확인해요.', isRequired: false },
      ],
      verification_code: [
        { title: '인증 코드 요청이 본인 활동인지 확인', description: '내가 요청한 게 아니라면 무시하고 비밀번호를 바꿔요.', isRequired: true },
        { title: '최근 로그인 기록 확인', description: '모르는 접속 기록이 있는지 확인해요.', isRequired: true },
      ],
      account_recovery: [
        { title: '복구 요청이 본인 활동인지 확인', description: '내가 요청한 게 아니라면 즉시 비밀번호를 바꿔요.', isRequired: true },
        passwordStep,
        { title: '복구 이메일·전화번호 재설정', description: '내 정보로 다시 설정해요.', isRequired: false },
      ],
      permission_grant: [
        { title: '연결된 앱·권한 목록 확인', description: '모르는 앱이 있으면 권한을 해제해요.', isRequired: true },
        { title: '모르는 앱 권한 해제', description: '사용하지 않거나 모르는 앱은 바로 해제해요.', isRequired: true },
        { title: '비밀번호 변경', description: '의심스러운 접근이 있었다면 비밀번호도 바꿔요.', isRequired: false },
      ],
      security_recommendation: [
        ...officialStep,
        { title: '보안 알림 확인', description: '공식 사이트에서 직접 보안 상태를 확인해요.', isRequired: false },
        { title: '2단계 인증 설정 확인', description: '2단계 인증이 켜져 있는지 확인해요.', isRequired: false },
      ],
    };

    return templates[riskType] ?? templates.security_recommendation;
  }
}
