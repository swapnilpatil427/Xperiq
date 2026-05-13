import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { t, setLocale, useTranslation } from '../../lib/i18n';

afterEach(() => {
  setLocale('en');
});

// ── t() — key resolution ──────────────────────────────────────────────────────

describe('t() — key resolution', () => {
  it('resolves a top-level dotted key', () => {
    expect(t('brand.name')).toBe('Experient');
  });

  it('resolves a two-level nested key', () => {
    expect(t('common.save')).toBe('Save');
  });

  it('resolves a three-level nested key', () => {
    expect(t('surveys.metrics.responses')).toBe('Responses');
  });

  it('resolves a four-level nested key', () => {
    expect(t('surveys.modals.publish.title')).toBe('Publish Survey');
  });

  it('returns the key itself when the key does not exist', () => {
    expect(t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });

  it('returns the partial path when intermediate node is missing', () => {
    expect(t('brand.nonexistent.deep')).toBe('brand.nonexistent.deep');
  });

  it('returns a non-string leaf as-is — arrays stay arrays', () => {
    const result = t('landing.features') as unknown as unknown[];
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-string leaf as-is — object stays object', () => {
    const result = t('landing.cards') as unknown as unknown[];
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── t() — variable interpolation ─────────────────────────────────────────────

describe('t() — variable interpolation', () => {
  it('interpolates a single {variable}', () => {
    expect(t('credits.remaining', { n: 42 })).toBe('42 credits');
  });

  it('interpolates multiple {variables} in one string', () => {
    expect(t('surveys.countDescription', { count: 5, responses: 200 })).toBe(
      '5 total surveys · 200 total responses'
    );
  });

  it('interpolates a zero value correctly', () => {
    expect(t('credits.remaining', { n: 0 })).toBe('0 credits');
  });

  it('leaves {variable} placeholder when the var is not provided', () => {
    expect(t('credits.remaining')).toBe('{n} credits');
  });

  it('leaves only the missing placeholder when some vars are supplied', () => {
    expect(t('surveys.countDescription', { count: 3 })).toBe(
      '3 total surveys · {responses} total responses'
    );
  });

  it('does not mutate extra vars that are not in the template', () => {
    const result = t('brand.name', { extra: 'ignored' });
    expect(result).toBe('Experient');
  });

  it('interpolates string values as well as numbers', () => {
    expect(t('common.errorLoadingSubject', { subject: 'surveys', message: 'timeout' })).toBe(
      'Error loading surveys: timeout'
    );
  });
});

// ── t() — DEV warning for missing keys ───────────────────────────────────────

describe('t() — missing key warning', () => {
  it('logs a console.warn in DEV mode when key is missing', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    t('totally.missing.key');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('totally.missing.key'));
    spy.mockRestore();
  });

  it('does not throw when a key is missing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => t('totally.missing.key')).not.toThrow();
    vi.restoreAllMocks();
  });
});

// ── setLocale() ───────────────────────────────────────────────────────────────

describe('setLocale()', () => {
  it('does not throw when called with an unknown locale', () => {
    expect(() => setLocale('fr')).not.toThrow();
    expect(() => setLocale('xx')).not.toThrow();
  });

  it('keeps English translations after an invalid locale is set', () => {
    setLocale('zz');
    expect(t('brand.name')).toBe('Experient');
  });
});

// ── useTranslation() ─────────────────────────────────────────────────────────

describe('useTranslation()', () => {
  it('returns an object with a t function', () => {
    const { t: translate } = useTranslation();
    expect(typeof translate).toBe('function');
  });

  it('returned t() resolves keys correctly', () => {
    const { t: translate } = useTranslation();
    expect(translate('brand.name')).toBe('Experient');
  });

  it('returned t() supports interpolation', () => {
    const { t: translate } = useTranslation();
    expect(translate('credits.remaining', { n: 10 })).toBe('10 credits');
  });

  it('returned t() returns the key for missing entries', () => {
    const { t: translate } = useTranslation();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(translate('no.such.key')).toBe('no.such.key');
    vi.restoreAllMocks();
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('t() — edge cases', () => {
  it('handles an empty string key by returning it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(t('')).toBe('');
    vi.restoreAllMocks();
  });

  it('resolves brand.tagline correctly', () => {
    expect(t('brand.tagline')).toBe('Dimensional Intelligence');
  });

  it('handles fill.progress with multiple numeric variables', () => {
    expect(t('fill.progress', { current: 3, total: 10 })).toBe('3 of 10');
  });

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
});
