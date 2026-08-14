import { UnauthorizedException } from '@nestjs/common';
import { GmailPushOidcGuard } from './gmail-push-oidc.guard';

function context(authorization?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as any;
}

describe('GmailPushOidcGuard', () => {
  it('requires a bearer token', async () => {
    const oidc = { verify: jest.fn() } as any;
    const guard = new GmailPushOidcGuard(oidc);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(oidc.verify).not.toHaveBeenCalled();
  });

  it('verifies the token before allowing the webhook', async () => {
    const oidc = { verify: jest.fn().mockResolvedValue({}) } as any;
    const guard = new GmailPushOidcGuard(oidc);
    await expect(
      guard.canActivate(context('Bearer signed-token')),
    ).resolves.toBe(true);
    expect(oidc.verify).toHaveBeenCalledWith('signed-token');
  });
});
