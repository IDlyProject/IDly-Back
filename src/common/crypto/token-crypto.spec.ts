import {
  decryptToken,
  encryptToken,
  isEncrypted,
  resolveEncryptionKey,
} from './token-crypto';

describe('token-crypto', () => {
  const key = resolveEncryptionKey(undefined, 'development');

  it('round-trips encryption', () => {
    const plain = '1//0g-refresh-token-sample';
    const enc = encryptToken(plain, key);
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptToken(enc, key)).toBe(plain);
  });

  it('rejects production without secret', () => {
    expect(() => resolveEncryptionKey(undefined, 'production')).toThrow(
      /REFRESH_TOKEN_SECRET/,
    );
  });

  it('rejects wrong key length', () => {
    const short = Buffer.from('too-short').toString('base64');
    expect(() => resolveEncryptionKey(short, 'development')).toThrow(
      /32-byte/,
    );
  });
});
