import { SecurityChatService } from './security-chat.service';

describe('SecurityChatService.startNewSession', () => {
  it('reports history only when an earlier message exists', async () => {
    const tx = {
      securityChat: {
        upsert: jest.fn().mockResolvedValue({ id: 'chat-1' }),
      },
      securityChatSession: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new SecurityChatService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(service.startNewSession('user-1')).resolves.toEqual({
      sessionId: 'session-1',
      hasHistory: false,
    });
    expect(tx.securityChatSession.count).toHaveBeenCalledWith({
      where: { chatId: 'chat-1', messages: { some: {} } },
    });

    tx.securityChatSession.count.mockResolvedValue(1);
    await expect(service.startNewSession('user-1')).resolves.toEqual({
      sessionId: 'session-1',
      hasHistory: true,
    });
  });
});
