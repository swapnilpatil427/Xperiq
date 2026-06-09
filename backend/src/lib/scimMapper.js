// Translate between SCIM 2.0 User resources and user_profiles rows.
const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const EXT_SCHEMA = 'urn:ietf:params:scim:schemas:extension:experient:2.0:User';

// SCIM User payload → flat profile fields (camelCase-ish for our columns).
function scimToProfile(scimUser) {
  const primaryEmail =
    (scimUser.emails || []).find((e) => e.primary)?.value ||
    (scimUser.emails || [])[0]?.value ||
    scimUser.userName;

  const ext = scimUser[EXT_SCHEMA] || {};
  return {
    email: primaryEmail,
    firstName: scimUser.name?.givenName ?? null,
    lastName: scimUser.name?.familyName ?? null,
    displayName: scimUser.displayName ?? null,
    jobTitle: scimUser.title ?? null,
    isActive: scimUser.active !== undefined ? !!scimUser.active : true,
    costCenter: ext.costCenter ?? scimUser.costCenter ?? null,
    employeeId: ext.employeeId ?? null,
    locale: scimUser.locale ?? null,
    timezone: scimUser.timezone ?? null,
    phone: (scimUser.phoneNumbers || [])[0]?.value ?? null,
    avatarUrl: (scimUser.photos || [])[0]?.value ?? null,
    externalId: scimUser.externalId ?? null,
    departmentName: scimUser.department ?? ext.businessUnit ?? null,
    customAttributes: {
      ...(ext.region ? { region: ext.region } : {}),
      ...(ext.businessUnit ? { business_unit: ext.businessUnit } : {}),
      ...(ext.managerId ? { manager_id: ext.managerId } : {}),
    },
  };
}

// user_profiles row → SCIM User resource.
function profileToScim(row, { baseUrl = '' } = {}) {
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

// Apply a SCIM PATCH (RFC 7644) Operations array to a partial-update object.
// Supports the common Okta/Azure shapes: replace active, replace simple attrs.
function applyScimPatch(operations = []) {
  const update = {};
  for (const op of operations) {
    const verb = String(op.op || '').toLowerCase();
    if (verb !== 'replace' && verb !== 'add') continue;

    // Form 1: { op, value: { active: false, ... } }
    if (op.value && typeof op.value === 'object' && !op.path) {
      Object.assign(update, mapScimAttr(op.value));
    } else if (op.path) {
      // Form 2: { op, path: "active", value: false }
      update[normalizePath(op.path)] = op.value;
    }
  }
  return mapScimAttr(update);
}

function normalizePath(path) {
  return String(path).split('.').pop();
}

// Map SCIM attribute names → our update payload keys.
function mapScimAttr(obj) {
  const out = {};
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
  return out;
}

module.exports = { scimToProfile, profileToScim, applyScimPatch, USER_SCHEMA, EXT_SCHEMA };
