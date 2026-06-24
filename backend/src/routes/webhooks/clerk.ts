// Clerk webhook receiver — keeps user_profiles in sync with Clerk identity and
// org membership, and applies SSO attribute mapping on first SSO login.
//
// Mounted at /webhooks/clerk with a RAW body parser (signature must be verified
// against the exact bytes). No Clerk JWT here — auth is the Svix signature.
import express from 'express';
import { query as dbQuery } from '../../lib/db';
import { auditLog } from '../../lib/auditLog';
import { verifySvixSignature } from '../../lib/clerkWebhook';
import { getRoleIdByBuiltinKey } from '../../lib/userProfiles';

const router = express.Router();

router.post('/', async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  // req.body is a Buffer (raw parser mounted in index.js).
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

  if (!secret || !verifySvixSignature(raw, req.headers as Record<string, string | string[] | undefined>, secret)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  let event: { type: string; data: Record<string, unknown> };
  try { event = JSON.parse(raw.toString('utf8')); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { type, data } = event;
  try {
    switch (type) {
      case 'user.created':
      case 'user.updated':
      case 'organizationMembership.created':
        await handleUserUpsert(data);
        break;
      case 'organizationMembership.deleted':
        await handleMemberRemoved(data);
        break;
      case 'session.created':
        await handleSessionCreated(data);
        break;
      default:
        break; // ignore unhandled
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('../../lib/logger') as { error: (obj: Record<string, unknown>) => void })
        .error({ event: 'clerk_webhook_handler_error', type, err: error.message });
    } catch { console.error('clerk webhook handler error:', error.message); }
    // Still 200 so Clerk doesn't retry forever on a non-transient handler bug.
  }
  res.json({ received: true });
});

interface ClerkUserData {
  organization?: { id?: string };
  organization_id?: string;
  public_user_data?: {
    user_id?: string;
    identifier?: string;
    first_name?: string;
    last_name?: string;
    public_metadata?: Record<string, unknown>;
  };
  user_id?: string;
  id?: string;
  email_addresses?: Array<{ email_address: string }>;
  first_name?: string;
  last_name?: string;
  public_metadata?: Record<string, unknown>;
  unsafe_metadata?: Record<string, unknown>;
}

interface UserProfile {
  email: string;
  first_name: string | null;
  last_name: string | null;
  job_title: null;
  cost_center: null;
  employee_id: null;
  department_name: string | null;
  custom_attributes: Record<string, unknown>;
  provisioned_by: string;
  display_name?: string;
  [key: string]: unknown;
}

async function handleUserUpsert(data: Record<string, unknown>): Promise<void> {
  const d = data as ClerkUserData;
  const orgId = d.organization?.id || d.organization_id;
  const userId = d.public_user_data?.user_id || d.user_id || d.id;
  if (!orgId || !userId) return; // not an org-scoped event

  const { rows: [mapping] } = await dbQuery(
    'SELECT mappings FROM sso_attribute_mappings WHERE org_id = $1', [orgId]
  );
  const meta = (d.public_user_data?.public_metadata || d.public_metadata || d.unsafe_metadata || {}) as Record<string, unknown>;
  const samlAttrs = (meta.samlAttributes || {}) as Record<string, string>;

  const profile: UserProfile = {
    email: d.email_addresses?.[0]?.email_address || d.public_user_data?.identifier || `${userId}@unknown.local`,
    first_name: d.first_name || d.public_user_data?.first_name || null,
    last_name: d.last_name || d.public_user_data?.last_name || null,
    job_title: null, cost_center: null, employee_id: null,
    department_name: null,
    custom_attributes: {},
    provisioned_by: Object.keys(samlAttrs).length ? 'sso' : 'invite',
  };

  if (mapping?.mappings) applySamlMapping(profile, samlAttrs, mapping.mappings as Record<string, string>);
  profile.display_name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;

  let departmentId: string | null = null;
  if (profile.department_name) departmentId = await resolveOrCreateDepartment(orgId, profile.department_name);

  const roleId = await getRoleIdByBuiltinKey(orgId, 'org:member');

  await dbQuery(
    `INSERT INTO user_profiles (user_id, org_id, email, first_name, last_name, display_name,
       job_title, department_id, cost_center, employee_id, custom_attributes, role_id, provisioned_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
     ON CONFLICT (user_id) DO UPDATE SET
       email=EXCLUDED.email, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
       display_name=EXCLUDED.display_name,
       job_title=COALESCE(EXCLUDED.job_title, user_profiles.job_title),
       department_id=COALESCE(EXCLUDED.department_id, user_profiles.department_id),
       cost_center=COALESCE(EXCLUDED.cost_center, user_profiles.cost_center),
       employee_id=COALESCE(EXCLUDED.employee_id, user_profiles.employee_id),
       custom_attributes=user_profiles.custom_attributes || EXCLUDED.custom_attributes,
       updated_at=NOW()`,
    [userId, orgId, profile.email, profile.first_name, profile.last_name, profile.display_name,
     profile.job_title, departmentId, profile.cost_center, profile.employee_id,
     JSON.stringify(profile.custom_attributes), roleId, profile.provisioned_by]
  );

  auditLog({ orgId, actorType: 'clerk_webhook', eventType: 'user.created',
    targetUserId: userId, targetResourceType: 'user', targetResourceId: userId,
    afterState: { email: profile.email, provisioned_by: profile.provisioned_by } });
}

function applySamlMapping(profile: UserProfile, samlAttrs: Record<string, string>, mappings: Record<string, string>): void {
  for (const [samlAttr, field] of Object.entries(mappings)) {
    const value = samlAttrs[samlAttr];
    if (value === undefined || value === null) continue;
    if (field.startsWith('custom_attributes.')) {
      profile.custom_attributes[field.replace('custom_attributes.', '')] = value;
    } else if (field === 'department_name') {
      profile.department_name = value;
    } else {
      profile[field] = value;
    }
  }
}

async function resolveOrCreateDepartment(orgId: string, name: string): Promise<string | null> {
  const { rows } = await dbQuery(
    'SELECT id FROM departments WHERE org_id=$1 AND name=$2 AND parent_department_id IS NULL', [orgId, name]
  );
  if (rows[0]) return rows[0].id as string;
  const { rows: [created] } = await dbQuery(
    `INSERT INTO departments (org_id, name) VALUES ($1,$2)
     ON CONFLICT (org_id, parent_department_id, name) DO NOTHING RETURNING id`,
    [orgId, name]
  );
  return (created?.id as string) || null;
}

async function handleMemberRemoved(data: Record<string, unknown>): Promise<void> {
  const d = data as ClerkUserData;
  const orgId = d.organization?.id || d.organization_id;
  const userId = d.public_user_data?.user_id || d.user_id;
  if (!orgId || !userId) return;
  await dbQuery(
    `UPDATE user_profiles SET is_active=FALSE, deprovisioned_at=NOW(), updated_at=NOW()
     WHERE user_id=$1 AND org_id=$2`, [userId, orgId]
  );
  auditLog({ orgId, actorType: 'clerk_webhook', eventType: 'user.deprovisioned',
    targetUserId: userId, targetResourceType: 'user', targetResourceId: userId });
}

async function handleSessionCreated(data: Record<string, unknown>): Promise<void> {
  const userId = (data as { user_id?: string }).user_id;
  if (!userId) return;
  await dbQuery('UPDATE user_profiles SET last_seen_at=NOW() WHERE user_id=$1', [userId]).catch(() => {});
}

export default router;
