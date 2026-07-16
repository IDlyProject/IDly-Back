import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const PREFIX = 'enc:v1:';

// Dev-only fallback: "idly-local-dev-refresh-token-key" (32 bytes)
const DEV_KEY = 'aWRseS1sb2NhbC1kZXYtcmVmcmVzaC10b2tlbi1rZXk=';

export function resolveEncryptionKey(envKey: string | undefined, nodeEnv: string | undefined): string {
  if (envKey) return envKey;
  if (nodeEnv === 'production') {
    throw new Error('REFRESH_TOKEN_SECRET must be set in production');
  }
  return DEV_KEY;
}

export function encryptToken(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, encrypted, tag].map((b) => b.toString('base64')).join('.');
}

export function decryptToken(ciphertext: string, keyBase64: string): string {
  if (!ciphertext.startsWith(PREFIX)) {
    throw new Error('Token is not in encrypted format');
  }
  const parts = ciphertext.slice(PREFIX.length).split('.');
  if (parts.length !== 3) throw new Error('Malformed encrypted token');
  const [ivB64, encB64, tagB64] = parts;
  const key = Buffer.from(keyBase64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const encrypted = Buffer.from(encB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
