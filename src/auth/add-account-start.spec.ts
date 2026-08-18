import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { Request } from 'express';

/**
 * 쿠키 없이도 계정 추가가 기존 유저에 붙는지 검증한다.
 * GET /auth/google 은 리다이렉트라 헤더를 못 실어서 쿠키에만 의존했고,
 * 쿠키가 차단되는 환경(시크릿창·인앱 브라우저)에서 신규 유저가 생성됐다.
 */
describe('POST /auth/add-account/start', () => {
  const makeController = (getAddAccountUrl: jest.Mock) =>
    new AuthController(
      { getAddAccountUrl } as unknown as AuthService,
      { get: () => undefined } as never,
    );

  it('JWT의 userId로 OAuth URL을 만든다', () => {
    const getAddAccountUrl = jest
      .fn()
      .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?state=signed');
    const controller = makeController(getAddAccountUrl);

    const result = controller.startAddAccount({
      user: { sub: 'user-1' },
    } as unknown as Request);

    expect(getAddAccountUrl).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?state=signed',
    });
  });

  it('쿠키를 읽지 않는다 — 쿠키가 없어도 동일하게 동작한다', () => {
    const getAddAccountUrl = jest.fn().mockReturnValue('https://accounts.google.com/x');
    const controller = makeController(getAddAccountUrl);

    const withoutCookies = controller.startAddAccount({
      user: { sub: 'user-1' },
      cookies: undefined,
    } as unknown as Request);
    const withCookies = controller.startAddAccount({
      user: { sub: 'user-1' },
      cookies: { idly_token: 'irrelevant' },
    } as unknown as Request);

    expect(withoutCookies).toEqual(withCookies);
  });
});
