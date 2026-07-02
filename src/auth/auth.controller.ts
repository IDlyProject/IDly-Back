import { Controller, Get, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { JwtGuard } from './jwt.guard';

@ApiTags('onboarding')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('google')
  @ApiOperation({
    summary: '[화면 01] 로그인 — Google OAuth 시작',
    description: `
**화면 01 · 로그인**

"Google로 계속하기" 버튼 클릭 시 호출.
Gmail \`readonly\` 스코프 + 프로필 스코프를 한 번에 요청합니다 (\`access_type: offline\`, \`prompt: consent\`).

→ Google 로그인 페이지로 리다이렉트됨 (브라우저에서 직접 접근)
    `.trim(),
  })
  googleAuth(@Res() res: Response) {
    const url = this.authService.getAuthUrl();
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

  @Get('google/add-account')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[화면 05] 연결 계정 추가 — 추가 Gmail OAuth 시작',
    description: `
**화면 05 · 연결 계정 추가**

로그인 상태에서 "다른 Gmail 추가하기" 클릭 시 호출.
\`state\`에 현재 userId를 담아 콜백에서 기존 유저에 계정을 추가합니다.
    `.trim(),
  })
  addAccount(@Req() req, @Res() res: Response) {
    const url = this.authService.getAddAccountUrl(req.user.sub);
    res.redirect(url);
  }
}
