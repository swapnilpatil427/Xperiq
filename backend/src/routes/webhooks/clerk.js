// Clerk webhook receiver — keeps user_profiles in sync with Clerk identity and
// org membership, and applies SSO attribute mapping on first SSO login.
//
// Mounted at /webhooks/clerk with a RAW body parser (signature must be verified
// against the exact bytes). No Clerk JWT here — auth is the Svix signature.
const express = require('express');
const db = require('../../lib/db');
const { auditLog } = require('../../lib/auditLog');
const { verifySvixSignature } = require('../../lib/clerkWebhook');
const { getRoleIdByBuiltinKey } = require('../../lib/userProfiles');

const router = express.Router();

router.post('/', async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  // req.body is a Buffer (raw parser mounted in index.js).
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

  if (!secret || !verifySvixSignature(raw, req.headers, secret)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  let event;
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
  } catch (err) {
    try { require('../../lib/logger').error({ event: 'clerk_webhook_handler_error', type, err: err.message }); }
    catch { console.error('clerk webhook handler error:', err.message); }
    // Still 200 so Clerk doesn't retry forever on a non-transient handler bug.
  }
  res.json({ received: true });
});

async function handleUserUpsert(data) {
  const orgId = data.organization?.id || data.organization_id;
  const userId = data.public_user_data?.user_id || data.user_id || data.id;
  if (!orgId || !userId) return; // not an org-scoped event

  const { rows: [mapping] } = await db.query(
    'SELECT mappings FROM sso_attribute_mappings WHERE org_id = $1', [orgId]
  );
  const meta = data.public_user_data?.public_metadata || data.public_metadata || data.unsafe_metadata || {};
  const samlAttrs = meta.samlAttributes || {};

  const profile = {
    email: data.email_addresses?.[0]?.email_address || data.public_user_data?.identifier || `${userId}@unknown.local`,
    first_name: data.first_name || data.public_user_data?.first_name || null,
    last_name: data.last_name || data.public_user_data?.last_name || null,
    job_title: null, cost_center: null, employee_id: null,
    department_name: null,
    custom_attributes: {},
    provisioned_by: Object.keys(samlAttrs).length ? 'sso' : 'invite',
  };

  if (mapping?.mappings) applySamlMapping(profile, samlAttrs, mapping.mappings);
  profile.display_name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;

  let departmentId = null;
  if (profile.department_name) departmentId = await resolveOrCreateDepartment(orgId, profile.department_name);

  const roleId = await getRoleIdByBuiltinKey(orgId, 'org:member');

  await db.query(
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

function applySamlMapping(profile, samlAttrs, mappings) {
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

async function resolveOrCreateDepartment(orgId, name) {
  const { rows } = await db.query(
    'SELECT id FROM departments WHERE org_id=$1 AND name=$2 AND parent_department_id IS NULL', [orgId, name]
  );
  if (rows[0]) return rows[0].id;
  const { rows: [created] } = await db.query(
    `INSERT INTO departments (org_id, name) VALUES ($1,$2)
     ON CONFLICT (org_id, parent_department_id, name) DO NOTHING RETURNING id`,
    [orgId, name]
  );
  return created?.id || null;
}

async function handleMemberRemoved(data) {
  const orgId = data.organization?.id || data.organization_id;
  const userId = data.public_user_data?.user_id || data.user_id;
  if (!orgId || !userId) return;
  await db.query(
    `UPDATE user_profiles SET is_active=FALSE, deprovisioned_at=NOW(), updated_at=NOW()
     WHERE user_id=$1 AND org_id=$2`, [userId, orgId]
  );
  auditLog({ orgId, actorType: 'clerk_webhook', eventType: 'user.deprovisioned',
    targetUserId: userId, targetResourceType: 'user', targetResourceId: userId });
}

async function handleSessionCreated(data) {
  const userId = data.user_id;
  if (!userId) return;
  await db.query('UPDATE user_profiles SET last_seen_at=NOW() WHERE user_id=$1', [userId]).catch(() => {});
}

module.exports = router;
