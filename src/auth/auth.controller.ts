import { BadRequestException, Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
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
- **JWT 포함 후 호출** → 기존 유저에 서브 계정 추가 (\`isPrimary: false\`)
  - \`Authorization: Bearer {token}\` 헤더 또는 \`?token={token}\` 쿼리 파라미터 모두 지원
  - 브라우저 리다이렉트 방식에서는 헤더를 실을 수 없으므로 쿼리 파라미터 사용
  - 토큰이 전달됐으나 decode 불가 시 400 에러 (의도치 않은 신규 유저 생성 방지)

콜백은 동일한 \`/api/auth/google/callback\` 사용.

**최종 결과:** Google 인증 완료 후 \`{FRONTEND_URL}/auth/callback?token={JWT}&mode={login|add}\` 로 리다이렉트됨
    `.trim(),
  })
  @ApiQuery({ name: 'token', required: false, description: '계정 추가 시 기존 JWT (헤더 대신 쿼리 파라미터로 전달 가능)' })
  googleAuth(@Req() req, @Res() res: Response, @Query('token') tokenQuery?: string) {
    const authHeader = req.headers.authorization as string | undefined;
    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : tokenQuery;

    let userId: string | undefined;

    if (rawToken) {
      const payload = this.authService.decodeToken(rawToken);
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

    const { accessToken, mode } = await this.authService.handleCallback(code, state);

    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');
    res.redirect(`${frontendUrl}/auth/callback?token=${accessToken}&mode=${mode}`);
  }

}
