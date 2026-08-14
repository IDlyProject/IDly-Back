import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertForwardCursor,
  assertGmailHistoryId,
  maxHistoryId,
} from './gmail-history-id';

export type GmailSyncTrigger =
  'push' | 'repair_poll' | 'manual' | 'watch_bootstrap';

const ACTIVE_JOB_STATUSES = ['pending', 'processing', 'retry'];
const MANUAL_DEDUPE_MS = 30_000;

type EnqueueResult = {
  job: {
    id: string;
    gmailAccountId: string;
    trigger: string;
    targetHistoryId: string | null;
    status: string;
    createdAt: Date;
  };
  deduplicated: boolean;
};

class LeaseUnavailableError extends Error {}

@Injectable()
export class GmailSyncQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueueManual(
    userId: string,
    gmailAccountId: string,
  ): Promise<EnqueueResult> {
    const account = await this.prisma.gmailAccount.findFirst({
      where: { id: gmailAccountId, userId, status: 'connected' },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('연결된 Gmail 계정을 찾을 수 없습니다.');
    }
    return this.enqueueSync(account.id, 'manual');
  }

  enqueueRepair(gmailAccountId: string): Promise<EnqueueResult> {
    return this.enqueueSync(gmailAccountId, 'repair_poll');
  }

  enqueueWatchBootstrap(gmailAccountId: string): Promise<EnqueueResult> {
    return this.enqueueSync(gmailAccountId, 'watch_bootstrap');
  }

  enqueuePush(
    gmailAccountId: string,
    targetHistoryId: string,
  ): Promise<EnqueueResult> {
    assertGmailHistoryId(targetHistoryId);
    return this.enqueueSync(gmailAccountId, 'push', targetHistoryId);
  }

  /** Pending inbox event를 worker/dispatcher가 sync job으로 승격한다. */
  async enqueuePushEvent(eventId: string): Promise<EnqueueResult> {
    const event = await this.prisma.gmailPushEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        gmailAccountId: true,
        notifiedHistoryId: true,
        status: true,
      },
    });
    if (!event) throw new NotFoundException('Gmail Push 이벤트가 없습니다.');

    const result = await this.enqueuePush(
      event.gmailAccountId,
      event.notifiedHistoryId,
    );
    await this.prisma.gmailPushEvent.updateMany({
      where: { id: event.id, status: 'pending' },
      data: { status: 'enqueued', processedAt: new Date() },
    });
    return result;
  }

  async enqueueSync(
    gmailAccountId: string,
    trigger: GmailSyncTrigger,
    targetHistoryId?: string,
  ): Promise<EnqueueResult> {
    if (targetHistoryId) assertGmailHistoryId(targetHistoryId);
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (trigger === 'manual') {
          const recentManual = await tx.gmailSyncJob.findFirst({
            where: {
              gmailAccountId,
              trigger: 'manual',
              createdAt: {
                gte: new Date(now.getTime() - MANUAL_DEDUPE_MS),
              },
            },
            orderBy: { createdAt: 'desc' },
            select: this.jobSelect(),
          });
          if (recentManual) {
            return { job: recentManual, deduplicated: true };
          }
        }

        const active = await tx.gmailSyncJob.findFirst({
          where: { gmailAccountId, status: { in: ACTIVE_JOB_STATUSES } },
          orderBy: { createdAt: 'asc' },
          select: this.jobSelect(),
        });
        if (active) {
          const update = this.coalesceUpdate(
            active,
            trigger,
            targetHistoryId,
            now,
          );
          if (update) {
            const updated = await tx.gmailSyncJob.update({
              where: { id: active.id },
              data: update,
              select: this.jobSelect(),
            });
            return { job: updated, deduplicated: true };
          }
          return { job: active, deduplicated: true };
        }

        const job = await tx.gmailSyncJob.create({
          data: {
            gmailAccountId,
            trigger,
            targetHistoryId: targetHistoryId ?? null,
          },
          select: this.jobSelect(),
        });
        return { job, deduplicated: false };
      });
    } catch (error) {
      // Partial unique index가 concurrent enqueue를 막은 경우 승자 job을 반환한다.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const active = await this.prisma.gmailSyncJob.findFirst({
          where: { gmailAccountId, status: { in: ACTIVE_JOB_STATUSES } },
          orderBy: { createdAt: 'asc' },
          select: this.jobSelect(),
        });
        if (active) {
          const update = this.coalesceUpdate(
            active,
            trigger,
            targetHistoryId,
            now,
          );
          const winner = update
            ? await this.prisma.gmailSyncJob.update({
                where: { id: active.id },
                data: update,
                select: this.jobSelect(),
              })
            : active;
          return { job: winner, deduplicated: true };
        }
      }
      throw error;
    }
  }

  /** Worker가 job과 Gmail account lease를 같은 transaction에서 획득한다. */
  async claimNext(workerId: string, leaseMs = 60_000) {
    const now = new Date();
    const candidates = await this.prisma.gmailSyncJob.findMany({
      where: {
        OR: [
          {
            status: { in: ['pending', 'retry'] },
            availableAt: { lte: now },
          },
          { status: 'processing', leaseUntil: { lt: now } },
        ],
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      take: 10,
      select: { id: true },
    });

    for (const candidate of candidates) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const leaseUntil = new Date(now.getTime() + leaseMs);
          const jobClaim = await tx.gmailSyncJob.updateMany({
            where: {
              id: candidate.id,
              OR: [
                {
                  status: { in: ['pending', 'retry'] },
                  availableAt: { lte: now },
                },
                { status: 'processing', leaseUntil: { lt: now } },
              ],
            },
            data: {
              status: 'processing',
              leaseOwner: workerId,
              leaseUntil,
              startedAt: now,
              attemptCount: { increment: 1 },
            },
          });
          if (jobClaim.count !== 1) throw new LeaseUnavailableError();

          const job = await tx.gmailSyncJob.findUniqueOrThrow({
            where: { id: candidate.id },
          });
          const accountClaim = await tx.gmailAccount.updateMany({
            where: {
              id: job.gmailAccountId,
              OR: [
                { syncLeaseUntil: null },
                { syncLeaseUntil: { lt: now } },
                { syncLeaseOwner: workerId },
              ],
            },
            data: { syncLeaseOwner: workerId, syncLeaseUntil: leaseUntil },
          });
          if (accountClaim.count !== 1) throw new LeaseUnavailableError();
          return job;
        });
      } catch (error) {
        if (error instanceof LeaseUnavailableError) continue;
        throw error;
      }
    }
    return null;
  }

  /**
   * AI/도메인 저장 callback과 cursor/job 완료를 한 transaction으로 묶는다.
   * callback 실패 또는 cursor CAS 실패 시 전부 rollback된다.
   */
  async commitCursor(
    input: {
      jobId: string;
      gmailAccountId: string;
      workerId: string;
      expectedHistoryId: string | null;
      nextHistoryId: string;
      syncedAt?: Date;
    },
    persist?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    assertForwardCursor(input.expectedHistoryId, input.nextHistoryId);
    const now = input.syncedAt ?? new Date();

    await this.prisma.$transaction(async (tx) => {
      if (persist) await persist(tx);

      const cursorCommit = await tx.gmailAccount.updateMany({
        where: {
          id: input.gmailAccountId,
          historyId: input.expectedHistoryId,
          syncLeaseOwner: input.workerId,
          syncLeaseUntil: { gt: now },
        },
        data: {
          historyId: input.nextHistoryId,
          lastSyncedAt: now,
          lastIncrementalSyncedAt: now,
          syncLeaseOwner: null,
          syncLeaseUntil: null,
        },
      });
      if (cursorCommit.count !== 1) {
        throw new ConflictException(
          'Gmail history cursor가 변경되었거나 lease가 만료되었습니다.',
        );
      }

      const jobCommit = await tx.gmailSyncJob.updateMany({
        where: {
          id: input.jobId,
          gmailAccountId: input.gmailAccountId,
          status: 'processing',
          leaseOwner: input.workerId,
        },
        data: {
          status: 'completed',
          completedAt: now,
          leaseOwner: null,
          leaseUntil: null,
          lastErrorCode: null,
        },
      });
      if (jobCommit.count !== 1) {
        throw new ConflictException(
          'Gmail sync job lease가 유효하지 않습니다.',
        );
      }
    });
  }

  async failJob(
    jobId: string,
    gmailAccountId: string,
    workerId: string,
    errorCode: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.gmailSyncJob.updateMany({
        where: { id: jobId, gmailAccountId, status: 'processing', leaseOwner: workerId },
        data: {
          status: 'dead',
          completedAt: now,
          leaseOwner: null,
          leaseUntil: null,
          lastErrorCode: errorCode.slice(0, 100),
        },
      });
      await tx.gmailAccount.updateMany({
        where: { id: gmailAccountId, syncLeaseOwner: workerId },
        data: { syncLeaseOwner: null, syncLeaseUntil: null },
      });
    });
  }

  /**
   * history cursor 404 또는 watch bootstrap 완료 시 계정 historyId를 새 값으로 리셋하고
   * job을 completed로 마감한다. cursor/job 양쪽 CAS가 모두 통과해야 commit된다.
   */
  async commitCursorReset(input: {
    jobId: string;
    gmailAccountId: string;
    workerId: string;
    newHistoryId: string;
  }): Promise<void> {
    assertGmailHistoryId(input.newHistoryId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const accountReset = await tx.gmailAccount.updateMany({
        where: {
          id: input.gmailAccountId,
          syncLeaseOwner: input.workerId,
          syncLeaseUntil: { gt: now },
        },
        data: { historyId: input.newHistoryId, syncLeaseOwner: null, syncLeaseUntil: null },
      });
      if (accountReset.count !== 1) {
        throw new ConflictException(
          'Gmail account lease가 만료되었거나 cursor reset이 불가합니다.',
        );
      }

      const jobDone = await tx.gmailSyncJob.updateMany({
        where: {
          id: input.jobId,
          gmailAccountId: input.gmailAccountId,
          status: 'processing',
          leaseOwner: input.workerId,
        },
        data: {
          status: 'completed',
          completedAt: now,
          leaseOwner: null,
          leaseUntil: null,
          lastErrorCode: 'cursor_reset',
        },
      });
      if (jobDone.count !== 1) {
        throw new ConflictException('Gmail sync job lease가 유효하지 않습니다.');
      }
    });
  }

  async retry(
    jobId: string,
    workerId: string,
    errorCode: string,
    availableAt: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.gmailSyncJob.findFirst({
        where: { id: jobId, status: 'processing', leaseOwner: workerId },
        select: { gmailAccountId: true },
      });
      if (!job) throw new ConflictException('Gmail sync job lease가 없습니다.');
      await tx.gmailSyncJob.update({
        where: { id: jobId },
        data: {
          status: 'retry',
          availableAt,
          leaseOwner: null,
          leaseUntil: null,
          lastErrorCode: errorCode.slice(0, 100),
        },
      });
      await tx.gmailAccount.updateMany({
        where: { id: job.gmailAccountId, syncLeaseOwner: workerId },
        data: { syncLeaseOwner: null, syncLeaseUntil: null },
      });
    });
  }

  /** 장시간 Gmail/AI 처리 중 job과 account lease를 함께 연장한다. */
  async extendLease(
    jobId: string,
    gmailAccountId: string,
    workerId: string,
    leaseMs = 60_000,
  ): Promise<Date> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseMs);

    await this.prisma.$transaction(async (tx) => {
      const job = await tx.gmailSyncJob.updateMany({
        where: {
          id: jobId,
          gmailAccountId,
          status: 'processing',
          leaseOwner: workerId,
          leaseUntil: { gt: now },
        },
        data: { leaseUntil },
      });
      if (job.count !== 1) {
        throw new ConflictException(
          'Gmail sync job lease를 연장할 수 없습니다.',
        );
      }

      const account = await tx.gmailAccount.updateMany({
        where: {
          id: gmailAccountId,
          syncLeaseOwner: workerId,
          syncLeaseUntil: { gt: now },
        },
        data: { syncLeaseUntil: leaseUntil },
      });
      if (account.count !== 1) {
        throw new ConflictException(
          'Gmail account lease를 연장할 수 없습니다.',
        );
      }
    });

    return leaseUntil;
  }

  private jobSelect() {
    return {
      id: true,
      gmailAccountId: true,
      trigger: true,
      targetHistoryId: true,
      status: true,
      createdAt: true,
    } as const;
  }

  private coalesceUpdate(
    active: { status: string; targetHistoryId: string | null },
    trigger: GmailSyncTrigger,
    targetHistoryId: string | undefined,
    now: Date,
  ) {
    const nextTarget = maxHistoryId(active.targetHistoryId, targetHistoryId);
    const shouldWakeRetry = trigger === 'push' && active.status === 'retry';
    if (nextTarget === active.targetHistoryId && !shouldWakeRetry) return null;
    return {
      ...(nextTarget !== active.targetHistoryId
        ? { targetHistoryId: nextTarget }
        : {}),
      ...(shouldWakeRetry ? { availableAt: now } : {}),
    };
  }
}
