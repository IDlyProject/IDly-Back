import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GmailPushInboxService } from './gmail-push-inbox.service';

const envelope = (data: unknown, messageId = 'pubsub-1') => ({
  message: {
    messageId,
    data: Buffer.from(JSON.stringify(data)).toString('base64'),
    publishTime: '2026-08-11T00:00:00.000Z',
  },
});

describe('GmailPushInboxService', () => {
  it('stores a validated push before it can be acknowledged', async () => {
    const tx = {
      gmailPushEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
      gmailAccount: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      gmailAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'gmail-1' }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new GmailPushInboxService(prisma);

    await expect(
      service.record(
        envelope({
          emailAddress: 'owner@example.com',
          historyId: '90071992547409931',
        }),
      ),
    ).resolves.toEqual({ status: 'stored', eventId: 'event-1' });
    expect(tx.gmailPushEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pubsubMessageId: 'pubsub-1',
          gmailAccountId: 'gmail-1',
          notifiedHistoryId: '90071992547409931',
        }),
      }),
    );
  });

  it('acknowledges unknown accounts without storing personal payload data', async () => {
    const prisma = {
      gmailAccount: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    } as any;
    const service = new GmailPushInboxService(prisma);

    await expect(
      service.record(
        envelope({ emailAddress: 'unknown@example.com', historyId: '12' }),
      ),
    ).resolves.toEqual({ status: 'ignored_unknown_account' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats a unique Pub/Sub message conflict as a harmless duplicate', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const prisma = {
      gmailAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'gmail-1' }),
      },
      $transaction: jest.fn().mockRejectedValue(duplicate),
    } as any;
    const service = new GmailPushInboxService(prisma);

    await expect(
      service.record(
        envelope({ emailAddress: 'owner@example.com', historyId: '12' }),
      ),
    ).resolves.toEqual({ status: 'duplicate' });
  });

  it('rejects malformed history ids', async () => {
    const prisma = {
      gmailAccount: { findFirst: jest.fn() },
    } as any;
    const service = new GmailPushInboxService(prisma);

    await expect(
      service.record(
        envelope({ emailAddress: 'owner@example.com', historyId: 12 }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
