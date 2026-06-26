/**
 * Clerk publishable keys (pk_*) embed the Frontend API host as base64 — validate that
 * decode so we never mount clerk-js against a broken URL.
 *
 * Secret keys (sk_*) are opaque credentials — Clerk only checks the sk_test_/sk_live_
 * prefix (see @clerk/shared keys.ts). Do NOT apply publishable-key base64 decoding here.
 */

const SECRET_KEY_RE = /^sk_(test|live)_[A-Za-z0-9+/=_-]+$/;
const PLACEHOLDER_SECRET_RES = [
  /^sk_(test|live)_\.{2,}$/i,
  /^sk_(test|live)_(your|xxx|changeme|replace|example|placeholder)/i,
  /^sk_(test|live)_fake$/i,
];

/** True for real Clerk secret keys; rejects .env placeholders like sk_test_... */
export function isValidClerkSecretKey(key: string): boolean {
  const trimmed = key.trim();
  if (!SECRET_KEY_RE.test(trimmed)) return false;
  if (trimmed.length < 15) return false;
  return !PLACEHOLDER_SECRET_RES.some((re) => re.test(trimmed));
}

/** Returns CLERK_SECRET_KEY only when it is a real Clerk key (not a placeholder). */
export function resolveClerkSecretKey(): string | undefined {
  const raw = process.env.CLERK_SECRET_KEY?.trim();
  if (!raw || !isValidClerkSecretKey(raw)) return undefined;
  return raw;
}
