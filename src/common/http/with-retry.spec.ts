import { withRetry } from './with-retry';

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries retryable status then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValueOnce('ok');

    await expect(
      withRetry(fn, { baseDelayMs: 1, maxAttempts: 3 }),
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const err = { response: { status: 400 } };
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])('does not retry auth status %s', async (status) => {
    const err = { response: { status } };
    const fn = jest.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient network codes by default', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ code: 'ECONNRESET' })
      .mockResolvedValueOnce('ok');

    await expect(
      withRetry(fn, { baseDelayMs: 1, maxAttempts: 3 }),
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts on persistent 503', async () => {
    const err = { response: { status: 503 } };
    const fn = jest.fn().mockRejectedValue(err);

    await expect(
      withRetry(fn, { baseDelayMs: 1, maxAttempts: 3 }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
