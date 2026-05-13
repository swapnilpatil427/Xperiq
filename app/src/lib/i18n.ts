// Minimal i18n layer — wraps the locale file and provides a t() function.
//
// Drop-in compatible with react-i18next:
//   - Same call signature: t('key'), t('key', { var: value })
//   - Same hook name: useTranslation()
//   - To upgrade: replace this file's export with react-i18next's useTranslation
//     and move locales/en.js into the react-i18next namespace format (JSON).
//
// Interpolation: {variable}  →  t('surveys.countDescription', { count: 5, responses: 100 })

import en from '../locales/en';

const LOCALES = { en };
let _locale = 'en';

function resolve(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((cur: unknown, key: string) => (cur as Record<string, unknown>)?.[key], obj);
}

export function t(key: string, vars: Record<string, unknown> = {}): string {
  const raw = resolve(LOCALES[_locale as keyof typeof LOCALES] ?? LOCALES.en, key);
  if (raw === undefined) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing key: "${key}"`);
    }
    return key;
  }
  // Non-string values (arrays, objects) are returned as-is — callers cast appropriately.
  if (typeof raw !== 'string') return raw as unknown as string;
  return raw.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`
  );
}

export function setLocale(locale: string) {
  if (LOCALES[locale as keyof typeof LOCALES]) _locale = locale;
}

export function useTranslation() {
  return { t };
}
