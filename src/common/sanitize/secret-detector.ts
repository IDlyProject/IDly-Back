import { BadRequestException } from '@nestjs/common';

// 5-8자리 독립 숫자열(OTP), 15-16자리 카드번호 패턴
const OTP_RE = /\b\d{5,8}\b/;
const CARD_RE = /(?:\d[\s-]?){15,16}/;
const PASSWORD_RE =
  /(?:비밀번호|패스워드|password|passwd|pwd)\s*(?:은|는|이|가|:|=|is)?\s*['"]?[A-Za-z0-9!@#$%^&*()_+\-={}\[\]:;"'<>,.?/\\|`~]{6,}/i;

export function containsSensitivePattern(text: string): boolean {
  return OTP_RE.test(text) || CARD_RE.test(text) || PASSWORD_RE.test(text);
}

export function assertNoSensitiveData(text: string): void {
  if (containsSensitivePattern(text)) {
    throw new BadRequestException(
      '비밀번호, 인증코드, 카드번호 같은 보안 정보는 입력하지 마세요. 막힌 상황을 설명해 주세요.',
    );
  }
}
