// Frontend mirror of the backend permission catalog (backend/src/lib/rbac.js).
// Keep in sync with that file.
import type { PermissionScope } from '../lib/api';

export const PERMISSION_ACTIONS = [
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
] as const;

export const PERMISSION_SCOPES: PermissionScope[] = ['ALL', 'OWNED', 'SHARED', 'OWN', 'NONE'];
