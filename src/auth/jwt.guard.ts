import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export type AuthUser = {
  sub: string;
  email?: string;
  jti?: string;
};

const USER_CACHE_TTL_MS = 60_000;
const USER_CACHE_MAX = 1000;

@Injectable()
export class JwtGuard implements CanActivate {
  // userId → 캐시 만료시각. 팬텀 JWT 차단을 위한 DB 조회를 TTL 이내 재요청에서 생략한다.
  private readonly userCache = new Map<string, number>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    const cookieToken = (req as any).cookies?.['idly_token'];
    const token = bearerToken ?? cookieToken;

    if (!token) {
      throw new UnauthorizedException('토큰이 없습니다.');
    }

    if (!bearerToken && this.isUnsafeMethod(req.method)) {
      this.assertTrustedBrowserOrigin(req);
    }

    let payload: AuthUser;
    try {
      payload = this.jwtService.verify(token) as AuthUser;
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    if (!payload?.sub) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    // 팬텀 JWT 차단 — DB에 존재하는 유저만 허용 (TTL 캐시로 중복 쿼리 최소화)
    if (!this.isUserCached(payload.sub)) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true },
      });
      if (!user) {
        throw new UnauthorizedException('유효하지 않은 세션입니다. 다시 로그인해 주세요.');
      }
      this.cacheUser(payload.sub);
    }

    req['user'] = payload;
    return true;
  }

  private isUserCached(userId: string): boolean {
    const expiresAt = this.userCache.get(userId);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.userCache.delete(userId);
      return false;
    }
    return true;
  }

  private cacheUser(userId: string): void {
    if (this.userCache.size >= USER_CACHE_MAX) {
      const now = Date.now();
      for (const [key, exp] of this.userCache) {
        if (now > exp) this.userCache.delete(key);
      }
    }
    this.userCache.set(userId, Date.now() + USER_CACHE_TTL_MS);
  }

  private isUnsafeMethod(method: string): boolean {
    return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  }

  private assertTrustedBrowserOrigin(req: Request) {
    const origin = req.headers.origin ?? this.originFromReferer(req);
    if (!origin || !this.allowedOrigins().has(origin)) {
      throw new ForbiddenException('허용되지 않은 요청 출처입니다.');
    }
  }

  private originFromReferer(req: Request): string | undefined {
    const referer = req.headers.referer;
    if (!referer) return undefined;
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }

  private allowedOrigins(): Set<string> {
    return new Set([
      this.config.get('FRONTEND_URL') ?? 'http://localhost:5173',
      this.config.get('LANDING_URL') ?? 'http://localhost:5174',
      'https://i-dly-landing.vercel.app',
      'https://i-dly-front.vercel.app',
    ]);
  }
}
