import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_META, RateLimitOptions } from './rate-limit.decorator';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limiter (single-instance).
 * Use Redis-backed store before multi-instance horizontal scale.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_META,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!opts) return true;

    const limit = opts.limit;
    const windowMs = opts.windowMs ?? 60_000;
    const keyMode = opts.key ?? 'user+ip';
    const req = ctx.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.sub;
    const ip = clientIp(req);

    let bucketKey: string;
    if (keyMode === 'user') {
      if (!userId) return true;
      bucketKey = `u:${userId}`;
    } else if (keyMode === 'ip') {
      bucketKey = `ip:${ip}`;
    } else {
      bucketKey = userId ? `u:${userId}` : `ip:${ip}`;
    }

    // route-scoped
    const route = `${req.method}:${req.route?.path ?? req.url}`;
    bucketKey = `${bucketKey}:${route}`;

    const now = Date.now();
    const bucket = this.buckets.get(bucketKey);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      this.gc(now);
      return true;
    }
    if (bucket.count >= limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
          retryAfterMs: Math.max(0, bucket.resetAt - now),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.count += 1;
    return true;
  }

  private gc(now: number) {
    if (this.buckets.size < 5000) return;
    for (const [k, v] of this.buckets) {
      if (now >= v.resetAt) this.buckets.delete(k);
    }
  }
}

function clientIp(req: { ip?: string; headers?: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const xf = req.headers?.['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
