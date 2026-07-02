import { Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('onboarding')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('google')
  @ApiOperation({
    summary: '[화면 01·05] Google OAuth 시작 — 로그인 + 서브 계정 추가 통합',
    description: `
**화면 01 · 로그인** / **화면 05 · 연결 계정 추가** — 엔드포인트 동일

- **JWT 없이 호출** → 신규 유저 생성 (대표 계정 \`isPrimary: true\`)
- **JWT 헤더에 포함 후 호출** → 기존 유저에 서브 계정 추가 (\`isPrimary: false\`)

콜백은 동일한 \`/api/auth/google/callback\` 사용.
    `.trim(),
  })
  googleAuth(@Req() req, @Res() res: Response) {
    const authHeader = req.headers.authorization as string | undefined;
    let userId: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = this.authService.decodeToken(authHeader.slice(7));
        userId = payload?.sub;
      } catch { /* 토큰 만료/오류 시 신규 로그인으로 처리 */ }
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

    const { accessToken } = await this.authService.handleCallback(code, state);

    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');
    res.redirect(`${frontendUrl}/auth/callback?token=${accessToken}`);
  }

}
