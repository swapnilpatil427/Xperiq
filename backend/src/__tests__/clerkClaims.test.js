import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const { getOrgClaims } = _require(resolve(__dirname, '../lib/clerkClaims'));

describe('getOrgClaims', () => {
  it('reads Clerk v2 nested claims and prefixes the role', () => {
    const payload = { sub: 'user_1', v: 2, o: { id: 'org_1', rol: 'admin', slg: 'acme' } };
    expect(getOrgClaims(payload)).toEqual({ orgId: 'org_1', orgRole: 'org:admin', orgSlug: 'acme' });
  });

  it('reads legacy v1 flat claims', () => {
    const payload = { sub: 'user_1', org_id: 'org_1', org_role: 'org:analyst', org_slug: 'acme' };
    expect(getOrgClaims(payload)).toEqual({ orgId: 'org_1', orgRole: 'org:analyst', orgSlug: 'acme' });
  });

  it('does not double-prefix a v2 role that already has org:', () => {
    const payload = { v: 2, o: { id: 'org_1', rol: 'org:cx_manager' } };
    expect(getOrgClaims(payload).orgRole).toBe('org:cx_manager');
  });

  it('returns nulls when there is no org (personal session)', () => {
    expect(getOrgClaims({ sub: 'user_1' })).toEqual({ orgId: null, orgRole: null, orgSlug: null });
  });

  it('is safe on null/undefined input', () => {
    expect(getOrgClaims(undefined)).toEqual({ orgId: null, orgRole: null, orgSlug: null });
  });
});
