import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

export type VerifiedPushIdentity = {
  email: string;
  subject: string;
};

@Injectable()
export class GmailPushOidcService {
  private readonly verifier = new google.auth.OAuth2();

  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string): Promise<VerifiedPushIdentity> {
    const audience = this.config.get<string>('GMAIL_PUSH_AUDIENCE');
    const allowedEmail = this.config.get<string>(
      'GMAIL_PUSH_SERVICE_ACCOUNT_EMAIL',
    );
    if (!audience || !allowedEmail) {
      throw new ServiceUnavailableException(
        'Gmail Push OIDC 설정이 완료되지 않았습니다.',
      );
    }

    let payload;
    try {
      const ticket = await this.verifier.verifyIdToken({
        idToken,
        audience,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('유효하지 않은 Gmail Push 토큰입니다.');
    }

    const validIssuer =
      payload?.iss === 'accounts.google.com' ||
      payload?.iss === 'https://accounts.google.com';
    if (
      !payload?.sub ||
      !payload.email ||
      payload.email !== allowedEmail ||
      payload.email_verified !== true ||
      !validIssuer
    ) {
      throw new UnauthorizedException('허용되지 않은 Gmail Push 발신자입니다.');
    }

    return { email: payload.email, subject: payload.sub };
  }
}
