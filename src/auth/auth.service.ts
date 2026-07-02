import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  private readonly oauth2Client;

  private readonly SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.readonly',
  ];

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      config.get('GOOGLE_CLIENT_ID'),
      config.get('GOOGLE_CLIENT_SECRET'),
      config.get('GOOGLE_REDIRECT_URI'),
    );
  }

  /** 화면 01 — 최초 로그인용 OAuth URL */
  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',   // refresh_token을 항상 받기 위해 consent 강제
      scope: this.SCOPES,
    });
  }

  /** 화면 05 — 추가 계정 연결용 OAuth URL (state에 userId 포함) */
  getAddAccountUrl(userId: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: this.SCOPES,
      state: Buffer.from(JSON.stringify({ addToUserId: userId })).toString('base64'),
    });
  }

  /** JWT 디코딩 (검증 없이) — 만료된 토큰도 payload 추출 가능 */
  decodeToken(token: string) {
    try {
      return this.jwtService.decode(token) as { sub: string; email: string } | null;
    } catch {
      return null;
    }
  }

  /** OAuth 콜백 처리 — 로그인 & 추가 계정 모두 이 메서드로 */
  async handleCallback(code: string, state?: string) {
    const { tokens } = await this.oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new UnauthorizedException(
        'refresh_token이 발급되지 않았습니다.\n' +
        'Google 계정 > 보안 > IDly 앱 권한을 해제한 뒤 다시 시도해주세요.',
      );
    }

    this.oauth2Client.setCredentials(tokens);

    // Google 프로필 조회
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? '';
    const name = data.name ?? '';

    // state 파싱: 추가 계정 연결인지 확인
    let addToUserId: string | undefined;
    if (state) {
      try {
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString());
        addToUserId = parsed.addToUserId;
      } catch { /* state 파싱 실패 시 무시 */ }
    }

    const { user, gmailAccount } = await this.usersService.upsertFromGoogle({
      email,
      name,
      refreshToken: tokens.refresh_token,
      addToUserId,
    });

    const payload = { sub: user.id, email: gmailAccount.email };
    const accessToken = this.jwtService.sign(payload);

    return { accessToken, user, gmailAccount };
  }
}
