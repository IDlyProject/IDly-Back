import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GmailApiAdapter } from './gmail-api.adapter';
import {
  GmailHistoryCursorExpiredError,
  GmailReconnectRequiredError,
} from './gmail-api.errors';
import {
  GMAIL_INCREMENTAL_PROCESSOR,
  GmailIncrementalProcessor,
} from './gmail-incremental-processor';
import { GmailSyncQueueService } from './gmail-sync-queue.service';
import { GmailWatchService } from './gmail-watch.service';

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000;

@Injectable()
export class GmailSyncWorkerService {
  private readonly logger = new Logger(GmailSyncWorkerService.name);
  private readonly workerId = randomUUID();
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly queue: GmailSyncQueueService,
    private readonly gmailApi: GmailApiAdapter,
    private readonly watches: GmailWatchService,
    @Optional()
    @Inject(GMAIL_INCREMENTAL_PROCESSOR)
    private readonly processor: GmailIncrementalProcessor | null,
  ) {}

  @Interval(5_000)
  async runNext(): Promise<void> {
    if (!this.enabled()) return;
    if (this.running) return;
    this.running = true;
    try {
      await this._runNext();
    } finally {
      this.running = false;
    }
  }

  private async _runNext(): Promise<void> {
    const job = await this.queue.claimNext(this.workerId);
    if (!job) return;

    const account = await this.prisma.gmailAccount.findUnique({
      where: { id: job.gmailAccountId },
      select: { historyId: true },
    });
    if (!account) {
      await this.queue.failJob(
        job.id,
        job.gmailAccountId,
        this.workerId,
        'account_not_found',
      );
      return;
    }

    if (!account.historyId) {
      await this.bootstrapWatch(job.id, job.gmailAccountId);
      return;
    }

    try {
      const delta = await this.gmailApi.listHistory(
        job.gmailAccountId,
        account.historyId,
      );

      if (this.processor) {
        await this.processor.process({
          gmailAccountId: job.gmailAccountId,
          jobId: job.id,
          expectedHistoryId: account.historyId,
          delta,
        });
      }

      await this.queue.commitCursor({
        jobId: job.id,
        gmailAccountId: job.gmailAccountId,
        workerId: this.workerId,
        expectedHistoryId: account.historyId,
        nextHistoryId: delta.historyId,
      });
    } catch (error) {
      this.logger.error(
        `[workerId=${this.workerId}] [jobId=${job.id}] sync failed: ${this.message(error)}`,
      );
      if (error instanceof GmailHistoryCursorExpiredError) {
        await this.reconcileExpiredCursor(job.id, job.gmailAccountId);
      } else if (error instanceof GmailReconnectRequiredError) {
        await this.queue.failJob(
          job.id,
          job.gmailAccountId,
          this.workerId,
          'reconnect_required',
        );
      } else {
        await this.scheduleRetry(
          job.id,
          job.gmailAccountId,
          job.attemptCount,
        );
      }
    }
  }

  private async bootstrapWatch(
    jobId: string,
    gmailAccountId: string,
  ): Promise<void> {
    try {
      const result = await this.watches.renew(gmailAccountId);
      await this.queue.commitCursorReset({
        jobId,
        gmailAccountId,
        workerId: this.workerId,
        newHistoryId: result.historyId,
      });
      this.logger.log(
        `[workerId=${this.workerId}] [jobId=${jobId}] watch bootstrap → historyId=${result.historyId}`,
      );
    } catch (error) {
      this.logger.error(
        `[workerId=${this.workerId}] [jobId=${jobId}] bootstrap failed: ${this.message(error)}`,
      );
      await this.queue.failJob(
        jobId,
        gmailAccountId,
        this.workerId,
        'bootstrap_failed',
      );
    }
  }

  private async reconcileExpiredCursor(
    jobId: string,
    gmailAccountId: string,
  ): Promise<void> {
    try {
      const result = await this.watches.renew(gmailAccountId);
      await this.queue.commitCursorReset({
        jobId,
        gmailAccountId,
        workerId: this.workerId,
        newHistoryId: result.historyId,
      });
      this.logger.warn(
        `[workerId=${this.workerId}] [jobId=${jobId}] cursor expired → reset to ${result.historyId}`,
      );
    } catch (error) {
      this.logger.error(
        `[workerId=${this.workerId}] [jobId=${jobId}] reconcile failed: ${this.message(error)}`,
      );
      await this.queue.failJob(
        jobId,
        gmailAccountId,
        this.workerId,
        'reconcile_failed',
      );
    }
  }

  private async scheduleRetry(
    jobId: string,
    gmailAccountId: string,
    attemptCount: number,
  ): Promise<void> {
    if (attemptCount >= MAX_ATTEMPTS) {
      await this.queue.failJob(
        jobId,
        gmailAccountId,
        this.workerId,
        'max_attempts_exceeded',
      );
      return;
    }
    const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attemptCount - 1);
    const availableAt = new Date(Date.now() + backoffMs);
    await this.queue.retry(jobId, this.workerId, 'transient', availableAt);
  }

  private enabled() {
    return this.config.get<string>('GMAIL_PUSH_ENABLED') === 'true';
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 200) : 'unknown';
  }
}
