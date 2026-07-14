import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { PrismaService } from '../prisma/prisma.service';
import { GmailService } from '../gmail/gmail.service';

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

interface ActionTemplateItem {
  label: string;
  isRequired: boolean;
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailService: GmailService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async triggerAnalysis(userId: string): Promise<{ runId: string }> {
    const run = await this.prisma.analysisRun.create({
      data: { userId, status: 'queued' },
    });

    this.runAnalysis(run.id, userId).catch((e) =>
      this.logger.error(`Analysis ${run.id} failed: ${e.message}`),
    );

    return { runId: run.id };
  }

  async getRunStatus(runId: string, userId: string) {
    return this.prisma.analysisRun.findFirst({
      where: { id: runId, userId },
    });
  }

  private async runAnalysis(runId: string, userId: string) {
    await this.prisma.analysisRun.update({
      where: { id: runId },
      data: { status: 'scanning' },
    });

    try {
      const accounts = await this.prisma.gmailAccount.findMany({
        where: { userId },
      });

      for (const account of accounts) {
        this.logger.log(`[${account.email}] 전체 .mbox fetch 시작`);

        const { mbox, count, sizeBytes } = await this.gmailService.fetchAllEmailsAsMbox(account.id);

        if (count === 0) {
          this.logger.warn(`[${account.email}] 메일 없음, 건너뜀`);
          continue;
        }

        this.logger.log(`[${account.email}] 전체 ${count}개, ${sizeBytes} bytes → AI 서버 전송 중`);

        const analysisResult = await this.uploadMboxToAI(account.email, mbox);

        await this.saveAnalysisResult(account.id, analysisResult);
      }

      await this.prisma.analysisRun.update({
        where: { id: runId },
        data: { status: 'completed', completedAt: new Date() },
      });
    } catch (e) {
      this.logger.error(`Analysis ${runId} 실패: ${e.message}`);
      await this.prisma.analysisRun.update({
        where: { id: runId },
        data: { status: 'failed' },
      });
      throw e;
    }
  }

  /**
   * .mbox 파일을 multipart/form-data로 AI 서버에 업로드
   * AI 서버는 POST /analyze 엔드포인트에서 수신
   */
  private async uploadMboxToAI(email: string, mbox: Buffer): Promise<AiAnalyzeResponse> {
    const aiUrl = this.config.get('AI_SERVER_URL', 'http://localhost:8000');

    const form = new FormData();
    form.append('file', mbox, {
      filename: `${email.replace('@', '_at_')}.mbox`,
      contentType: 'application/mbox',
    });

    const { data } = await firstValueFrom(
      this.httpService.post(`${aiUrl}/analyze`, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 10 * 60 * 1000, // 10분 타임아웃
      }),
    );

    return data;
  }

  /**
   * AI 결과를 DB에 저장
   *
   * AI 서버 응답 예시:
   * {
   *   accounts: [{
   *     account_id: "acct_...",
   *     account: "Disney+ 보안팀 <no-reply@disneyplus.com>",
   *     security_score: 6.2,
   *     security_level: "위험",
   *     interpretation: "새 로그인, 인증 코드, 보안 알림이 함께 관찰되었습니다.",
   *     problem_mails: [{ subject, date, body, matched_keywords }]
   *   }]
   * }
   */
  private async saveAnalysisResult(gmailAccountId: string, result: AiAnalyzeResponse) {
    for (const account of result?.accounts ?? []) {
      const serviceName = this.toServiceName(account.account);
      const riskStatus = this.toRiskStatus(account.security_level);
      const riskType = this.inferRiskType(account);
      const severity = this.toSeverity(account.security_level);

      const sa = await this.prisma.serviceAccount.upsert({
        where: { gmailAccountId_serviceName: { gmailAccountId, serviceName } },
        create: {
          gmailAccountId,
          serviceName,
          riskStatus,
          lastAnalyzedAt: new Date(),
        },
        update: {
          riskStatus,
          lastAnalyzedAt: new Date(),
        },
      });

      if (riskStatus !== 'safe') {
        const re = await this.prisma.riskEvent.create({
          data: {
            serviceAccountId: sa.id,
            riskType,
            severity,
            evidenceEmails: this.toEvidenceEmails(account),
          },
        });

        for (const action of this.getActionTemplate(riskType)) {
          await this.prisma.actionItem.create({
            data: {
              riskEventId: re.id,
              label: action.label,
              isRequired: action.isRequired ?? false,
            },
          });
        }
      }
    }
  }

  private toServiceName(account?: string): string {
    const cleaned = (account ?? '알 수 없는 서비스')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned.length > 0 ? cleaned : '알 수 없는 서비스';
  }

  private toRiskStatus(level?: string): 'safe' | 'warning' | 'danger' {
    if (level === '위험') return 'danger';
    if (level === '주의') return 'warning';
    return 'safe';
  }

  private toSeverity(level?: string): 'low' | 'medium' | 'high' {
    if (level === '위험') return 'high';
    if (level === '주의') return 'medium';
    return 'low';
  }

  private inferRiskType(account: AiAccountAnalysis): string {
    const haystack = [
      account.interpretation,
      ...(account.problem_mails ?? []).flatMap((mail) => [
        mail.subject,
        mail.matched_keywords,
        mail.body?.slice(0, 1000),
      ]),
    ]
      .filter(Boolean)
      .join('\n')
      .toLowerCase();

    if (this.includesAny(haystack, ['새 기기', '새 로그인', 'new device', 'new login', 'login'])) {
      return 'new_device_login';
    }
    if (this.includesAny(haystack, ['비밀번호 재설정', 'password reset', 'reset', 'recover', 'recovery', '복구'])) {
      return 'password_reset';
    }
    if (this.includesAny(haystack, ['인증 코드', 'verification code', 'otp', '인증번호', 'code'])) {
      return 'auth_code';
    }
    if (this.includesAny(haystack, ['계정 복구', 'account recovery'])) {
      return 'account_recovery';
    }
    if (this.includesAny(haystack, ['권한', 'permission', 'authorized app', '허용'])) {
      return 'permission_grant';
    }
    return 'security_notice';
  }

  private includesAny(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }

  private toEvidenceEmails(account: AiAccountAnalysis) {
    return (account.problem_mails ?? []).map((mail, index) => ({
      messageId: `${account.account_id ?? 'ai'}-${index}`,
      subject: mail.subject ?? '',
      from: this.toServiceName(account.account),
      date: mail.date ?? '',
      matchedKeywords: mail.matched_keywords ?? '',
      summary: account.interpretation ?? '',
    }));
  }

  private getActionTemplate(riskType: string): ActionTemplateItem[] {
    const common = [
      { label: '공식 앱 또는 공식 사이트에서 직접 확인', isRequired: false },
      { label: '비밀번호 변경', isRequired: true },
      { label: '2단계 인증 설정 확인', isRequired: false },
    ];

    const templates: Record<string, ActionTemplateItem[]> = {
      new_device_login: [
        { label: '공식 앱 또는 공식 사이트에서 직접 로그인 기록 확인', isRequired: false },
        { label: '새 비밀번호로 변경', isRequired: true },
        { label: '알 수 없는 기기 로그아웃', isRequired: true },
        { label: '같은 비밀번호를 쓰는 계정 점검', isRequired: false },
      ],
      password_reset: [
        { label: '비밀번호 재설정 요청이 본인 활동인지 확인', isRequired: true },
        { label: '새 비밀번호로 변경', isRequired: true },
        { label: '복구 이메일과 전화번호 확인', isRequired: false },
      ],
      auth_code: [
        { label: '인증 코드 요청이 본인 활동인지 확인', isRequired: true },
        { label: '최근 로그인 기록 확인', isRequired: true },
        { label: '비밀번호 변경', isRequired: false },
      ],
      account_recovery: [
        { label: '계정 복구 요청이 본인 활동인지 확인', isRequired: true },
        { label: '비밀번호 변경', isRequired: true },
        { label: '복구 이메일과 전화번호 재설정', isRequired: false },
      ],
      permission_grant: [
        { label: '연결된 앱과 권한 목록 확인', isRequired: true },
        { label: '모르는 앱 권한 해제', isRequired: true },
        { label: '비밀번호 변경', isRequired: false },
      ],
      security_notice: common,
    };

    return templates[riskType] ?? common;
  }
}
