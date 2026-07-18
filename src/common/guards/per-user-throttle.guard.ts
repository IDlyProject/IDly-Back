import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface BucketEntry {
  count: number;
  resetAt: number;
}

/**
 * Per-user in-memory rate limiter.
 * Suitable for single-instance deployments (Render).
 */
@Injectable()
export class PerUserThrottleGuard implements CanActivate {
  private readonly buckets = new Map<string, BucketEntry>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = 10, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.sub;
    if (!userId) return true;

    const now = Date.now();
    const bucket = this.buckets.get(userId);

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(userId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (bucket.count >= this.limit) {
      throw new HttpException('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', HttpStatus.TOO_MANY_REQUESTS);
    }

    bucket.count++;
    return true;
  }
}
