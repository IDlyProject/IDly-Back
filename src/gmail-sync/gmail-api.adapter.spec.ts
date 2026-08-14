import { GmailApiAdapter } from './gmail-api.adapter';
import {
  GmailHistoryCursorExpiredError,
  GmailReconnectRequiredError,
} from './gmail-api.errors';

function createAdapter(configValues: Record<string, string> = {}) {
  const config = {
    get: jest.fn((key: string) => configValues[key]),
  } as any;
  const prisma = {
    gmailAccount: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  } as any;
  return { adapter: new GmailApiAdapter(config, prisma), prisma };
}

describe('GmailApiAdapter', () => {
  it('paginates messageAdded history and deduplicates message ids', async () => {
    const { adapter } = createAdapter();
    const list = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          history: [
            {
              messagesAdded: [
                { message: { id: 'm1' } },
                { message: { id: 'm2' } },
              ],
            },
          ],
          historyId: '101',
          nextPageToken: 'page-2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          history: [
            {
              messagesAdded: [
                { message: { id: 'm2' } },
                { message: { id: 'm3' } },
              ],
            },
          ],
          historyId: '102',
        },
      });
    (adapter as any).gmailForAccount = jest.fn().mockResolvedValue({
      users: { history: { list } },
    });

    await expect(adapter.listHistory('gmail-1', '100')).resolves.toEqual({
      messageIds: ['m1', 'm2', 'm3'],
      historyId: '102',
    });
    expect(list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        startHistoryId: '100',
        historyTypes: ['messageAdded'],
        pageToken: undefined,
      }),
    );
    expect(list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageToken: 'page-2' }),
    );
  });

  it('maps a history 404 to the typed cursor-expired error', async () => {
    const { adapter } = createAdapter();
    (adapter as any).gmailForAccount = jest.fn().mockResolvedValue({
      users: {
        history: {
          list: jest.fn().mockRejectedValue({ response: { status: 404 } }),
        },
      },
    });
    await expect(adapter.listHistory('gmail-1', '100')).rejects.toBeInstanceOf(
      GmailHistoryCursorExpiredError,
    );
  });

  it('marks the account reconnect_required on auth failure', async () => {
    const { adapter, prisma } = createAdapter();
    (adapter as any).gmailForAccount = jest.fn().mockResolvedValue({
      users: {
        history: {
          list: jest.fn().mockRejectedValue({ response: { status: 401 } }),
        },
      },
    });
    await expect(adapter.listHistory('gmail-1', '100')).rejects.toBeInstanceOf(
      GmailReconnectRequiredError,
    );
    expect(prisma.gmailAccount.updateMany).toHaveBeenCalledWith({
      where: { id: 'gmail-1' },
      data: {
        status: 'reconnect_required',
        watchStatus: 'reconnect_required',
      },
    });
  });

  it('builds a watch request and parses its baseline cursor and expiration', async () => {
    const { adapter } = createAdapter({
      GMAIL_PUBSUB_TOPIC: 'projects/project/topics/gmail',
    });
    const watch = jest.fn().mockResolvedValue({
      data: { historyId: '200', expiration: '4102444800000' },
    });
    (adapter as any).gmailForAccount = jest.fn().mockResolvedValue({
      users: { watch },
    });
    const result = await adapter.watch('gmail-1');
    expect(watch).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: { topicName: 'projects/project/topics/gmail' },
    });
    expect(result.historyId).toBe('200');
    expect(result.expiration).toEqual(new Date(4102444800000));
  });
});
