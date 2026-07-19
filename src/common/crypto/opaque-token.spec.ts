import { hashOpaqueToken } from './opaque-token';

describe('hashOpaqueToken', () => {
  it('is stable and hex-encoded', () => {
    const a = hashOpaqueToken('refresh-raw-value');
    const b = hashOpaqueToken('refresh-raw-value');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs for different inputs', () => {
    expect(hashOpaqueToken('a')).not.toBe(hashOpaqueToken('b'));
  });
});
