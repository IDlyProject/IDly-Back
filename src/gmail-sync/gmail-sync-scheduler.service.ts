import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GmailSyncQueueService } from './gmail-sync-queue.service';
import { GmailWatchService } from './gmail-watch.service';

const DISPATCH_BATCH_SIZE = 50;
const MAINTENANCE_BATCH_SIZE = 100;

@Injectable()
export class GmailSyncSchedulerService {
  private readonly logger = new Logger(GmailSyncSchedulerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly queue: GmailSyncQueueService,
    private readonly watches: GmailWatchService,
  ) {}

  @Interval(30_000)
  async dispatchPendingInbox(): Promise<void> {
    if (!this.enabled()) return;
    const events = await this.prisma.gmailPushEvent.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: DISPATCH_BATCH_SIZE,
      select: { id: true },
    });
    for (const event of events) {
      try {
        await this.queue.enqueuePushEvent(event.id);
      } catch (error) {
        this.logger.error(
          `[pushEventId=${event.id}] inbox dispatch failed: ${this.message(error)}`,
        );
      }
    }
  }

  @Cron('0 15 3 * * *', { timeZone: 'Asia/Seoul' })
  async renewExpiringWatches(): Promise<void> {
    if (!this.enabled()) return;
    const renewBefore = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const accounts = await this.prisma.gmailAccount.findMany({
      where: {
        status: 'connected',
        OR: [
          { watchStatus: { in: ['disabled', 'pending', 'renew_error'] } },
          { watchExpiration: null },
          { watchExpiration: { lte: renewBefore } },
        ],
      },
      orderBy: { watchExpiration: 'asc' },
      take: MAINTENANCE_BATCH_SIZE,
      select: { id: true },
    });
    for (const account of accounts) {
      try {
        await this.watches.renew(account.id);
      } catch (error) {
        this.logger.error(
          `[gmailAccountId=${account.id}] watch renew failed: ${this.message(error)}`,
        );
      }
    }
  }

  /** 매시간 due 계정을 찾되 다음 실행은 계정마다 6~12시간 jitter로 예약한다. */
  @Cron('0 0 * * * *')
  async enqueueRepairPolling(): Promise<void> {
    if (!this.enabled()) return;
    const now = new Date();
    const accounts = await this.prisma.gmailAccount.findMany({
      where: {
        status: 'connected',
        historyId: { not: null },
        OR: [{ nextRepairAt: null }, { nextRepairAt: { lte: now } }],
      },
      orderBy: { nextRepairAt: 'asc' },
      take: MAINTENANCE_BATCH_SIZE,
      select: { id: true },
    });

    for (const account of accounts) {
      try {
        await this.queue.enqueueRepair(account.id);
        await this.prisma.gmailAccount.update({
          where: { id: account.id },
          data: {
            nextRepairAt: new Date(now.getTime() + this.repairDelayMs()),
          },
        });
      } catch (error) {
        this.logger.error(
          `[gmailAccountId=${account.id}] repair enqueue failed: ${this.message(error)}`,
        );
      }
    }
  }

  /** 매일 새벽 4시 — 90일 이상 된 GmailProcessedMessage 정리 (무제한 증가 방지) */
  @Cron('0 0 4 * * *', { timeZone: 'Asia/Seoul' })
  async purgeOldProcessedMessages(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.gmailProcessedMessage.deleteMany({
      where: { processedAt: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`[purge] GmailProcessedMessage ${count}건 삭제 (90일 초과)`);
    }
  }

  private enabled() {
    return this.config.get<string>('GMAIL_PUSH_ENABLED') === 'true';
  }

  private repairDelayMs() {
    const hours = 6 + Math.random() * 6;
    return Math.floor(hours * 60 * 60 * 1000);
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 200) : 'unknown';
  }
}
