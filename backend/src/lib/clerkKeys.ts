/** Clerk secret keys decode to "<frontend-api-host>$" — same encoding as publishable keys. */
export function isValidClerkSecretKey(key: string): boolean {
  const trimmed = key.trim();
  if (!/^sk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(trimmed)) return false;
  try {
    const encoded = trimmed.replace(/^sk_(test|live)_/, '');
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return decoded.endsWith('$') && decoded.includes('.');
  } catch {
    return false;
  }
}

/** Returns CLERK_SECRET_KEY only when it is a real Clerk key (not a placeholder). */
export function resolveClerkSecretKey(): string | undefined {
  const raw = process.env.CLERK_SECRET_KEY?.trim();
  if (!raw || !isValidClerkSecretKey(raw)) return undefined;
  return raw;
}
