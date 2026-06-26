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
  // Contact data access
  'contacts:read',              // view contact list (PII masked)
  'contacts:pii:read',          // unmask email / name / phone
  'contacts:write',             // create and edit contacts
  'contacts:import',            // bulk import / CRM sync runs
  'contacts:export',            // download CSV export
  'contacts:anonymize',         // GDPR erase (irreversible)
  'contacts:segment:manage',    // create, edit, delete segments
  // Outreach — customer-facing sends
  'outreach:transactional',     // send to individuals (survey invite, case update)
  'outreach:broadcast',         // send to a segment (mass send — highest trust)
  'outreach:approve',           // approve a pending broadcast before it fires
  'outreach:suppress',          // manage unsubscribe / suppression lists
  'outreach:configure',         // configure org Slack/Teams/Discord channels
  'outreach:logs:read',         // view delivery logs and open/click analytics
  // Crystal AI outreach
  'crystal:propose_outreach',   // Crystal surfaces distribution proposals
  'crystal:converse',           // Crystal Novu Connect conversations
  'crystal:auto_trigger',       // Crystal triggers workflows without confirmation
];

export const PERMISSION_SCOPES: PermissionScope[] = ['ALL', 'OWNED', 'SHARED', 'OWN', 'NONE'];

// Rank used for requireRole backward-compatibility ordering.
export const ROLE_RANK: Record<string, number> = {
  'org:super_admin': 7,
  'org:admin': 6,
  'org:program_admin': 5,
  'org:cx_manager': 4,    // NEW
  'org:analyst': 3,
  'org:survey_creator': 2,
  'org:report_viewer': 1,
  'org:member': 0,
};

// The 8 built-in roles. `permissions` keys are PERMISSION_ACTIONS; values are scopes.
export const BUILTIN_ROLES: BuiltinRole[] = [
  {
    builtinKey: 'org:super_admin', name: 'Super Admin',
    description: 'Full platform control', seatWeight: 1.0,
    permissions: {
      'survey:read': 'ALL', 'survey:write': 'ALL', 'survey:distribute': 'ALL',
      'survey:insights:read': 'ALL', 'survey:insights:generate': 'ALL',
      'survey:responses:export': 'ALL', 'survey:delete': 'ALL', 'dashboard:read': 'ALL',
      'alerts:manage': 'ALL', 'workflows:manage': 'ALL', 'users:manage': 'ALL', 'billing:manage': 'ALL',
      // Contact permissions
      'contacts:read': 'ALL', 'contacts:pii:read': 'ALL', 'contacts:write': 'ALL',
      'contacts:import': 'ALL', 'contacts:export': 'ALL', 'contacts:anonymize': 'ALL',
      'contacts:segment:manage': 'ALL',
      // Outreach permissions
      'outreach:transactional': 'ALL', 'outreach:broadcast': 'ALL', 'outreach:approve': 'ALL',
      'outreach:suppress': 'ALL', 'outreach:configure': 'ALL', 'outreach:logs:read': 'ALL',
      // Crystal
      'crystal:propose_outreach': 'ALL', 'crystal:converse': 'ALL', 'crystal:auto_trigger': 'ALL',
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
      // Contact permissions
      'contacts:read': 'ALL', 'contacts:pii:read': 'ALL', 'contacts:write': 'ALL',
      'contacts:import': 'ALL', 'contacts:export': 'ALL', 'contacts:anonymize': 'NONE',
      'contacts:segment:manage': 'ALL',
      // Outreach permissions
      'outreach:transactional': 'ALL', 'outreach:broadcast': 'ALL', 'outreach:approve': 'NONE',
      'outreach:suppress': 'ALL', 'outreach:configure': 'ALL', 'outreach:logs:read': 'ALL',
      // Crystal
      'crystal:propose_outreach': 'ALL', 'crystal:converse': 'ALL', 'crystal:auto_trigger': 'NONE',
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
      // Contact permissions
      'contacts:read': 'OWNED', 'contacts:pii:read': 'OWNED', 'contacts:write': 'OWNED',
      'contacts:import': 'NONE', 'contacts:export': 'NONE', 'contacts:anonymize': 'NONE',
      'contacts:segment:manage': 'OWNED',
      // Outreach permissions
      'outreach:transactional': 'OWNED', 'outreach:broadcast': 'NONE', 'outreach:approve': 'NONE',
      'outreach:suppress': 'NONE', 'outreach:configure': 'NONE', 'outreach:logs:read': 'OWNED',
      // Crystal
      'crystal:propose_outreach': 'ALL', 'crystal:converse': 'OWNED', 'crystal:auto_trigger': 'NONE',
    },
  },
  {
    builtinKey: 'org:cx_manager', name: 'CX Manager',
    description: 'Manage contact outreach and close-the-loop campaigns', seatWeight: 0.75,
    permissions: {
      'survey:read': 'ALL', 'survey:write': 'NONE', 'survey:distribute': 'ALL',
      'survey:insights:read': 'ALL', 'survey:insights:generate': 'ALL',
      'survey:responses:export': 'ALL', 'survey:delete': 'NONE', 'dashboard:read': 'ALL',
      'alerts:manage': 'NONE', 'workflows:manage': 'NONE', 'users:manage': 'NONE', 'billing:manage': 'NONE',
      // Contact permissions
      'contacts:read': 'ALL', 'contacts:pii:read': 'ALL', 'contacts:write': 'ALL',
      'contacts:import': 'ALL', 'contacts:export': 'ALL', 'contacts:anonymize': 'NONE',
      'contacts:segment:manage': 'ALL',
      // Outreach permissions
      'outreach:transactional': 'ALL', 'outreach:broadcast': 'ALL', 'outreach:approve': 'NONE',
      'outreach:suppress': 'ALL', 'outreach:configure': 'NONE', 'outreach:logs:read': 'ALL',
      // Crystal
      'crystal:propose_outreach': 'ALL', 'crystal:converse': 'ALL', 'crystal:auto_trigger': 'NONE',
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
      // Contact permissions
      'contacts:read': 'ALL', 'contacts:pii:read': 'NONE', 'contacts:write': 'NONE',
      'contacts:import': 'NONE', 'contacts:export': 'NONE', 'contacts:anonymize': 'NONE',
      'contacts:segment:manage': 'NONE',
      // Outreach permissions
      'outreach:transactional': 'NONE', 'outreach:broadcast': 'NONE', 'outreach:approve': 'NONE',
      'outreach:suppress': 'NONE', 'outreach:configure': 'NONE', 'outreach:logs:read': 'ALL',
      // Crystal
      'crystal:propose_outreach': 'ALL', 'crystal:converse': 'NONE', 'crystal:auto_trigger': 'NONE',
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
      // Contact permissions
      'contacts:read': 'OWNED', 'contacts:pii:read': 'NONE', 'contacts:write': 'NONE',
      'contacts:import': 'NONE', 'contacts:export': 'NONE', 'contacts:anonymize': 'NONE',
      'contacts:segment:manage': 'NONE',
      // Outreach permissions
      'outreach:transactional': 'OWNED', 'outreach:broadcast': 'NONE', 'outreach:approve': 'NONE',
      'outreach:suppress': 'NONE', 'outreach:configure': 'NONE', 'outreach:logs:read': 'OWNED',
      // Crystal
      'crystal:propose_outreach': 'ALL', 'crystal:converse': 'NONE', 'crystal:auto_trigger': 'NONE',
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
      // Contact permissions
      'contacts:read': 'NONE', 'contacts:pii:read': 'NONE', 'contacts:write': 'NONE',
      'contacts:import': 'NONE', 'contacts:export': 'NONE', 'contacts:anonymize': 'NONE',
      'contacts:segment:manage': 'NONE',
      // Outreach permissions
      'outreach:transactional': 'NONE', 'outreach:broadcast': 'NONE', 'outreach:approve': 'NONE',
      'outreach:suppress': 'NONE', 'outreach:configure': 'NONE', 'outreach:logs:read': 'NONE',
      // Crystal
      'crystal:propose_outreach': 'NONE', 'crystal:converse': 'NONE', 'crystal:auto_trigger': 'NONE',
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
      // Contact permissions
      'contacts:read': 'NONE', 'contacts:pii:read': 'NONE', 'contacts:write': 'NONE',
      'contacts:import': 'NONE', 'contacts:export': 'NONE', 'contacts:anonymize': 'NONE',
      'contacts:segment:manage': 'NONE',
      // Outreach permissions
      'outreach:transactional': 'NONE', 'outreach:broadcast': 'NONE', 'outreach:approve': 'NONE',
      'outreach:suppress': 'NONE', 'outreach:configure': 'NONE', 'outreach:logs:read': 'NONE',
      // Crystal
      'crystal:propose_outreach': 'NONE', 'crystal:converse': 'NONE', 'crystal:auto_trigger': 'NONE',
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
