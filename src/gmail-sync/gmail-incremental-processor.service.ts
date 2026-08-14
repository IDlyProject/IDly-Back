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

@Injectable()
export class GmailIncrementalProcessorService
  implements GmailIncrementalProcessor
{
  private readonly logger = new Logger(GmailIncrementalProcessorService.name);

  constructor(
    private readonly gmailService: GmailService,
    private readonly analysisService: AnalysisService,
    private readonly prisma: PrismaService,
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

    try {
      await this.analysisService.analyzeAndSaveIncremental(
        gmailAccountId,
        tmpPath,
        lastEmailDate,
      );
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }

    await this.markProcessed(gmailAccountId, newIds);
    this.logger.log(`[gmailAccountId=${gmailAccountId}] 증분 분석 완료`);
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
