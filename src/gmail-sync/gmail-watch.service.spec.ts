import { NotFoundException } from '@nestjs/common';
import { GmailReconnectRequiredError } from './gmail-api.errors';
import { GmailWatchService } from './gmail-watch.service';

describe('GmailWatchService', () => {
  it('stores watch baseline separately from the committed history cursor', async () => {
    const prisma = {
      gmailAccount: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const result = {
      historyId: '200',
      expiration: new Date('2099-01-01T00:00:00.000Z'),
    };
    const api = { watch: jest.fn().mockResolvedValue(result) } as any;
    const service = new GmailWatchService(prisma, api);

    await expect(service.bootstrap('gmail-1')).resolves.toEqual(result);
    expect(prisma.gmailAccount.update).toHaveBeenCalledWith({
      where: { id: 'gmail-1' },
      data: {
        watchStatus: 'active',
        watchHistoryId: '200',
        watchExpiration: result.expiration,
        watchLastRenewedAt: expect.any(Date),
      },
    });
  });

  it('does not replace reconnect_required with a generic renew error', async () => {
    const prisma = {
      gmailAccount: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    const api = {
      watch: jest
        .fn()
        .mockRejectedValue(new GmailReconnectRequiredError('gmail-1')),
    } as any;
    const service = new GmailWatchService(prisma, api);

    await expect(service.renew('gmail-1')).rejects.toBeInstanceOf(
      GmailReconnectRequiredError,
    );
    expect(prisma.gmailAccount.updateMany).toHaveBeenCalledTimes(1);
  });

  it('does not call Gmail for a disconnected or missing account', async () => {
    const prisma = {
      gmailAccount: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as any;
    const api = { watch: jest.fn() } as any;
    const service = new GmailWatchService(prisma, api);

    await expect(service.renew('gmail-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(api.watch).not.toHaveBeenCalled();
  });
});
