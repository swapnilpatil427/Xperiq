import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const { generateToken, hashToken, verifyToken } = _require(resolve(__dirname, '../lib/scimToken'));

describe('scimToken', () => {
  it('generates an esc_-prefixed token with an 8-char prefix', () => {
    const { token, prefix } = generateToken();
    expect(token.startsWith('esc_')).toBe(true);
    expect(prefix).toBe(token.slice(0, 8));
    expect(token.length).toBeGreaterThan(40);
  });

  it('verifies a token against its own hash', () => {
    const { token } = generateToken();
    const hash = hashToken(token);
    expect(verifyToken(token, hash)).toBe(true);
  });

  it('rejects a wrong token (constant-time)', () => {
    const { token } = generateToken();
    const hash = hashToken(token);
    expect(verifyToken('esc_' + 'f'.repeat(48), hash)).toBe(false);
  });

  it('rejects malformed stored hashes', () => {
    expect(verifyToken('whatever', 'not-a-valid-hash')).toBe(false);
    expect(verifyToken('whatever', null)).toBe(false);
  });
});
