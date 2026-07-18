import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { google } from 'googleapis';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

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
    private readonly prisma: PrismaService,
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
      prompt: 'consent',
      scope: this.SCOPES,
    });
  }

  /** 화면 05 — 추가 계정 연결용 OAuth URL (state에 userId 포함) */
  getAddAccountUrl(userId: string): string {
    const state = this.jwtService.sign(
      { addToUserId: userId, purpose: 'add_account' },
      { expiresIn: '10m' },
    );

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: this.SCOPES,
      state,
    });
  }

  /** JWT 검증 — 추가 Gmail 연결 시 기존 로그인 유저를 안전하게 식별 */
  verifyToken(token: string) {
    try {
      return this.jwtService.verify(token) as { sub: string; email?: string; jti?: string };
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

    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? '';
    const name = data.name ?? '';

    let addToUserId: string | undefined;
    if (state) {
      try {
        const parsed = this.jwtService.verify(state) as {
          addToUserId?: string;
          purpose?: string;
        };
        if (parsed.purpose !== 'add_account' || !parsed.addToUserId) {
          throw new Error('invalid oauth state');
        }
        addToUserId = parsed.addToUserId;
      } catch {
        throw new UnauthorizedException('유효하지 않은 OAuth state입니다.');
      }
    }

    const { user, gmailAccount } = await this.usersService.upsertFromGoogle({
      email,
      name,
      refreshToken: tokens.refresh_token,
      addToUserId,
    });

    await this.usersService.updateLastLogin(user.id);

    const { accessToken, refreshToken } = await this.issueTokenPair(
      user.id,
      gmailAccount.email,
    );
    const mode = addToUserId ? 'add' : 'login';

    return { accessToken, refreshToken, user, gmailAccount, mode };
  }

  /** access + refresh 발급 (refresh는 DB 해시 저장) */
  async issueTokenPair(userId: string, email?: string) {
    const jti = randomBytes(16).toString('hex');
    const accessToken = this.jwtService.sign({
      sub: userId,
      email: email ?? undefined,
      jti,
    });

    const rawRefresh = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(rawRefresh);
    const days = Number(this.config.get('REFRESH_TOKEN_DAYS') ?? 7);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.authRefreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    // 유저당 활성 refresh 최대 5개 유지 (오래된 것 폐기)
    const tokens = await this.prisma.authRefreshToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (tokens.length > 5) {
      const drop = tokens.slice(5).map((t) => t.id);
      await this.prisma.authRefreshToken.updateMany({
        where: { id: { in: drop } },
        data: { revokedAt: new Date() },
      });
    }

    return { accessToken, refreshToken: rawRefresh };
  }

  /** refresh 로테이션 — 재사용 탐지 시 해당 유저 토큰 전부 폐기 */
  async rotateRefreshToken(rawRefresh: string) {
    const tokenHash = this.hashToken(rawRefresh);
    const row = await this.prisma.authRefreshToken.findUnique({
      where: { tokenHash },
    });
    if (!row) {
      throw new UnauthorizedException('유효하지 않은 refresh 토큰입니다.');
    }
    if (row.revokedAt) {
      // reuse detection
      await this.prisma.authRefreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(
        'refresh 토큰 재사용이 감지되었습니다. 다시 로그인해 주세요.',
      );
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('만료된 refresh 토큰입니다.');
    }

    await this.prisma.authRefreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: {
        id: true,
        gmailAccounts: {
          where: { isPrimary: true },
          select: { email: true },
          take: 1,
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('유효하지 않은 세션입니다.');
    }

    const email = user.gmailAccounts[0]?.email;
    return this.issueTokenPair(user.id, email);
  }

  async revokeRefreshToken(rawRefresh: string) {
    const tokenHash = this.hashToken(rawRefresh);
    await this.prisma.authRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllRefreshTokens(userId: string) {
    await this.prisma.authRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
