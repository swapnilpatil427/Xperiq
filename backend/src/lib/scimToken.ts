// SCIM bearer-token generation + verification using Node's built-in crypto.
//
// The design doc used bcrypt; bcrypt is a native dependency that isn't installed
// here, so we use scrypt + timingSafeEqual (dependency-free, equally suitable for
// hashing high-entropy random tokens). Stored format: "scrypt$<saltHex>$<hashHex>".
import crypto from 'crypto';

const TOKEN_BYTES = 24;        // 48 hex chars of entropy after the prefix
export const PREFIX = 'esc_';  // Experient SCIM credential

/** Generate a new SCIM token. Returns { token, prefix } — token is shown once. */
export function generateToken(): { token: string; prefix: string } {
  const token = PREFIX + crypto.randomBytes(TOKEN_BYTES).toString('hex');
  return { token, prefix: token.slice(0, 8) };
}

/** Hash a token for storage. */
export function hashToken(token: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(token, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time verify a token against a stored hash. */
export function verifyToken(token: string, stored: unknown): boolean {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  let actual: Buffer;
  try { actual = crypto.scryptSync(token, salt, expected.length) as Buffer; }
  catch { return false; }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
