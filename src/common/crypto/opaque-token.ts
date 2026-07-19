import { createHash } from 'crypto';

/** App refresh 등 opaque 토큰 저장용 SHA-256 해시 (원문 비저장). */
export function hashOpaqueToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
