import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService.updateProfile', () => {
  const encryptionKey = 'aWRseS1sb2NhbC1kZXYtcmVmcmVzaC10b2tlbi1rZXk=';

  function createService(prisma: any) {
    const config = { get: (key: string) => key === 'REFRESH_TOKEN_SECRET' ? encryptionKey : 'test' };
    return new UsersService(prisma, config as any);
  }

  it('프로필 필드만 전송 시 consent 로직을 건드리지 않는다', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({ id: 'user-a', name: '홍길동' });
    const prisma = { user: { findUniqueOrThrow: jest.fn(), update: mockUpdate } };
    const service = createService(prisma);

    await service.updateProfile('user-a', { name: '홍길동' });

    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'user-a' },
      data: { name: '홍길동' },
    });
  });

  it('requiredTermsAgreed 포함 시 최초 동의 시각을 새로 기록한다', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ requiredTermsAgreedAt: null }),
        update: mockUpdate,
      },
    };
    const service = createService(prisma);

    await service.updateProfile('user-a', {
      name: '홍길동',
      requiredTermsAgreed: true,
      notificationAgreed: true,
      marketingAgreed: false,
    });

    const callData = mockUpdate.mock.calls[0][0].data;
    expect(callData.requiredTermsAgreed).toBe(true);
    expect(callData.requiredTermsAgreedAt).toBeInstanceOf(Date);
    expect(callData.notificationAgreed).toBe(true);
    expect(callData.marketingAgreed).toBe(false);
  });

  it('이미 동의한 경우 requiredTermsAgreedAt을 기존 값으로 유지한다', async () => {
    const existing = new Date('2026-01-01');
    const mockUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ requiredTermsAgreedAt: existing }),
        update: mockUpdate,
      },
    };
    const service = createService(prisma);

    await service.updateProfile('user-a', { requiredTermsAgreed: true });

    const callData = mockUpdate.mock.calls[0][0].data;
    expect(callData.requiredTermsAgreedAt).toBe(existing);
  });
});

describe('UsersService.upsertFromGoogle ownership', () => {
  const encryptionKey = 'aWRseS1sb2NhbC1kZXYtcmVmcmVzaC10b2tlbi1rZXk=';

  function createService(prisma: any) {
    const config = {
      get: (key: string) =>
        key === 'REFRESH_TOKEN_SECRET' ? encryptionKey : 'test',
    };
    return new UsersService(prisma, config as any);
  }

  it('rejects adding a Gmail already linked to another user', async () => {
    const prisma = {
      gmailAccount: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'other@gmail.com',
          userId: 'user-b',
          user: { id: 'user-b' },
        }),
        update: jest.fn(),
      },
    };
    const service = createService(prisma);

    await expect(
      service.upsertFromGoogle({
        email: 'other@gmail.com',
        name: 'A',
        refreshToken: 'rt',
        addToUserId: 'user-a',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.gmailAccount.update).not.toHaveBeenCalled();
  });

  it('allows re-link for the same owner', async () => {
    const prisma = {
      gmailAccount: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'me@gmail.com',
          userId: 'user-a',
          user: { id: 'user-a' },
        }),
        update: jest.fn().mockResolvedValue({
          email: 'me@gmail.com',
          user: { id: 'user-a' },
        }),
      },
    };
    const service = createService(prisma);

    const result = await service.upsertFromGoogle({
      email: 'me@gmail.com',
      name: 'A',
      refreshToken: 'rt-new',
      addToUserId: 'user-a',
    });

    expect(result.user.id).toBe('user-a');
    expect(prisma.gmailAccount.update).toHaveBeenCalled();
  });

  it('hard deletes the user and keeps an anonymous withdrawal log', async () => {
    const tx = {
      withdrawalLog: {
        create: jest.fn().mockResolvedValue({ id: 'withdrawal-log-id' }),
      },
      user: {
        delete: jest.fn().mockResolvedValue({ id: 'user-a' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = createService(prisma);

    await expect(
      service.deleteAccount('user-a', {
        reason: 'other',
        reasonDetail: '테스트 사유',
      }),
    ).resolves.toEqual({ deleted: true });

    expect(tx.withdrawalLog.create).toHaveBeenCalledWith({
      data: {
        reason: 'other',
        reasonDetail: '테스트 사유',
      },
    });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'user-a' } });
  });

  it('does not keep reasonDetail for predefined withdrawal reasons', async () => {
    const tx = {
      withdrawalLog: {
        create: jest.fn().mockResolvedValue({ id: 'withdrawal-log-id' }),
      },
      user: {
        delete: jest.fn().mockResolvedValue({ id: 'user-a' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = createService(prisma);

    await service.deleteAccount('user-a', {
      reason: 'not_frequent',
      reasonDetail: '클라이언트가 잘못 보낸 값',
    });

    expect(tx.withdrawalLog.create).toHaveBeenCalledWith({
      data: {
        reason: 'not_frequent',
        reasonDetail: null,
      },
    });
  });
});
