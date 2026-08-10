import { SecurityChatService } from './security-chat.service';

describe('SecurityChatService.startNewSession', () => {
  it('reports history only when an earlier message exists', async () => {
    const prisma = {
      securityChat: {
        upsert: jest.fn().mockResolvedValue({ id: 'chat-1' }),
      },
      securityChatSession: {
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
      },
      securityChatMessage: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new SecurityChatService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(service.startNewSession('user-1')).resolves.toEqual({
      hasHistory: false,
    });
    expect(prisma.securityChatMessage.count).toHaveBeenCalledWith({
      where: {
        chatId: 'chat-1',
        createdAt: { lt: expect.any(Date) },
      },
    });

    prisma.securityChatMessage.count.mockResolvedValue(1);
    await expect(service.startNewSession('user-1')).resolves.toEqual({
      hasHistory: true,
    });
  });
});
