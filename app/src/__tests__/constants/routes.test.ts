import { describe, it, expect } from 'vitest';
import { ROUTES, toPath } from '../../constants/routes';

// ── ROUTES object shape ───────────────────────────────────────────────────────

describe('ROUTES — shape', () => {
  const expectedKeys = [
    'LANDING', 'SIGNIN', 'ONBOARDING',
    'SURVEYS', 'CREATE', 'BUILDER', 'RESPONSE_DASHBOARD',
    'INSIGHTS', 'ADVANCED_INSIGHTS',
    'RESPONDENTS', 'TEMPLATES', 'TEMPLATE_EDITOR',
    'WORKFLOWS', 'SETTINGS', 'DATA',
  ];

  it('contains all expected route keys', () => {
    expectedKeys.forEach((key) => {
      expect(ROUTES).toHaveProperty(key);
    });
  });

  it('every value is a non-empty string', () => {
    Object.values(ROUTES).forEach((route) => {
      expect(typeof route).toBe('string');
      expect(route.length).toBeGreaterThan(0);
    });
  });

  it('every value starts with a leading slash', () => {
    Object.values(ROUTES).forEach((route) => {
      expect(route.startsWith('/')).toBe(true);
    });
  });

  it('all route values are unique — no duplicates', () => {
    const values = Object.values(ROUTES);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ── ROUTES — specific values ──────────────────────────────────────────────────

describe('ROUTES — specific values', () => {
  it('LANDING is "/"', () => {
    expect(ROUTES.LANDING).toBe('/');
  });

  it('SURVEYS is "/app/surveys"', () => {
    expect(ROUTES.SURVEYS).toBe('/app/surveys');
  });

  it('CREATE is "/app/surveys/create"', () => {
    expect(ROUTES.CREATE).toBe('/app/surveys/create');
  });

  it('BUILDER contains ":surveyId" param', () => {
    expect(ROUTES.BUILDER).toContain(':surveyId');
  });

  it('RESPONSE_DASHBOARD contains ":surveyId" param', () => {
    expect(ROUTES.RESPONSE_DASHBOARD).toContain(':surveyId');
  });

  it('SETTINGS is "/app/settings"', () => {
    expect(ROUTES.SETTINGS).toBe('/app/settings');
  });

  it('INSIGHTS and ADVANCED_INSIGHTS are different paths', () => {
    expect(ROUTES.INSIGHTS).not.toBe(ROUTES.ADVANCED_INSIGHTS);
    expect(ROUTES.ADVANCED_INSIGHTS.startsWith(ROUTES.INSIGHTS)).toBe(true);
  });

  it('SIGNIN does not contain "/app" prefix', () => {
    expect(ROUTES.SIGNIN.startsWith('/app')).toBe(false);
  });
});

// ── toPath() ──────────────────────────────────────────────────────────────────

describe('toPath()', () => {
  it('replaces :surveyId in BUILDER', () => {
    expect(toPath(ROUTES.BUILDER, { surveyId: 'abc-123' })).toBe(
      '/app/surveys/abc-123/build'
    );
  });

  it('replaces :surveyId in RESPONSE_DASHBOARD', () => {
    expect(toPath(ROUTES.RESPONSE_DASHBOARD, { surveyId: 'xyz-456' })).toBe(
      '/app/surveys/xyz-456/responses'
    );
  });

  it('returns the route unchanged when called with no params argument', () => {
    expect(toPath(ROUTES.SURVEYS)).toBe('/app/surveys');
  });

  it('returns the route unchanged when called with an empty params object', () => {
    expect(toPath(ROUTES.SETTINGS, {})).toBe('/app/settings');
  });

  it('ignores extra params that do not exist in the route', () => {
    expect(toPath(ROUTES.SURVEYS, { foo: 'bar', baz: 'qux' })).toBe('/app/surveys');
  });

  it('replaces only the matching param and leaves extra params unused', () => {
    const result = toPath(ROUTES.BUILDER, { surveyId: '999', extra: 'ignored' });
    expect(result).toBe('/app/surveys/999/build');
    expect(result).not.toContain(':surveyId');
    expect(result).not.toContain('extra');
  });

  it('works with numeric-string surveyIds', () => {
    expect(toPath(ROUTES.BUILDER, { surveyId: '12345' })).toBe(
      '/app/surveys/12345/build'
    );
  });

  it('leaves unresolved :param tokens when param is not supplied', () => {
    // toPath with a missing param should leave the token in-place
    const result = toPath(ROUTES.BUILDER, {});
    expect(result).toContain(':surveyId');
  });

  it('works on plain non-parameterised routes', () => {
    expect(toPath(ROUTES.WORKFLOWS)).toBe('/app/workflows');
    expect(toPath(ROUTES.DATA)).toBe('/app/data');
  });

  it('handles UUID-format surveyIds', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = toPath(ROUTES.BUILDER, { surveyId: uuid });
    expect(result).toBe(`/app/surveys/${uuid}/build`);
    expect(result).not.toContain(':surveyId');
  });
});
