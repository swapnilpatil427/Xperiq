/**
 * Clerk publishable keys decode to "<frontend-api-host>$".
 * Placeholder keys in .env (e.g. copied from sk_test_…) fail this check and must not
 * mount ClerkProvider — otherwise Clerk tries to load JS from https:///npm/...
 */
export function isValidClerkPublishableKey(key: string): boolean {
  const trimmed = key.trim();
  if (!/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(trimmed)) return false;
  try {
    const encoded = trimmed.replace(/^pk_(test|live)_/, '');
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return decoded.endsWith('$') && decoded.includes('.');
  } catch {
    return false;
  }
}

/** Resolved key for ClerkProvider, or null → run without Clerk (local dev mode). */
export function resolveClerkPublishableKey(): string | null {
  const raw = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  if (!raw) return null;
  if (!isValidClerkPublishableKey(raw)) {
    console.warn(
      '[Experient] VITE_CLERK_PUBLISHABLE_KEY is set but not a valid Clerk key — running without Clerk. ' +
      'Get a real pk_test_ key from https://dashboard.clerk.com or remove CLERK_SECRET_KEY from backend/.env for passwordless local dev.',
    );
    return null;
  }
  return raw;
}

/** Explicit CDN — avoids broken https:///npm/... URLs when FAPI domain parsing fails. */
export const CLERK_JS_URL =
  'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6/dist/clerk.browser.js';
