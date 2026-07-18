import { BadRequestException } from '@nestjs/common';

// 5-8자리 독립 숫자열(OTP), 15-16자리 카드번호 패턴
const OTP_RE = /\b\d{5,8}\b/;
const CARD_RE = /(?:\d[\s-]?){15,16}/;
const PASSWORD_RE =
  /(?:비밀번호|패스워드|password|passwd|pwd)\s*(?:은|는|이|가|:|=|is)?\s*['"]?[A-Za-z0-9!@#$%^&*()_+\-={}\[\]:;"'<>,.?/\\|`~]{6,}/i;
// 복구 코드 / 백업 코드 (xxxx-xxxx 또는 공백 구분 8~16 hex/alnum 묶음)
const RECOVERY_CODE_RE =
  /(?:복구\s*코드|백업\s*코드|recovery\s*code|backup\s*code)\s*(?:는|은|:|=)?\s*[A-Za-z0-9]{4,}(?:[-\s][A-Za-z0-9]{4,})+/i;
// API 키 / Bearer 토큰 형태
const TOKEN_RE =
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token|bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-.]{16,}/i;

export function containsSensitivePattern(text: string): boolean {
  return (
    OTP_RE.test(text) ||
    CARD_RE.test(text) ||
    PASSWORD_RE.test(text) ||
    RECOVERY_CODE_RE.test(text) ||
    TOKEN_RE.test(text)
  );
}

export function assertNoSensitiveData(text: string): void {
  if (containsSensitivePattern(text)) {
    throw new BadRequestException(
      '비밀번호, 인증코드, 카드번호, 복구코드 같은 보안 정보는 입력하지 마세요. 막힌 상황을 설명해 주세요.',
    );
  }
}
