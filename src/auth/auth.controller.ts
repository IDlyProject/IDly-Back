import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { RateLimit } from '../common/guards/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

class RefreshDto {
  @ApiProperty({
    required: false,
    description: '바디 생략 시 idly_refresh 쿠키 사용',
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;
}

@ApiTags('1-1. 로그인')
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private readonly ACCESS_COOKIE = 'idly_token';
  private readonly REFRESH_COOKIE = 'idly_refresh';

  private accessCookieMaxAgeMs(): number {
    // access JWT 기본 1h — 쿠키도 동일 창
    const exp = this.config.get<string>('JWT_EXPIRES_IN', '1h');
    return parseDurationMs(exp) ?? 60 * 60 * 1000;
  }

  private refreshCookieMaxAgeMs(): number {
    const days = Number(this.config.get('REFRESH_TOKEN_DAYS') ?? 7);
    return days * 24 * 60 * 60 * 1000;
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const isProd = this.config.get('NODE_ENV') === 'production';
    const base = {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    };
    res.cookie(this.ACCESS_COOKIE, accessToken, {
      ...base,
      maxAge: this.accessCookieMaxAgeMs(),
    });
    res.cookie(this.REFRESH_COOKIE, refreshToken, {
      ...base,
      maxAge: this.refreshCookieMaxAgeMs(),
      path: '/api/auth',
    });
  }

  private clearAuthCookies(res: Response) {
    const isProd = this.config.get('NODE_ENV') === 'production';
    const base = {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    };
    res.clearCookie(this.ACCESS_COOKIE, base);
    res.clearCookie(this.REFRESH_COOKIE, { ...base, path: '/api/auth' });
  }

  @Get('google')
  @RateLimit({ limit: 30, windowMs: 60_000, key: 'ip' })
  @ApiOperation({
    summary: 'Google OAuth 시작 — 로그인 + 서브 계정 추가 통합',
    description: `
**화면 01 · 로그인** / **화면 05 · 연결 계정 추가(1-2-5)** — 엔드포인트 동일

- **\`idly_token\` 쿠키 없이 호출** → 신규 유저 생성 (대표 계정 \`isPrimary: true\`)
- **\`idly_token\` 쿠키 포함 후 호출** → 기존 유저에 서브 계정 추가 (\`isPrimary: false\`)

**Google 인증 완료 후:**
- access JWT → \`idly_token\` (단기)
- refresh → \`idly_refresh\` (장기, /api/auth 경로)
- \`{FRONTEND_URL}/auth/callback?mode={login|add}\` 로 리다이렉트
    `.trim(),
  })
  @ApiResponse({ status: 302, description: 'Google OAuth 페이지로 리다이렉트' })
  googleAuth(@Req() req: Request, @Res() res: Response) {
    const cookieToken = (req as any).cookies?.[this.ACCESS_COOKIE];
    const authHeader = req.headers.authorization as string | undefined;
    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : cookieToken;

    let userId: string | undefined;

    if (rawToken) {
      const payload = this.authService.verifyToken(rawToken);
      if (!payload?.sub) {
        throw new BadRequestException(
          '유효하지 않은 토큰입니다. 다시 로그인해 주세요.',
        );
      }
      userId = payload.sub;
    }

    const url = userId
      ? this.authService.getAddAccountUrl(userId)
      : this.authService.getAuthUrl();

    res.redirect(url);
  }

  @Get('google/callback')
  @RateLimit({ limit: 40, windowMs: 60_000, key: 'ip' })
  @ApiExcludeEndpoint()
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code) throw new UnauthorizedException('code가 없습니다.');

    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');

    try {
      const { accessToken, refreshToken, mode } =
        await this.authService.handleCallback(code, state);

      this.setAuthCookies(res, accessToken, refreshToken);

      res.redirect(`${frontendUrl}/auth/callback?mode=${mode}`);
    } catch (error) {
      const response = (error as any)?.getResponse?.();
      let errorCode = 'oauth_failed';

      if (typeof response === 'object' && response?.errorCode) {
        errorCode = response.errorCode;
      } else {
        const msg = String(
          (typeof response === 'object' ? response?.message : response) ??
            (error instanceof Error ? error.message : ''),
        );
        if (msg.includes('refresh_token')) errorCode = 'refresh_token_missing';
        else if (msg.includes('OAuth state')) errorCode = 'invalid_oauth_state';
      }

      console.error('[OAuth Callback Error]', errorCode, error instanceof Error ? error.message : error);

      res.redirect(
        `${frontendUrl}/auth/callback?error=${encodeURIComponent(errorCode)}`,
      );
    }
  }

  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 60_000, key: 'ip' })
  @ApiOperation({
    summary: '액세스 토큰 갱신 (refresh 로테이션)',
    description:
      '바디 또는 `idly_refresh` 쿠키의 refresh 토큰으로 새 access/refresh 발급. 이전 refresh는 즉시 폐기.',
  })
  @ApiResponse({ status: 200, description: '갱신 성공' })
  @ApiResponse({ status: 401, description: '유효하지 않거나 재사용된 refresh' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: RefreshDto,
  ) {
    const raw =
      body?.refreshToken ||
      (req as any).cookies?.[this.REFRESH_COOKIE] ||
      undefined;
    if (!raw) {
      throw new UnauthorizedException('refresh 토큰이 없습니다.');
    }
    const { accessToken, refreshToken } =
      await this.authService.rotateRefreshToken(raw);
    this.setAuthCookies(res, accessToken, refreshToken);
    return { accessToken, expiresIn: this.config.get('JWT_EXPIRES_IN', '1h') };
  }

  @Post('logout')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowMs: 60_000, key: 'ip' })
  @ApiOperation({
    summary: '로그아웃 — refresh 폐기 + 쿠키 삭제',
    description:
      'access 만료 상태에서도 동작. `idly_refresh` 쿠키 또는 Bearer access로 세션 폐기.',
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = (req as any).cookies?.[this.REFRESH_COOKIE] as
      | string
      | undefined;
    if (raw) {
      await this.authService.revokeRefreshToken(raw);
    } else {
      // refresh 쿠키 없을 때 Bearer access로 유저 전체 refresh 폐기 시도
      const authHeader = req.headers.authorization;
      const bearer = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (req as any).cookies?.[this.ACCESS_COOKIE];
      if (bearer) {
        const payload = this.authService.verifyToken(bearer);
        if (payload?.sub) {
          await this.authService.revokeAllRefreshTokens(payload.sub);
        }
      }
    }
    this.clearAuthCookies(res);
    return { ok: true };
  }
}

function parseDurationMs(exp: string): number | null {
  const m = /^(\d+)([smhd])$/i.exec(exp.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u === 's') return n * 1000;
  if (u === 'm') return n * 60 * 1000;
  if (u === 'h') return n * 60 * 60 * 1000;
  if (u === 'd') return n * 24 * 60 * 60 * 1000;
  return null;
}
