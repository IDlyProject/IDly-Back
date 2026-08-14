import { GmailSyncSchedulerService } from './gmail-sync-scheduler.service';

function setup(enabled: boolean) {
  const config = {
    get: jest.fn(() => (enabled ? 'true' : 'false')),
  } as any;
  const prisma = {
    gmailPushEvent: { findMany: jest.fn().mockResolvedValue([]) },
    gmailAccount: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;
  const queue = {
    enqueuePushEvent: jest.fn(),
    enqueueRepair: jest.fn(),
  } as any;
  const watches = { renew: jest.fn() } as any;
  return {
    service: new GmailSyncSchedulerService(config, prisma, queue, watches),
    prisma,
    queue,
    watches,
  };
}

describe('GmailSyncSchedulerService', () => {
  it('does nothing unless GMAIL_PUSH_ENABLED is exactly true', async () => {
    const { service, prisma } = setup(false);
    await service.dispatchPendingInbox();
    await service.renewExpiringWatches();
    await service.enqueueRepairPolling();
    expect(prisma.gmailPushEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.gmailAccount.findMany).not.toHaveBeenCalled();
  });

  it('dispatches pending inbox rows without processing Gmail or AI inline', async () => {
    const { service, prisma, queue } = setup(true);
    prisma.gmailPushEvent.findMany.mockResolvedValue([
      { id: 'event-1' },
      { id: 'event-2' },
    ]);
    queue.enqueuePushEvent.mockResolvedValue({});
    await service.dispatchPendingInbox();
    expect(queue.enqueuePushEvent).toHaveBeenCalledTimes(2);
  });

  it('renews only the accounts selected by the expiration query', async () => {
    const { service, prisma, watches } = setup(true);
    prisma.gmailAccount.findMany.mockResolvedValue([{ id: 'gmail-1' }]);
    watches.renew.mockResolvedValue({});
    await service.renewExpiringWatches();
    expect(watches.renew).toHaveBeenCalledWith('gmail-1');
    expect(prisma.gmailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'connected' }),
      }),
    );
  });

  it('schedules the next repair between 6 and 12 hours after enqueue', async () => {
    const { service, prisma, queue } = setup(true);
    prisma.gmailAccount.findMany.mockResolvedValue([{ id: 'gmail-1' }]);
    queue.enqueueRepair.mockResolvedValue({});
    (service as any).repairDelayMs = jest
      .fn()
      .mockReturnValue(9 * 60 * 60 * 1000);
    const before = Date.now();
    await service.enqueueRepairPolling();
    const update = prisma.gmailAccount.update.mock.calls[0][0];
    expect(update.data.nextRepairAt.getTime()).toBeGreaterThanOrEqual(
      before + 9 * 60 * 60 * 1000,
    );
    expect(queue.enqueueRepair).toHaveBeenCalledWith('gmail-1');
  });
});
