import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

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
