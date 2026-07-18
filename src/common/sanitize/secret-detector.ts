import { BadRequestException } from '@nestjs/common';

// 5-8자리 독립 숫자열(OTP), 15-16자리 카드번호 패턴
const OTP_RE = /\b\d{5,8}\b/;
const CARD_RE = /(?:\d[\s-]?){15,16}/;

export function containsSensitivePattern(text: string): boolean {
  return OTP_RE.test(text) || CARD_RE.test(text);
}

export function assertNoSensitiveData(text: string): void {
  if (containsSensitivePattern(text)) {
    throw new BadRequestException(
      '인증코드나 카드번호 같은 보안 정보는 입력하지 마세요. 막힌 상황을 설명해 주세요.',
    );
  }
}
