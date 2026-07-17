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

@Injectable()
export class JwtGuard implements CanActivate {
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

    let payload: { sub: string; iat?: number };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { tokenInvalidatedAt: true },
    });

    if (
      user?.tokenInvalidatedAt &&
      payload.iat !== undefined &&
      new Date(payload.iat * 1000) < user.tokenInvalidatedAt
    ) {
      throw new UnauthorizedException('만료된 토큰입니다. 다시 로그인해 주세요.');
    }

    req['user'] = payload;
    return true;
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
