import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GmailPushEnvelopeDto } from './gmail-push.dto';

describe('GmailPushEnvelopeDto', () => {
  it('accepts optional fields from the real wrapped Pub/Sub payload', async () => {
    const dto = plainToInstance(GmailPushEnvelopeDto, {
      message: {
        messageId: 'message-1',
        data: Buffer.from('{}').toString('base64'),
        publishTime: '2026-08-11T00:00:00.000Z',
        attributes: { source: 'gmail' },
        orderingKey: 'account-1',
      },
      subscription: 'projects/p/subscriptions/s',
      deliveryAttempt: 2,
    });
    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
  });
});
