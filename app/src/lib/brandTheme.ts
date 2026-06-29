/**
 * Brand theme manager.
 *
 * How it works:
 *   - src/styles/theme.css defines --brand-* CSS custom properties as defaults.
 *   - Semantic aliases (--color-primary etc.) reference --brand-* via var().
 *   - applyBrandTheme() sets --brand-* on :root at runtime, which cascades to
 *     every --color-* and --font-* alias automatically.
 *   - Tailwind @theme utilities (bg-primary etc.) use hardcoded defaults and do
 *     NOT respond to runtime changes — use var(--color-primary) in CSS for that.
 *
 * Usage:
 *   import { applyBrandTheme, saveBrandTheme, loadBrandTheme } from './brandTheme';
 *
 *   // Apply and persist a custom brand:
 *   applyBrandTheme({ primary: '#e63946', accent: '#457b9d' });
 *   saveBrandTheme({ primary: '#e63946', accent: '#457b9d' });
 *
 *   // Restore on app startup (call before createRoot):
 *   loadBrandTheme();
 *
 *   // Revert to defaults:
 *   resetBrandTheme();
 */

const STORAGE_KEY = 'xperiq_brand_theme';

/** All brand token defaults — mirrors the :root block in theme.css */
export const DEFAULT_BRAND_THEME = {
  primary:            '#2a4bd9',
  primaryDim:         '#173dcd',
  primaryContainer:   '#879aff',
  onPrimary:          '#f2f1ff',
  secondary:          '#00647c',
  secondaryContainer: '#82deff',
  onSecondary:        '#e2f6ff',
  accent:             '#8329c8',
  accentContainer:    '#d299ff',
  onAccent:           '#fceeff',
  fontHeading:        '"Manrope", sans-serif',
  fontBody:           '"Inter", sans-serif',
  radius:             '1rem',
  radiusSm:           '0.5rem',
  radiusLg:           '2rem',
};

/**
 * Apply a brand theme by setting CSS custom properties on :root.
 * Partial themes are merged with the defaults.
 */
export function applyBrandTheme(theme: Partial<typeof DEFAULT_BRAND_THEME> = {}) {
  const t = { ...DEFAULT_BRAND_THEME, ...theme };
  const root = document.documentElement;

  root.style.setProperty('--brand-primary',            t.primary);
  root.style.setProperty('--brand-primary-dim',        t.primaryDim);
  root.style.setProperty('--brand-primary-container',  t.primaryContainer);
  root.style.setProperty('--brand-on-primary',         t.onPrimary);
  root.style.setProperty('--brand-secondary',          t.secondary);
  root.style.setProperty('--brand-secondary-container',t.secondaryContainer);
  root.style.setProperty('--brand-on-secondary',       t.onSecondary);
  root.style.setProperty('--brand-accent',             t.accent);
  root.style.setProperty('--brand-accent-container',   t.accentContainer);
  root.style.setProperty('--brand-on-accent',          t.onAccent);
  root.style.setProperty('--brand-font-heading',       t.fontHeading);
  root.style.setProperty('--brand-font-body',          t.fontBody);
  root.style.setProperty('--brand-radius',             t.radius);
  root.style.setProperty('--brand-radius-sm',          t.radiusSm);
  root.style.setProperty('--brand-radius-lg',          t.radiusLg);
}

/**
 * Persist a brand theme to localStorage.
 * Call this alongside applyBrandTheme() when the user saves their brand settings.
 */
export function saveBrandTheme(theme: Partial<typeof DEFAULT_BRAND_THEME>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch (_) {
    // Silently ignore — storage may be unavailable in private browsing
  }
}

/**
 * Load and apply the previously saved brand theme from localStorage.
 * Call this once before createRoot() on app startup.
 *
 * @returns {Partial<typeof DEFAULT_BRAND_THEME> | null} The loaded theme, or null if none was saved.
 */
export function loadBrandTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const theme = JSON.parse(stored);
      applyBrandTheme(theme);
      return theme;
    }
  } catch (_) {
    // Corrupt storage — ignore and fall through to defaults
  }
  return null;
}

/**
 * Reset all brand tokens back to the Xperiq defaults and clear localStorage.
 */
export function resetBrandTheme() {
  applyBrandTheme(DEFAULT_BRAND_THEME);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

/** Map of brand font family strings → Google Fonts query segments */
const GOOGLE_FONTS_MAP: Record<string, string> = {
  '"Manrope", sans-serif':           'Manrope:ital,wght@0,400;0,600;0,700;0,800',
  '"Inter", sans-serif':             'Inter:ital,wght@0,400;0,500;0,600;0,700',
  '"DM Sans", sans-serif':           'DM+Sans:ital,wght@0,400;0,500;0,600;0,700',
  '"Plus Jakarta Sans", sans-serif': 'Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800',
  '"Outfit", sans-serif':            'Outfit:wght@400;500;600;700;800',
  '"Source Sans 3", sans-serif':     'Source+Sans+3:ital,wght@0,400;0,600;0,700',
};

/**
 * Dynamically inject a Google Fonts <link> for the given brand fonts.
 * Skips system/default fonts (Inter, Manrope) since those are already loaded by index.html.
 * Safe to call multiple times — replaces the previous brand-fonts link.
 */
export function injectFonts(heading?: string, body?: string) {
  const families = new Set<string>();
  if (heading && GOOGLE_FONTS_MAP[heading]) families.add(GOOGLE_FONTS_MAP[heading]);
  if (body && GOOGLE_FONTS_MAP[body]) families.add(GOOGLE_FONTS_MAP[body]);
  if (!families.size) return;

  const existing = document.getElementById('brand-fonts');
  if (existing) existing.remove();

  const link = document.createElement('link');
  link.id = 'brand-fonts';
  link.rel = 'stylesheet';
  const params = [...families].map((f) => `family=${f}`).join('&');
  link.href = `https://fonts.googleapis.com/css2?${params}&display=swap`;
  document.head.appendChild(link);
}
