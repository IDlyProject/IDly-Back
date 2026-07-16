import { BadRequestException, Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('1-1. 로그인')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private readonly COOKIE_NAME = 'idly_token';
  private readonly COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7일

  @Get('google')
  @ApiOperation({
    summary: 'Google OAuth 시작 — 로그인 + 서브 계정 추가 통합',
    description: `
**화면 01 · 로그인** / **화면 05 · 연결 계정 추가(1-2-5)** — 엔드포인트 동일

- **\`idly_token\` 쿠키 없이 호출** → 신규 유저 생성 (대표 계정 \`isPrimary: true\`)
- **\`idly_token\` 쿠키 포함 후 호출** → 기존 유저에 서브 계정 추가 (\`isPrimary: false\`)
  - 브라우저 리다이렉트 시 쿠키가 자동 첨부되므로 프론트에서 별도 처리 불필요
  - 쿠키가 있으나 decode 불가 시 400 에러 (의도치 않은 신규 유저 생성 방지)

**Google 인증 완료 후:**
- JWT를 \`idly_token\` httpOnly 쿠키로 발급 (URL에 토큰 미포함)
- \`{FRONTEND_URL}/auth/callback?mode={login|add}\` 로 리다이렉트
    `.trim(),
  })
  @ApiResponse({ status: 302, description: 'Google OAuth 페이지로 리다이렉트' })
  googleAuth(@Req() req: Request, @Res() res: Response) {
    const cookieToken = (req as any).cookies?.[this.COOKIE_NAME];
    const authHeader = req.headers.authorization as string | undefined;
    const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken;

    let userId: string | undefined;

    if (rawToken) {
      const payload = this.authService.verifyToken(rawToken);
      if (!payload?.sub) {
        throw new BadRequestException('유효하지 않은 토큰입니다. 다시 로그인해 주세요.');
      }
      userId = payload.sub;
    }

    const url = userId
      ? this.authService.getAddAccountUrl(userId)
      : this.authService.getAuthUrl();

    res.redirect(url);
  }

  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code) throw new UnauthorizedException('code가 없습니다.');

    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');

    try {
      const { accessToken, mode } = await this.authService.handleCallback(
        code,
        state,
      );

      const isProd = this.config.get('NODE_ENV') === 'production';
      res.cookie(this.COOKIE_NAME, accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: this.COOKIE_MAX_AGE_MS,
      });

      res.redirect(`${frontendUrl}/auth/callback?mode=${mode}`);
    } catch (error) {
      // OAuth 콜백은 브라우저 리다이렉트 경로이므로 JSON 에러 대신 프론트로 에러 코드 전달
      const response = (error as any)?.getResponse?.();
      let errorCode = 'oauth_failed';

      if (typeof response === 'object' && response?.errorCode) {
        // ConflictException 등 구조화된 errorCode 우선 사용
        errorCode = response.errorCode;
      } else {
        const msg = String(
          (typeof response === 'object' ? response?.message : response) ??
            (error instanceof Error ? error.message : ''),
        );
        if (msg.includes('refresh_token')) errorCode = 'refresh_token_missing';
        else if (msg.includes('OAuth state')) errorCode = 'invalid_oauth_state';
      }

      res.redirect(
        `${frontendUrl}/auth/callback?error=${encodeURIComponent(errorCode)}`,
      );
    }
  }

}
