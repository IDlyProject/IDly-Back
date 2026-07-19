/**
 * 외부 HTTP/SDK 호출용 재시도 헬퍼.
 * API 응답 스키마와 무관 — 호출 성공/실패 결과만 그대로 전파한다.
 */
export type RetryableStatusResolver = (
  err: unknown,
) => number | string | undefined;

const defaultStatus: RetryableStatusResolver = (err) => {
  const e = err as {
    response?: { status?: number };
    code?: number | string;
    status?: number;
  };
  return e?.response?.status ?? e?.status ?? e?.code;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    /** 재시도 대상 HTTP status / network code (기본 429, 500, 502, 503, 504 + transient network errors) */
    retryableStatuses?: Array<number | string>;
    resolveStatus?: RetryableStatusResolver;
  },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const retryable = new Set(
    options?.retryableStatuses ?? [
      429,
      500,
      502,
      503,
      504,
      'ECONNRESET',
      'ETIMEDOUT',
      'EAI_AGAIN',
    ],
  );
  const resolveStatus = options?.resolveStatus ?? defaultStatus;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status = resolveStatus(err);
      const canRetry =
        status !== undefined && retryable.has(status) && attempt < maxAttempts;
      if (!canRetry) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('withRetry: exhausted attempts');
}
