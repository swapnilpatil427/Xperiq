// Translate between SCIM 2.0 User resources and user_profiles rows.

export const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const EXT_SCHEMA = 'urn:ietf:params:scim:schemas:extension:experient:2.0:User';

export interface ScimEmail {
  value: string;
  primary?: boolean;
  type?: string;
}

export interface ScimPhoneNumber {
  value: string;
  type?: string;
}

export interface ScimPhoto {
  value: string;
  type?: string;
}

export interface ScimName {
  givenName?: string;
  familyName?: string;
  formatted?: string;
}

export interface ScimExtension {
  costCenter?: string;
  employeeId?: string;
  region?: string;
  businessUnit?: string;
  managerId?: string;
}

export interface ScimUser {
  schemas?: string[];
  id?: string;
  externalId?: string;
  userName: string;
  name?: ScimName;
  displayName?: string;
  title?: string;
  active?: boolean;
  emails?: ScimEmail[];
  phoneNumbers?: ScimPhoneNumber[];
  photos?: ScimPhoto[];
  locale?: string;
  timezone?: string;
  costCenter?: string;
  department?: string;
  [key: string]: unknown;
}

export interface ProfileFields {
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  jobTitle?: string | null;
  isActive?: boolean;
  costCenter?: string | null;
  employeeId?: string | null;
  locale?: string | null;
  timezone?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  externalId?: string | null;
  departmentName?: string | null;
  customAttributes?: Record<string, unknown>;
}

// SCIM User payload → flat profile fields (camelCase-ish for our columns).
export function scimToProfile(scimUser: ScimUser): ProfileFields {
  const primaryEmail =
    (scimUser.emails || []).find((e) => e.primary)?.value ||
    (scimUser.emails || [])[0]?.value ||
    scimUser.userName;

  const ext = (scimUser[EXT_SCHEMA] as ScimExtension | undefined) || {};
  return {
    email: primaryEmail,
    firstName: scimUser.name?.givenName ?? null,
    lastName: scimUser.name?.familyName ?? null,
    displayName: scimUser.displayName ?? null,
    jobTitle: scimUser.title ?? null,
    isActive: scimUser.active !== undefined ? !!scimUser.active : true,
    costCenter: ext.costCenter ?? (scimUser.costCenter as string | undefined) ?? null,
    employeeId: ext.employeeId ?? null,
    locale: scimUser.locale ?? null,
    timezone: scimUser.timezone ?? null,
    phone: (scimUser.phoneNumbers || [])[0]?.value ?? null,
    avatarUrl: (scimUser.photos || [])[0]?.value ?? null,
    externalId: scimUser.externalId ?? null,
    departmentName: (scimUser.department as string | undefined) ?? ext.businessUnit ?? null,
    customAttributes: {
      ...(ext.region ? { region: ext.region } : {}),
      ...(ext.businessUnit ? { business_unit: ext.businessUnit } : {}),
      ...(ext.managerId ? { manager_id: ext.managerId } : {}),
    },
  };
}

export interface UserProfileRow {
  user_id: string;
  org_id?: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  job_title?: string | null;
  is_active?: boolean;
  deprovisioned_at?: string | null;
  scim_external_id?: string | null;
  employee_id?: string | null;
  cost_center?: string | null;
  locale?: string | null;
  timezone?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// user_profiles row → SCIM User resource.
export function profileToScim(row: UserProfileRow, { baseUrl = '' }: { baseUrl?: string } = {}): Record<string, unknown> {
  return {
    schemas: [USER_SCHEMA, EXT_SCHEMA],
    id: row.user_id,
    externalId: row.scim_external_id || undefined,
    userName: row.email,
    name: { givenName: row.first_name || undefined, familyName: row.last_name || undefined },
    displayName: row.display_name || undefined,
    title: row.job_title || undefined,
    active: !!row.is_active && !row.deprovisioned_at,
    emails: row.email ? [{ value: row.email, primary: true, type: 'work' }] : [],
    locale: row.locale || undefined,
    timezone: row.timezone || undefined,
    [EXT_SCHEMA]: {
      employeeId: row.employee_id || undefined,
      costCenter: row.cost_center || undefined,
    },
    meta: {
      resourceType: 'User',
      created: row.created_at,
      lastModified: row.updated_at,
      location: baseUrl ? `${baseUrl}/Users/${row.user_id}` : undefined,
    },
  };
}

export interface ScimOperation {
  op?: string;
  path?: string;
  value?: unknown;
}

// Apply a SCIM PATCH (RFC 7644) Operations array to a partial-update object.
// Supports the common Okta/Azure shapes: replace active, replace simple attrs.
export function applyScimPatch(operations: ScimOperation[] = []): ProfileFields {
  const update: Record<string, unknown> = {};
  for (const op of operations) {
    const verb = String(op.op || '').toLowerCase();
    if (verb !== 'replace' && verb !== 'add') continue;

    // Form 1: { op, value: { active: false, ... } }
    if (op.value && typeof op.value === 'object' && !op.path) {
      Object.assign(update, mapScimAttr(op.value as Record<string, unknown>));
    } else if (op.path) {
      // Form 2: { op, path: "active", value: false }
      update[normalizePath(op.path)] = op.value;
    }
  }
  return mapScimAttr(update);
}

function normalizePath(path: string): string {
  return String(path).split('.').pop() ?? path;
}

// Map SCIM attribute names → our update payload keys.
function mapScimAttr(obj: Record<string, unknown>): ProfileFields {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    switch (k) {
      case 'active': out.isActive = !!v; break;
      case 'title': out.jobTitle = v; break;
      case 'displayName': out.displayName = v; break;
      case 'givenName': out.firstName = v; break;
      case 'familyName': out.lastName = v; break;
      case 'userName': out.email = v; break;
      case 'isActive': case 'jobTitle': case 'firstName':
      case 'lastName': case 'email': out[k] = v; break;
      default: break; // ignore unknown attrs
    }
  }
  return out as ProfileFields;
}
