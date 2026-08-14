import { BadRequestException } from '@nestjs/common';

const HISTORY_ID_PATTERN = /^\d{1,32}$/;

export function assertGmailHistoryId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !HISTORY_ID_PATTERN.test(value)) {
    throw new BadRequestException('유효하지 않은 Gmail historyId입니다.');
  }
}

export function maxHistoryId(
  current: string | null | undefined,
  candidate: string | null | undefined,
): string | null {
  if (!current && !candidate) return null;
  if (!current) {
    assertGmailHistoryId(candidate);
    return candidate;
  }
  if (!candidate) {
    assertGmailHistoryId(current);
    return current;
  }
  assertGmailHistoryId(current);
  assertGmailHistoryId(candidate);
  return BigInt(candidate) > BigInt(current) ? candidate : current;
}

export function assertForwardCursor(expected: string | null, next: string) {
  assertGmailHistoryId(next);
  if (expected != null) {
    assertGmailHistoryId(expected);
    if (BigInt(next) < BigInt(expected)) {
      throw new BadRequestException(
        'Gmail history cursor는 역행할 수 없습니다.',
      );
    }
  }
}
