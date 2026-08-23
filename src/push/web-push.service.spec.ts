import { WebPushService } from './web-push.service';
import type { PrismaService } from '../prisma/prisma.service';

const sendNotification = jest.fn();
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

describe('WebPushService 발송', () => {
  let updateMany: jest.Mock;
  let deleteMany: jest.Mock;
  let service: WebPushService;

  const subs = [
    { id: 's1', endpoint: 'e1', p256dh: 'p', auth: 'a' },
    { id: 's2', endpoint: 'e2', p256dh: 'p', auth: 'a' },
    { id: 's3', endpoint: 'e3', p256dh: 'p', auth: 'a' },
  ];
  const payload = { title: 't', body: 'b', path: '/' };

  beforeEach(() => {
    sendNotification.mockReset();
    updateMany = jest.fn().mockResolvedValue({ count: 0 });
    deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    service = new WebPushService(
      {
        get: (k: string) =>
          ({
            VAPID_PUBLIC_KEY: 'pub',
            VAPID_PRIVATE_KEY: 'priv',
            VAPID_SUBJECT: 'mailto:a@b.c',
          })[k],
      } as never,
      { pushSubscription: { updateMany, deleteMany } } as unknown as PrismaService,
    );
  });

  it('성공한 구독만 lastSentAt을 갱신한다', async () => {
    sendNotification
      .mockResolvedValueOnce({})                                   // s1 성공
      .mockRejectedValueOnce({ statusCode: 410 })                  // s2 만료
      .mockRejectedValueOnce({ statusCode: 500, message: 'oops' }); // s3 일시 실패

    const result = await service.sendToSubscriptions(subs, payload);

    expect(result).toEqual({ sent: 1, removed: 1 });
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: { in: ['s1'] } });
  });

  it('만료된 구독(404/410)은 삭제한다', async () => {
    sendNotification
      .mockRejectedValueOnce({ statusCode: 404 })
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({});

    await service.sendToSubscriptions(subs, payload);

    expect(deleteMany.mock.calls[0][0].where).toEqual({ id: { in: ['s1', 's2'] } });
  });

  it('일시 실패는 구독을 지우지 않는다', async () => {
    sendNotification.mockRejectedValue({ statusCode: 500 });

    const result = await service.sendToSubscriptions(subs, payload);

    expect(result).toEqual({ sent: 0, removed: 0 });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
