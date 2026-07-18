import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_META = 'idly:rate_limit';

export type RateLimitOptions = {
  /** max requests in window */
  limit: number;
  /** window length ms (default 60s) */
  windowMs?: number;
  /** bucket key strategy */
  key?: 'user' | 'ip' | 'user+ip';
};

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_META, options);
