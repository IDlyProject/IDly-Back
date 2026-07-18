import { BadRequestException } from '@nestjs/common';
import { assertNoSensitiveData, containsSensitivePattern } from './secret-detector';

describe('secret-detector', () => {
  it('blocks OTP, card number, and password-like input', () => {
    expect(containsSensitivePattern('인증코드는 123456입니다')).toBe(true);
    expect(containsSensitivePattern('카드는 4111-1111-1111-1111')).toBe(true);
    expect(containsSensitivePattern('내 비밀번호는 abc12345야')).toBe(true);
    expect(containsSensitivePattern('password is mySecret1')).toBe(true);
  });

  it('blocks recovery codes and api-key style tokens', () => {
    expect(
      containsSensitivePattern('복구 코드는 abcd-efgh-ijkl 이에요'),
    ).toBe(true);
    expect(
      containsSensitivePattern('api_key=sk_live_abcdefghijklmnopqrst'),
    ).toBe(true);
  });

  it('allows ordinary blocked-action explanations', () => {
    expect(containsSensitivePattern('페이지를 못 찾겠고 로그인 화면에서 막혔어요')).toBe(false);
  });

  it('throws a bad request for sensitive input', () => {
    expect(() => assertNoSensitiveData('pwd=abc12345')).toThrow(BadRequestException);
  });
});
