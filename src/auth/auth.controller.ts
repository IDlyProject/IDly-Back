import { Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({
    summary: '[화면 04] 대표 계정 등록 완료 — OAuth 콜백 처리',
    description: `
**화면 03 → 04 처리 (추가 계정 연결도 이 엔드포인트)**

Google이 \`code\`를 전달하면:
1. \`code\` → \`access_token\` + \`refresh_token\` 교환
2. \`userinfo\`로 이메일·이름 조회
3. DB 저장: 신규면 User + GmailAccount 생성, 기존이면 refresh_token 갱신
4. \`state\`에 \`addToUserId\`가 있으면 기존 유저에 계정 추가
5. JWT 발급 후 프론트로 리다이렉트 (\`?token=<jwt>\`)
    `.trim(),
  })
  @ApiQuery({ name: 'code', description: 'Google OAuth authorization code' })
  @ApiQuery({ name: 'state', required: false, description: '추가 계정 연결 시 base64 encoded {addToUserId}' })
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
