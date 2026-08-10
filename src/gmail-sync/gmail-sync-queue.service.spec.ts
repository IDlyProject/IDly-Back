import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GmailSyncQueueService } from './gmail-sync-queue.service';

const job = {
  id: 'job-1',
  gmailAccountId: 'gmail-1',
  trigger: 'manual',
  targetHistoryId: null,
  status: 'completed',
  createdAt: new Date(),
};

describe('GmailSyncQueueService', () => {
  it('deduplicates manual refreshes created during the 30 second window', async () => {
    const tx = {
      gmailSyncJob: {
        findFirst: jest.fn().mockResolvedValue(job),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new GmailSyncQueueService(prisma);

    await expect(service.enqueueSync('gmail-1', 'manual')).resolves.toEqual({
      job,
      deduplicated: true,
    });
    expect(tx.gmailSyncJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          gmailAccountId: 'gmail-1',
          trigger: 'manual',
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
  });

  it('coalesces a higher push history target into the active account job', async () => {
    const active = { ...job, status: 'pending', targetHistoryId: '100' };
    const updated = { ...active, targetHistoryId: '102' };
    const tx = {
      gmailSyncJob: {
        findFirst: jest.fn().mockResolvedValue(active),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new GmailSyncQueueService(prisma);

    await expect(
      service.enqueueSync('gmail-1', 'push', '102'),
    ).resolves.toEqual({ job: updated, deduplicated: true });
    expect(tx.gmailSyncJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { targetHistoryId: '102' } }),
    );
  });

  it('wakes a retry job immediately when a new push is coalesced', async () => {
    const active = { ...job, status: 'retry', targetHistoryId: '100' };
    const updated = { ...active, targetHistoryId: '101' };
    const tx = {
      gmailSyncJob: {
        findFirst: jest.fn().mockResolvedValue(active),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new GmailSyncQueueService(prisma);

    await service.enqueueSync('gmail-1', 'push', '101');
    expect(tx.gmailSyncJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          targetHistoryId: '101',
          availableAt: expect.any(Date),
        },
      }),
    );
  });

  it('coalesces the higher target after a concurrent P2002 race', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const active = { ...job, status: 'retry', targetHistoryId: '100' };
    const updated = { ...active, targetHistoryId: '105' };
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(duplicate),
      gmailSyncJob: {
        findFirst: jest.fn().mockResolvedValue(active),
        update: jest.fn().mockResolvedValue(updated),
      },
    } as any;
    const service = new GmailSyncQueueService(prisma);

    await expect(
      service.enqueueSync('gmail-1', 'push', '105'),
    ).resolves.toEqual({ job: updated, deduplicated: true });
    expect(prisma.gmailSyncJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          targetHistoryId: '105',
          availableAt: expect.any(Date),
        },
      }),
    );
  });

  it('commits persistence, cursor, sync timestamp and job completion atomically', async () => {
    const tx = {
      gmailAccount: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      gmailSyncJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new GmailSyncQueueService(prisma);
    const persist = jest.fn().mockResolvedValue(undefined);

    await service.commitCursor(
      {
        jobId: 'job-1',
        gmailAccountId: 'gmail-1',
        workerId: 'worker-1',
        expectedHistoryId: '100',
        nextHistoryId: '101',
        syncedAt: new Date('2026-08-11T00:00:00.000Z'),
      },
      persist,
    );

    expect(persist).toHaveBeenCalledWith(tx);
    expect(tx.gmailAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ historyId: '100' }),
        data: expect.objectContaining({
          historyId: '101',
          lastSyncedAt: new Date('2026-08-11T00:00:00.000Z'),
        }),
      }),
    );
    expect(tx.gmailSyncJob.updateMany).toHaveBeenCalled();
  });

  it('claims the job and account lease in one transaction', async () => {
    const claimedJob = {
      ...job,
      status: 'processing',
      trigger: 'push',
    };
    const tx = {
      gmailSyncJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(claimedJob),
      },
      gmailAccount: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      gmailSyncJob: {
        findMany: jest.fn().mockResolvedValue([{ id: 'job-1' }]),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new GmailSyncQueueService(prisma);

    await expect(service.claimNext('worker-1')).resolves.toEqual(claimedJob);
    expect(tx.gmailSyncJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ leaseOwner: 'worker-1' }),
      }),
    );
    expect(tx.gmailAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ syncLeaseOwner: 'worker-1' }),
      }),
    );
  });

  it('refuses cursor commit when the account CAS loses', async () => {
    const tx = {
      gmailAccount: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      gmailSyncJob: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new GmailSyncQueueService(prisma);

    await expect(
      service.commitCursor({
        jobId: 'job-1',
        gmailAccountId: 'gmail-1',
        workerId: 'worker-1',
        expectedHistoryId: '100',
        nextHistoryId: '101',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.gmailSyncJob.updateMany).not.toHaveBeenCalled();
  });

  it('extends the job and account lease atomically for long AI work', async () => {
    const tx = {
      gmailSyncJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      gmailAccount: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new GmailSyncQueueService(prisma);

    const leaseUntil = await service.extendLease(
      'job-1',
      'gmail-1',
      'worker-1',
      120_000,
    );

    expect(leaseUntil.getTime()).toBeGreaterThan(Date.now());
    expect(tx.gmailSyncJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { leaseUntil } }),
    );
    expect(tx.gmailAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { syncLeaseUntil: leaseUntil } }),
    );
  });
});
