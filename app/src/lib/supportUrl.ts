const DEFAULT_SUPPORT_URL = 'http://localhost:3002';

/** Base URL for the Experient Support site (Next.js app on :3002 in local dev). */
export function getSupportBaseUrl(): string {
  const url = import.meta.env.VITE_SUPPORT_URL || DEFAULT_SUPPORT_URL;
  return url.replace(/\/$/, '');
}

/** Build a full URL on the support site, e.g. supportUrl('/guides') → http://localhost:3002/guides */
export function supportUrl(path = '/'): string {
  const base = getSupportBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function supportGuideUrl(key: string): string {
  return supportUrl(`/guides/${encodeURIComponent(key)}`);
}
