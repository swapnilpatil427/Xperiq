// Shared RBAC definitions — the single source of truth for built-in roles, the
// permission action catalog, and role ranking. Mirrors the seed in
// migration 20260603000010_user_directory_core.sql so newly-created orgs can be
// seeded at runtime (ensureBuiltinRoles) with identical definitions.

import type { PermissionAction, PermissionScope, BuiltinRole } from '../types';

// Permission action catalog (doc §2). Used to validate custom-role payloads.
export const PERMISSION_ACTIONS: PermissionAction[] = [
  'survey:read',
  'survey:write',
  'survey:distribute',
  'survey:insights:read',
  'survey:insights:generate',
  'survey:responses:export',
  'survey:delete',
  'dashboard:read',
  'alerts:manage',
  'workflows:manage',
  'users:manage',
  'billing:manage',
];

export const PERMISSION_SCOPES: PermissionScope[] = ['ALL', 'OWNED', 'SHARED', 'OWN', 'NONE'];

// Rank used for requireRole backward-compatibility ordering.
export const ROLE_RANK: Record<string, number> = {
  'org:super_admin': 7,
  'org:admin': 6,
  'org:program_admin': 5,
  'org:analyst': 4,
  'org:survey_creator': 3,
  'org:report_viewer': 2,
  'org:member': 1,
};

// The 7 built-in roles. `permissions` keys are PERMISSION_ACTIONS; values are scopes.
export const BUILTIN_ROLES: BuiltinRole[] = [
  {
    builtinKey: 'org:super_admin', name: 'Super Admin',
    description: 'Full platform control', seatWeight: 1.0,
    permissions: {
      'survey:read': 'ALL', 'survey:write': 'ALL', 'survey:distribute': 'ALL',
      'survey:insights:read': 'ALL', 'survey:insights:generate': 'ALL',
      'survey:responses:export': 'ALL', 'survey:delete': 'ALL', 'dashboard:read': 'ALL',
      'alerts:manage': 'ALL', 'workflows:manage': 'ALL', 'users:manage': 'ALL', 'billing:manage': 'ALL',
    },
  },
  {
    builtinKey: 'org:admin', name: 'Admin',
    description: 'Manage users and all surveys', seatWeight: 1.0,
    permissions: {
      'survey:read': 'ALL', 'survey:write': 'ALL', 'survey:distribute': 'ALL',
      'survey:insights:read': 'ALL', 'survey:insights:generate': 'ALL',
      'survey:responses:export': 'ALL', 'survey:delete': 'ALL', 'dashboard:read': 'ALL',
      'alerts:manage': 'ALL', 'workflows:manage': 'ALL', 'users:manage': 'ALL', 'billing:manage': 'NONE',
    },
  },
  {
    builtinKey: 'org:program_admin', name: 'Program Admin',
    description: 'Manage own survey programs', seatWeight: 1.0,
    permissions: {
      'survey:read': 'OWNED', 'survey:write': 'OWNED', 'survey:distribute': 'OWNED',
      'survey:insights:read': 'OWNED', 'survey:insights:generate': 'OWNED',
      'survey:responses:export': 'OWNED', 'survey:delete': 'OWNED', 'dashboard:read': 'ALL',
      'alerts:manage': 'OWNED', 'workflows:manage': 'ALL', 'users:manage': 'NONE', 'billing:manage': 'NONE',
    },
  },
  {
    builtinKey: 'org:analyst', name: 'Analyst',
    description: 'Read all surveys and insights', seatWeight: 1.0,
    permissions: {
      'survey:read': 'ALL', 'survey:write': 'NONE', 'survey:distribute': 'NONE',
      'survey:insights:read': 'ALL', 'survey:insights:generate': 'ALL',
      'survey:responses:export': 'ALL', 'survey:delete': 'NONE', 'dashboard:read': 'ALL',
      'alerts:manage': 'NONE', 'workflows:manage': 'NONE', 'users:manage': 'NONE', 'billing:manage': 'NONE',
    },
  },
  {
    builtinKey: 'org:survey_creator', name: 'Survey Creator',
    description: 'Create and manage own surveys', seatWeight: 1.0,
    permissions: {
      'survey:read': 'OWNED', 'survey:write': 'OWNED', 'survey:distribute': 'OWNED',
      'survey:insights:read': 'OWNED', 'survey:insights:generate': 'OWNED',
      'survey:responses:export': 'NONE', 'survey:delete': 'OWNED', 'dashboard:read': 'OWNED',
      'alerts:manage': 'OWNED', 'workflows:manage': 'NONE', 'users:manage': 'NONE', 'billing:manage': 'NONE',
    },
  },
  {
    builtinKey: 'org:report_viewer', name: 'Report Viewer',
    description: 'View shared dashboards', seatWeight: 0.5,
    permissions: {
      'survey:read': 'SHARED', 'survey:write': 'NONE', 'survey:distribute': 'NONE',
      'survey:insights:read': 'SHARED', 'survey:insights:generate': 'NONE',
      'survey:responses:export': 'NONE', 'survey:delete': 'NONE', 'dashboard:read': 'SHARED',
      'alerts:manage': 'NONE', 'workflows:manage': 'NONE', 'users:manage': 'NONE', 'billing:manage': 'NONE',
    },
  },
  {
    builtinKey: 'org:member', name: 'Member',
    description: 'Survey respondents only', seatWeight: 0.0,
    permissions: {
      'survey:read': 'NONE', 'survey:write': 'NONE', 'survey:distribute': 'NONE',
      'survey:insights:read': 'NONE', 'survey:insights:generate': 'NONE',
      'survey:responses:export': 'NONE', 'survey:delete': 'NONE', 'dashboard:read': 'NONE',
      'alerts:manage': 'NONE', 'workflows:manage': 'NONE', 'users:manage': 'NONE', 'billing:manage': 'NONE',
    },
  },
];

// Map a Clerk org role to one of our built-in keys (used during backfill / invite).
export function clerkRoleToBuiltinKey(clerkRole: string): string {
  switch (clerkRole) {
    case 'org:admin': return 'org:admin';
    case 'org:analyst': return 'org:analyst';
    default: return 'org:member';
  }
}
