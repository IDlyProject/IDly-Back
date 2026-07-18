import { BadRequestException } from '@nestjs/common';
import {
  assertSafeDisplayText,
  sanitizeLlmOutput,
  redactServiceLabel,
} from './text-safety';

describe('text-safety', () => {
  it('rejects XSS characters in display text', () => {
    expect(() => assertSafeDisplayText('<script>x</script>', '이름')).toThrow(
      BadRequestException,
    );
    expect(() => assertSafeDisplayText('정상이름')).not.toThrow();
  });

  it('masks emails and UUIDs in LLM output', () => {
    const raw =
      '메일 user@gmail.com 과 id de8de291-c9a0-4d9b-be87-fd4d6b378c6a 를 보세요';
    const out = sanitizeLlmOutput(raw);
    expect(out).not.toContain('user@gmail.com');
    expect(out).not.toContain('de8de291-c9a0-4d9b-be87-fd4d6b378c6a');
    expect(out).toContain('[이메일]');
    expect(out).toContain('[id]');
  });

  it('redacts email-like service labels', () => {
    expect(redactServiceLabel('wkdgustj102@gmail.com')).toMatch(/\*\*\*/);
    expect(redactServiceLabel('Twitter')).toBe('Twitter');
  });
});
