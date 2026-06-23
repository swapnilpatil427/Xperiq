import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const { verifySvixSignature } = _require(resolve(__dirname, '../lib/clerkWebhook'));

// Build a valid Svix signature the same way the verifier expects.
function sign(body, { id = 'msg_1', ts = Math.floor(Date.now() / 1000), secretB64 } = {}) {
  const secretBytes = Buffer.from(secretB64, 'base64');
  const sig = crypto.createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64');
  return {
    headers: { 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}` },
  };
}

const SECRET_B64 = Buffer.from('test-webhook-secret-bytes').toString('base64');
const SECRET = `whsec_${SECRET_B64}`;

describe('verifySvixSignature', () => {
  it('accepts a correctly signed payload', () => {
    const body = JSON.stringify({ type: 'user.created', data: { id: 'u1' } });
    const { headers } = sign(body, { secretB64: SECRET_B64 });
    expect(verifySvixSignature(Buffer.from(body), headers, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ type: 'user.created', data: { id: 'u1' } });
    const { headers } = sign(body, { secretB64: SECRET_B64 });
    expect(verifySvixSignature(Buffer.from(body + 'x'), headers, SECRET)).toBe(false);
  });

  it('rejects a stale timestamp (replay protection)', () => {
    const body = '{}';
    const oldTs = Math.floor(Date.now() / 1000) - 3600;
    const { headers } = sign(body, { ts: oldTs, secretB64: SECRET_B64 });
    expect(verifySvixSignature(Buffer.from(body), headers, SECRET)).toBe(false);
  });

  it('rejects when headers are missing', () => {
    expect(verifySvixSignature(Buffer.from('{}'), {}, SECRET)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifySvixSignature(Buffer.from('{}'), {}, '')).toBe(false);
  });
});
