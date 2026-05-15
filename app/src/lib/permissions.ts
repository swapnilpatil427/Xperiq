import { useOrganization } from '@clerk/react';

export type OrgRole = 'org:admin' | 'org:analyst' | 'org:viewer' | null;

const ROLE_RANK: Record<string, number> = {
  'org:admin':   3,
  'org:analyst': 2,
  'org:viewer':  1,
};

export interface Permissions {
  role: OrgRole;
  isAdmin: boolean;
  isAnalyst: boolean;
  isViewer: boolean;
  can: (minRole: 'admin' | 'analyst' | 'viewer') => boolean;
}

const DEMO_PERMISSIONS: Permissions = {
  role: 'org:admin',
  isAdmin: true,
  isAnalyst: true,
  isViewer: true,
  can: () => true,
};

// Clerk-backed implementation — only used when VITE_CLERK_PUBLISHABLE_KEY is set.
// useOrganization() must be called unconditionally (React rules), so this hook
// must never be rendered outside a ClerkProvider.
export function usePermissionsWithClerk(): Permissions {
  const { membership } = useOrganization();
  const role = (membership?.role ?? null) as OrgRole;
  const rank = role ? (ROLE_RANK[role] ?? 0) : 0;
  return {
    role,
    isAdmin:   rank >= ROLE_RANK['org:admin'],
    isAnalyst: rank >= ROLE_RANK['org:analyst'],
    isViewer:  rank >= ROLE_RANK['org:viewer'],
    can: (minRole) => rank >= (ROLE_RANK[`org:${minRole}`] ?? 0),
  };
}

// Demo implementation — returns full admin access, calls no Clerk hooks.
function usePermissionsDemo(): Permissions {
  return DEMO_PERMISSIONS;
}

// Branch at module evaluation time (Vite replaces import.meta.env at build time).
// React sees the same stable function reference on every render, so hooks rules are satisfied.
export const usePermissions: () => Permissions = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  ? usePermissionsWithClerk
  : usePermissionsDemo;
