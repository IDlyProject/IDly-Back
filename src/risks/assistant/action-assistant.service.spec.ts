import {
  ActionAssistantService,
  calcProgress,
} from './action-assistant.service';

describe('calcProgress', () => {
  it('excludes skipped actions from completion progress', () => {
    const progress = calcProgress([
      { id: 'done', status: 'done' },
      { id: 'removed', status: 'skipped' },
    ] as never);

    expect(progress).toEqual({
      doneCount: 1,
      totalRequired: 1,
      label: '모두 완료',
    });
  });
});

describe('ActionAssistantService completion transaction', () => {
  const pendingItem = {
    id: 'action-1',
    serviceAccountId: 'sa-1',
    type: 'change_password',
    title: '비밀번호 변경',
    description: null,
    why: null,
    isRequired: true,
    externalUrl: null,
    order: 0,
    status: 'pending',
  };

  function createFixture(sessionClaimCount: number) {
    let messageSequence = 0;
    const tx = {
      actionSession: {
        updateMany: jest.fn().mockResolvedValue({ count: sessionClaimCount }),
      },
      actionItem: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      actionAttempt: { create: jest.fn().mockResolvedValue({}) },
      serviceAccount: { update: jest.fn().mockResolvedValue({}) },
      analysisRun: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      actionMessage: {
        create: jest.fn(({ data }) =>
          Promise.resolve({
            id: `message-${++messageSequence}`,
            metadata: null,
            createdAt: data.createdAt ?? new Date(),
            ...data,
          }),
        ),
      },
    };
    const prisma = {
      serviceAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sa-1',
          serviceName: 'Twitter',
          displayName: 'Twitter',
          primaryRiskType: null,
          gmailAccount: { userId: 'user-1' },
        }),
      },
      actionSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'session-1',
          serviceAccountId: 'sa-1',
          status: 'active',
          activeActionItemId: 'action-1',
          feedbackEnabled: true,
          composerEnabled: false,
          composerPlaceholder: null,
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'session-1',
          status: 'completed',
          activeActionItemId: null,
          feedbackEnabled: false,
          composerEnabled: false,
          composerPlaceholder: null,
        }),
      },
      actionItem: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([pendingItem])
          .mockResolvedValueOnce([{ ...pendingItem, status: 'done' }]),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };

    return {
      service: new ActionAssistantService(
        prisma as never,
        {} as never,
        {} as never,
      ),
      tx,
    };
  }

  it('commits the session claim and account completion together', async () => {
    const { service, tx } = createFixture(1);

    const result = await service.sendMessage('sa-1', 'user-1', {
      sessionId: 'session-1',
      type: 'feedback',
      feedbackValue: 'completed',
    });

    expect(result.sessionStatus).toBe('completed');
    expect(tx.actionSession.updateMany).toHaveBeenCalled();
    expect(tx.actionItem.updateMany).toHaveBeenCalled();
    expect(tx.serviceAccount.update).toHaveBeenCalled();
    expect(tx.actionMessage.create).toHaveBeenCalled();
  });

  it('rejects a duplicate completion before mutating the action', async () => {
    const { service, tx } = createFixture(0);

    await expect(
      service.sendMessage('sa-1', 'user-1', {
        sessionId: 'session-1',
        type: 'feedback',
        feedbackValue: 'completed',
      }),
    ).rejects.toThrow('이미 처리된 조치 요청입니다.');
    expect(tx.actionItem.updateMany).not.toHaveBeenCalled();
  });
});
