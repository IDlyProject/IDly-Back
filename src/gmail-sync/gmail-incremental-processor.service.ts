import { Injectable, Logger } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { AnalysisService } from '../analysis/analysis.service';
import { GmailService } from '../gmail/gmail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { GmailHistoryDelta } from './gmail-api.adapter';
import {
  GMAIL_INCREMENTAL_PROCESSOR,
  GmailIncrementalProcessor,
} from './gmail-incremental-processor';
import { NotificationService } from '../notification/notification.service';
import type { NewRiskAlert } from '../analysis/analysis.service';

@Injectable()
export class GmailIncrementalProcessorService
  implements GmailIncrementalProcessor
{
  private readonly logger = new Logger(GmailIncrementalProcessorService.name);

  constructor(
    private readonly gmailService: GmailService,
    private readonly analysisService: AnalysisService,
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async process(input: {
    gmailAccountId: string;
    jobId: string;
    expectedHistoryId: string | null;
    delta: GmailHistoryDelta;
  }): Promise<void> {
    const { gmailAccountId, delta } = input;

    const newIds = await this.filterUnprocessed(gmailAccountId, delta.messageIds);
    if (newIds.length === 0) {
      this.logger.debug(`[gmailAccountId=${gmailAccountId}] 새 메일 없음 — cursor만 전진`);
      return;
    }

    this.logger.log(`[gmailAccountId=${gmailAccountId}] 새 메일 ${newIds.length}개 분석 시작`);

    const { tmpPath, lastEmailDate } =
      await this.gmailService.fetchMessagesByIdsAsMbox(gmailAccountId, newIds);

    let newRisks: NewRiskAlert[] = [];
    try {
      newRisks = await this.analysisService.analyzeAndSaveIncremental(
        gmailAccountId,
        tmpPath,
        lastEmailDate,
      );
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }

    await this.markProcessed(gmailAccountId, newIds);
    this.logger.log(`[gmailAccountId=${gmailAccountId}] 증분 분석 완료`);

    // 새로 확인된 보안 위험은 즉시 알림톡으로 알린다.
    // 알림 발송 실패가 동기화 커서 전진을 막지 않도록 여기서 삼킨다.
    if (newRisks.length > 0) {
      await this.notifyNewRisks(gmailAccountId, newRisks);
    }
  }

  /** 새 위험 알림 발송 — 실패해도 동기화 흐름에 영향을 주지 않는다. */
  private async notifyNewRisks(
    gmailAccountId: string,
    risks: NewRiskAlert[],
  ): Promise<void> {
    const account = await this.prisma.gmailAccount.findUnique({
      where: { id: gmailAccountId },
      select: { userId: true },
    });
    if (!account) return;

    for (const risk of risks) {
      try {
        await this.notification.sendSecurityAlert({
          userId: account.userId,
          serviceName: risk.serviceName,
          riskType: risk.riskType,
          serviceAccountId: risk.serviceAccountId,
        });
      } catch (e) {
        this.logger.error(
          `[gmailAccountId=${gmailAccountId}] 보안 알림 발송 실패 (${risk.serviceName}): ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }
  }

  private async filterUnprocessed(
    gmailAccountId: string,
    messageIds: string[],
  ): Promise<string[]> {
    if (messageIds.length === 0) return [];

    const already = await this.prisma.gmailProcessedMessage.findMany({
      where: { gmailAccountId, gmailMessageId: { in: messageIds } },
      select: { gmailMessageId: true },
    });
    const seen = new Set(already.map((r) => r.gmailMessageId));
    return messageIds.filter((id) => !seen.has(id));
  }

  private async markProcessed(
    gmailAccountId: string,
    messageIds: string[],
  ): Promise<void> {
    await this.prisma.gmailProcessedMessage.createMany({
      data: messageIds.map((gmailMessageId) => ({ gmailAccountId, gmailMessageId })),
      skipDuplicates: true,
    });
  }
}

export { GMAIL_INCREMENTAL_PROCESSOR };
