import { BadRequestException } from '@nestjs/common';

/** HTML/script injection 방지 — 프로필 등 사용자 표시 문자열 */
const UNSAFE_CHARS = /[<>`]/;

export function assertSafeDisplayText(value: string, field = '값'): void {
  if (UNSAFE_CHARS.test(value)) {
    throw new BadRequestException(
      `${field}에 사용할 수 없는 문자(<, >, \`)가 포함되어 있습니다.`,
    );
  }
}

/** LLM 응답에서 이메일·UUID 등 민감 패턴 마스킹 */
export function sanitizeLlmOutput(text: string): string {
  if (!text) return text;
  return text
    .replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[이메일]',
    )
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '[id]',
    );
}

/** 컨텍스트용 서비스 표시명 — 이메일이면 로컬 파트 축약 */
export function redactServiceLabel(name: string | null | undefined): string {
  if (!name) return '계정';
  if (name.includes('@')) {
    const [local, domain] = name.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return name.length > 40 ? `${name.slice(0, 37)}...` : name;
}
