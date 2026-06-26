import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { isValidClerkSecretKey, resolveClerkSecretKey } = createRequire(import.meta.url)(
  resolve(__dirname, '../lib/clerkKeys'),
);

const REAL_SK = 'sk_test_mvterdNmxvfk3CS6fvAMM1pt36uOZQiBmJSbTQvHIc';
const REAL_PK = 'pk_test_bWlnaHR5LWVhcndpZy0zMy5jbGVyay5hY2NvdW50cy5kZXYk';

describe('isValidClerkSecretKey', () => {
  it('accepts opaque Clerk secret keys (not base64 FAPI host)', () => {
    expect(isValidClerkSecretKey(REAL_SK)).toBe(true);
  });

  it('accepts sk keys that share the pk base64 suffix (legacy format)', () => {
    const legacySk = 'sk_test_' + REAL_PK.replace(/^pk_test_/, '');
    expect(isValidClerkSecretKey(legacySk)).toBe(true);
  });

  it('rejects .env placeholders and empty suffixes', () => {
    expect(isValidClerkSecretKey('sk_test_...')).toBe(false);
    expect(isValidClerkSecretKey('sk_test_')).toBe(false);
    expect(isValidClerkSecretKey('sk_test_fake')).toBe(false);
    expect(isValidClerkSecretKey('pk_test_not_a_secret')).toBe(false);
  });
});

describe('resolveClerkSecretKey', () => {
  it('returns the env key when valid', () => {
    const prev = process.env.CLERK_SECRET_KEY;
    process.env.CLERK_SECRET_KEY = REAL_SK;
    expect(resolveClerkSecretKey()).toBe(REAL_SK);
    if (prev === undefined) delete process.env.CLERK_SECRET_KEY;
    else process.env.CLERK_SECRET_KEY = prev;
  });
});
