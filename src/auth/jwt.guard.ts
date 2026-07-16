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

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
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

    try {
      req['user'] = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
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
