import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/react', () => ({
  useOrganization: vi.fn(),
}));

import { useOrganization } from '@clerk/react';
import { renderHook } from '@testing-library/react';
import { usePermissionsWithClerk, usePermissions } from '../../lib/permissions';

const mockUseOrganization = useOrganization as ReturnType<typeof vi.fn>;

// usePermissionsWithClerk — tests the role-specific logic directly.
// The module-level export (usePermissions) is branched at load time based on
// VITE_CLERK_PUBLISHABLE_KEY, which is not set in the test environment, so we
// test the two implementations separately.

describe('usePermissionsWithClerk', () => {
  it('returns isAdmin=true for org:admin', () => {
    mockUseOrganization.mockReturnValue({ membership: { role: 'org:admin' } });
    const { result } = renderHook(() => usePermissionsWithClerk());
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isAnalyst).toBe(true);
    expect(result.current.isViewer).toBe(true);
    expect(result.current.role).toBe('org:admin');
    expect(result.current.can('admin')).toBe(true);
    expect(result.current.can('analyst')).toBe(true);
  });

  it('returns correct flags for org:analyst', () => {
    mockUseOrganization.mockReturnValue({ membership: { role: 'org:analyst' } });
    const { result } = renderHook(() => usePermissionsWithClerk());
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isAnalyst).toBe(true);
    expect(result.current.isViewer).toBe(true);
    expect(result.current.can('admin')).toBe(false);
    expect(result.current.can('analyst')).toBe(true);
  });

  it('returns correct flags for org:viewer', () => {
    mockUseOrganization.mockReturnValue({ membership: { role: 'org:viewer' } });
    const { result } = renderHook(() => usePermissionsWithClerk());
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isAnalyst).toBe(false);
    expect(result.current.isViewer).toBe(true);
    expect(result.current.can('viewer')).toBe(true);
    expect(result.current.can('analyst')).toBe(false);
  });

  it('returns all-false when membership is null (no org)', () => {
    mockUseOrganization.mockReturnValue({ membership: null });
    const { result } = renderHook(() => usePermissionsWithClerk());
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isAnalyst).toBe(false);
    expect(result.current.isViewer).toBe(false);
    expect(result.current.role).toBeNull();
  });
});

// usePermissions (module export) — in test env VITE_CLERK_PUBLISHABLE_KEY is
// not set, so the export resolves to usePermissionsDemo which always grants admin.
describe('usePermissions (demo mode — no Clerk key in test env)', () => {
  it('returns full admin access when no Clerk key is set', () => {
    mockUseOrganization.mockReturnValue({ membership: null });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.can('admin')).toBe(true);
  });
});

describe('features — isEnterpriseMode', () => {
  it('is true with 5+ members', async () => {
    const { isEnterpriseMode } = await import('../../lib/features');
    expect(isEnterpriseMode(5, 'free')).toBe(true);
    expect(isEnterpriseMode(4, 'free')).toBe(false);
  });

  it('is true for business plan regardless of member count', async () => {
    const { isEnterpriseMode } = await import('../../lib/features');
    expect(isEnterpriseMode(1, 'business')).toBe(true);
    expect(isEnterpriseMode(0, 'enterprise')).toBe(true);
  });

  it('respects plan tier feature flags', async () => {
    const { getFeatureFlags } = await import('../../lib/features');
    const freeFlags = getFeatureFlags('free');
    expect(freeFlags.aiGeneration).toBe(false);
    expect(freeFlags.sso).toBe(false);

    const starterFlags = getFeatureFlags('starter');
    expect(starterFlags.aiGeneration).toBe(true);
    expect(starterFlags.sso).toBe(false);

    const enterpriseFlags = getFeatureFlags('enterprise');
    expect(enterpriseFlags.sso).toBe(true);
    expect(enterpriseFlags.whiteLabel).toBe(true);
  });
});
