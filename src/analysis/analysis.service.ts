import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { PrismaService } from '../prisma/prisma.service';
import { GmailService } from '../gmail/gmail.service';

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
        this.logger.log(`[${account.email}] .mbox fetch 시작`);

        const { mbox, count } = await this.gmailService.fetchAllEmailsAsMbox(account.id);

        if (count === 0) {
          this.logger.warn(`[${account.email}] 메일 없음, 건너뜀`);
          continue;
        }

        this.logger.log(`[${account.email}] ${count}개 → AI 서버 전송 중`);

        const analysisResult = await this.uploadMboxToAI(account.id, account.email, mbox);

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
  private async uploadMboxToAI(gmailAccountId: string, email: string, mbox: Buffer): Promise<any> {
    const aiUrl = this.config.get('AI_SERVER_URL', 'http://localhost:8000');

    const form = new FormData();
    form.append('mbox', mbox, {
      filename: `${email.replace('@', '_at_')}.mbox`,
      contentType: 'application/mbox',
    });
    form.append('gmailAccountId', gmailAccountId);
    form.append('email', email);

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
   *   services: [{
   *     name: "Disney+",
   *     riskStatus: "danger",
   *     riskType: "new_device_login",
   *     severity: "high",
   *     signals: [{ messageId, subject, from, date, snippet }],
   *     actions: [{ label: "비밀번호 변경", isRequired: true }]
   *   }]
   * }
   */
  private async saveAnalysisResult(gmailAccountId: string, result: any) {
    for (const svc of result?.services ?? []) {
      const sa = await this.prisma.serviceAccount.upsert({
        where: { gmailAccountId_serviceName: { gmailAccountId, serviceName: svc.name } },
        create: {
          gmailAccountId,
          serviceName: svc.name,
          riskStatus: svc.riskStatus ?? 'safe',
          lastAnalyzedAt: new Date(),
        },
        update: {
          riskStatus: svc.riskStatus ?? 'safe',
          lastAnalyzedAt: new Date(),
        },
      });

      if (svc.riskStatus !== 'safe' && svc.riskType) {
        const re = await this.prisma.riskEvent.create({
          data: {
            serviceAccountId: sa.id,
            riskType: svc.riskType,
            severity: svc.severity ?? 'medium',
            evidenceEmails: svc.signals ?? [],
          },
        });

        for (const action of svc.actions ?? []) {
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
}
