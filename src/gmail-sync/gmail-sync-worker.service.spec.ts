import { GmailHistoryCursorExpiredError, GmailReconnectRequiredError } from './gmail-api.errors';
import { GmailSyncWorkerService } from './gmail-sync-worker.service';

function setup(opts: { enabled?: boolean; processor?: boolean } = {}) {
  const { enabled = true, processor: withProcessor = false } = opts;

  const config = { get: jest.fn(() => (enabled ? 'true' : 'false')) } as any;

  const prisma = {
    gmailAccount: { findUnique: jest.fn() },
  } as any;

  const queue = {
    claimNext: jest.fn(),
    commitCursor: jest.fn(),
    commitCursorReset: jest.fn(),
    failJob: jest.fn(),
    retry: jest.fn(),
  } as any;

  const gmailApi = { listHistory: jest.fn() } as any;
  const watches = { renew: jest.fn() } as any;
  const processor = withProcessor ? { process: jest.fn() } : null;

  const service = new GmailSyncWorkerService(
    config,
    prisma,
    queue,
    gmailApi,
    watches,
    processor,
  );

  return { service, config, prisma, queue, gmailApi, watches, processor };
}

const JOB = {
  id: 'job-1',
  gmailAccountId: 'gmail-1',
  trigger: 'push',
  attemptCount: 1,
  status: 'processing',
};

describe('GmailSyncWorkerService', () => {
  it('does nothing when GMAIL_PUSH_ENABLED is not true', async () => {
    const { service, queue } = setup({ enabled: false });
    await service.runNext();
    expect(queue.claimNext).not.toHaveBeenCalled();
  });

  it('does nothing when no job is available', async () => {
    const { service, queue } = setup();
    queue.claimNext.mockResolvedValue(null);
    await service.runNext();
    expect(queue.commitCursor).not.toHaveBeenCalled();
  });

  it('fails the job immediately if the account is missing', async () => {
    const { service, queue, prisma } = setup();
    queue.claimNext.mockResolvedValue(JOB);
    prisma.gmailAccount.findUnique.mockResolvedValue(null);

    await service.runNext();

    expect(queue.failJob).toHaveBeenCalledWith(
      JOB.id,
      JOB.gmailAccountId,
      expect.any(String),
      'account_not_found',
    );
  });

  it('bootstraps watch when account has no historyId', async () => {
    const { service, queue, prisma, watches } = setup();
    queue.claimNext.mockResolvedValue(JOB);
    prisma.gmailAccount.findUnique.mockResolvedValue({ historyId: null });
    watches.renew.mockResolvedValue({ historyId: '9000', expiration: new Date() });
    queue.commitCursorReset.mockResolvedValue(undefined);

    await service.runNext();

    expect(watches.renew).toHaveBeenCalledWith(JOB.gmailAccountId);
    expect(queue.commitCursorReset).toHaveBeenCalledWith(
      expect.objectContaining({ newHistoryId: '9000' }),
    );
  });

  it('commits cursor on successful incremental sync (no processor)', async () => {
    const { service, queue, prisma, gmailApi } = setup();
    queue.claimNext.mockResolvedValue(JOB);
    prisma.gmailAccount.findUnique.mockResolvedValue({ historyId: '5000' });
    gmailApi.listHistory.mockResolvedValue({ messageIds: ['m1'], historyId: '5100' });
    queue.commitCursor.mockResolvedValue(undefined);

    await service.runNext();

    expect(queue.commitCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedHistoryId: '5000',
        nextHistoryId: '5100',
      }),
    );
  });

  it('calls processor.process before committing cursor when processor is wired', async () => {
    const { service, queue, prisma, gmailApi, processor } = setup({
      processor: true,
    });
    queue.claimNext.mockResolvedValue(JOB);
    prisma.gmailAccount.findUnique.mockResolvedValue({ historyId: '5000' });
    gmailApi.listHistory.mockResolvedValue({ messageIds: ['m1'], historyId: '5100' });
    queue.commitCursor.mockResolvedValue(undefined);
    processor!.process.mockResolvedValue(undefined);

    await service.runNext();

    expect(processor!.process).toHaveBeenCalledWith(
      expect.objectContaining({
        gmailAccountId: JOB.gmailAccountId,
        expectedHistoryId: '5000',
      }),
    );
    expect(queue.commitCursor).toHaveBeenCalled();
  });

  it('reconciles cursor on GmailHistoryCursorExpiredError (404)', async () => {
    const { service, queue, prisma, gmailApi, watches } = setup();
    queue.claimNext.mockResolvedValue(JOB);
    prisma.gmailAccount.findUnique.mockResolvedValue({ historyId: '1234' });
    gmailApi.listHistory.mockRejectedValue(
      new GmailHistoryCursorExpiredError('1234'),
    );
    watches.renew.mockResolvedValue({ historyId: '9999', expiration: new Date() });
    queue.commitCursorReset.mockResolvedValue(undefined);

    await service.runNext();

    expect(watches.renew).toHaveBeenCalledWith(JOB.gmailAccountId);
    expect(queue.commitCursorReset).toHaveBeenCalledWith(
      expect.objectContaining({ newHistoryId: '9999' }),
    );
    expect(queue.failJob).not.toHaveBeenCalled();
  });

  it('fails the job as reconcile_failed when renew throws during reconciliation', async () => {
    const { service, queue, prisma, gmailApi, watches } = setup();
    queue.claimNext.mockResolvedValue(JOB);
    prisma.gmailAccount.findUnique.mockResolvedValue({ historyId: '1234' });
    gmailApi.listHistory.mockRejectedValue(
      new GmailHistoryCursorExpiredError('1234'),
    );
    watches.renew.mockRejectedValue(new Error('watch API down'));

    await service.runNext();

    expect(queue.failJob).toHaveBeenCalledWith(
      JOB.id,
      JOB.gmailAccountId,
      expect.any(String),
      'reconcile_failed',
    );
  });

  it('fails the job as reconnect_required on GmailReconnectRequiredError', async () => {
    const { service, queue, prisma, gmailApi } = setup();
    queue.claimNext.mockResolvedValue(JOB);
    prisma.gmailAccount.findUnique.mockResolvedValue({ historyId: '5000' });
    gmailApi.listHistory.mockRejectedValue(
      new GmailReconnectRequiredError(JOB.gmailAccountId),
    );

    await service.runNext();

    expect(queue.failJob).toHaveBeenCalledWith(
      JOB.id,
      JOB.gmailAccountId,
      expect.any(String),
      'reconnect_required',
    );
  });

  it('schedules exponential backoff retry on transient errors below MAX_ATTEMPTS', async () => {
    const { service, queue, prisma, gmailApi } = setup();
    const job = { ...JOB, attemptCount: 2 };
    queue.claimNext.mockResolvedValue(job);
    prisma.gmailAccount.findUnique.mockResolvedValue({ historyId: '5000' });
    gmailApi.listHistory.mockRejectedValue(new Error('network timeout'));
    queue.retry.mockResolvedValue(undefined);

    const before = Date.now();
    await service.runNext();

    expect(queue.retry).toHaveBeenCalledWith(
      job.id,
      expect.any(String),
      'transient',
      expect.any(Date),
    );
    const retryAt: Date = queue.retry.mock.calls[0][3];
    // 2nd attempt → backoff = 30s * 2^(2-1) = 60s
    expect(retryAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
  });

  it('marks job dead as max_attempts_exceeded when attemptCount >= MAX_ATTEMPTS', async () => {
    const { service, queue, prisma, gmailApi } = setup();
    const job = { ...JOB, attemptCount: 5 };
    queue.claimNext.mockResolvedValue(job);
    prisma.gmailAccount.findUnique.mockResolvedValue({ historyId: '5000' });
    gmailApi.listHistory.mockRejectedValue(new Error('persistent error'));

    await service.runNext();

    expect(queue.failJob).toHaveBeenCalledWith(
      job.id,
      job.gmailAccountId,
      expect.any(String),
      'max_attempts_exceeded',
    );
    expect(queue.retry).not.toHaveBeenCalled();
  });

  it('fails the job as bootstrap_failed when watch renew throws during bootstrap', async () => {
    const { service, queue, prisma, watches } = setup();
    queue.claimNext.mockResolvedValue(JOB);
    prisma.gmailAccount.findUnique.mockResolvedValue({ historyId: null });
    watches.renew.mockRejectedValue(new Error('GCP down'));

    await service.runNext();

    expect(queue.failJob).toHaveBeenCalledWith(
      JOB.id,
      JOB.gmailAccountId,
      expect.any(String),
      'bootstrap_failed',
    );
  });
});
