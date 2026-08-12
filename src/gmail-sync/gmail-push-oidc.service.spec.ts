import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { GmailPushOidcService } from './gmail-push-oidc.service';

const allowedEmail = 'gmail-push@project.iam.gserviceaccount.com';

function serviceWith(payload: Record<string, unknown>, configured = true) {
  const config = {
    get: jest.fn((key: string) => {
      if (!configured) return undefined;
      if (key === 'GMAIL_PUSH_AUDIENCE')
        return 'https://api.test/api/gmail/push';
      if (key === 'GMAIL_PUSH_SERVICE_ACCOUNT_EMAIL') return allowedEmail;
      return undefined;
    }),
  } as any;
  const service = new GmailPushOidcService(config);
  (service as any).verifier = {
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => payload,
    }),
  };
  return service;
}

describe('GmailPushOidcService', () => {
  it('accepts only the configured verified Google service account', async () => {
    const service = serviceWith({
      sub: 'google-subject',
      iss: 'https://accounts.google.com',
      email: allowedEmail,
      email_verified: true,
    });
    await expect(service.verify('token')).resolves.toEqual({
      email: allowedEmail,
      subject: 'google-subject',
    });
  });

  it('rejects a different service account even with a valid token', async () => {
    const service = serviceWith({
      sub: 'google-subject',
      iss: 'https://accounts.google.com',
      email: 'attacker@project.iam.gserviceaccount.com',
      email_verified: true,
    });
    await expect(service.verify('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('fails closed when the production OIDC config is absent', async () => {
    const service = serviceWith({}, false);
    await expect(service.verify('token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
