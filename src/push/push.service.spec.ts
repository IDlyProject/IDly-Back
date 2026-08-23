import { NotFoundException } from '@nestjs/common';
import { PushService } from './push.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { WebPushService } from './web-push.service';

describe('PushService', () => {
  let findUnique: jest.Mock;
  let upsert: jest.Mock;
  let findMany: jest.Mock;
  let deleteMany: jest.Mock;
  let updateMany: jest.Mock;
  let send: jest.Mock;
  let service: PushService;

  const dto = {
    name: '홍길동',
    phone: '01012345678',
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: 'pub', auth: 'secret' },
  };

  beforeEach(() => {
    findUnique = jest.fn();
    upsert = jest.fn().mockResolvedValue({});
    findMany = jest.fn().mockResolvedValue([]);
    deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    send = jest.fn().mockResolvedValue({ sent: 1, removed: 0 });

    service = new PushService(
      {
        waitlist: { findUnique },
        pushSubscription: { upsert, findMany, deleteMany, updateMany },
      } as unknown as PrismaService,
      { sendToSubscriptions: send } as unknown as WebPushService,
    );
  });

  describe('구독 등록', () => {
    it('이름·전화번호가 모두 맞으면 등록한다', async () => {
      findUnique.mockResolvedValue({ id: 'w1', name: '홍길동' });
      await expect(service.subscribe(dto)).resolves.toEqual({ status: 'subscribed' });
      expect(upsert.mock.calls[0][0].where).toEqual({ endpoint: dto.endpoint });
      expect(upsert.mock.calls[0][0].create.waitlistId).toBe('w1');
    });

    it('이름이 다르면 거절한다', async () => {
      findUnique.mockResolvedValue({ id: 'w1', name: '다른사람' });
      await expect(service.subscribe(dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('사전등록 건이 없으면 거절한다', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.subscribe(dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('전화번호 존재 여부를 응답으로 구분할 수 없다', async () => {
      findUnique.mockResolvedValue(null);
      const notFound = await service.subscribe(dto).catch((e: Error) => e.message);
      findUnique.mockResolvedValue({ id: 'w1', name: '다른사람' });
      const wrongName = await service.subscribe(dto).catch((e: Error) => e.message);
      expect(notFound).toBe(wrongName);
    });

    it('같은 기기에서 다시 호출해도 endpoint 기준으로 갱신한다', async () => {
      findUnique.mockResolvedValue({ id: 'w1', name: '홍길동' });
      await service.subscribe(dto);
      await service.subscribe(dto);
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(upsert.mock.calls[1][0].where).toEqual({ endpoint: dto.endpoint });
    });
  });

  describe('승인 알림', () => {
    it('구독이 없으면 발송하지 않는다', async () => {
      findMany.mockResolvedValue([]);
      await service.notifyWaitlistApproved('w1');
      expect(send).not.toHaveBeenCalled();
    });

    it('알림 본문에 접근 토큰을 담지 않는다', async () => {
      findMany.mockResolvedValue([
        { id: 's1', endpoint: 'e', p256dh: 'p', auth: 'a' },
      ]);
      await service.notifyWaitlistApproved('w1');
      const payload = JSON.stringify(send.mock.calls[0][1]);
      expect(payload).not.toMatch(/token/i);
      expect(send.mock.calls[0][1].path).toBe('/');
    });
  });

  describe('구독 해제', () => {
    it('없는 구독을 해제해도 성공으로 처리한다', async () => {
      await expect(service.unsubscribe('없는-endpoint')).resolves.toEqual({
        status: 'unsubscribed',
      });
    });
  });
});
