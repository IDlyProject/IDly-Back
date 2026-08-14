import { BadRequestException } from '@nestjs/common';
import {
  assertForwardCursor,
  assertGmailHistoryId,
  maxHistoryId,
} from './gmail-history-id';

describe('gmail history id', () => {
  it('compares history ids without converting them to unsafe Numbers', () => {
    expect(maxHistoryId('90071992547409930', '90071992547409931')).toBe(
      '90071992547409931',
    );
  });

  it('rejects malformed and backward cursors', () => {
    expect(() => assertGmailHistoryId('1e10')).toThrow(BadRequestException);
    expect(() => assertForwardCursor('101', '100')).toThrow(
      BadRequestException,
    );
  });
});
