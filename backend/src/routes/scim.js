// SCIM 2.0 provisioning endpoints. Mounted at /scim/v2, authed via scimAuth
// (bearer token), NOT Clerk. All operations are org-scoped to req.scimOrgId.
//
// Implements the Okta/Azure AD core surface: ServiceProviderConfig, Schemas,
// ResourceTypes, Users (list/get/create/replace/patch/deprovision), Groups
// (list/get/create/replace/delete). Live IdP certification requires a real
// Okta/Azure tenant — verified here with mocked-IdP tests.
const express = require('express');
const db = require('../lib/db');
const { scimAuth, scimError } = require('../middleware/scimAuth');
const { auditLog } = require('../lib/auditLog');
const { scimToProfile, profileToScim, applyScimPatch } = require('../lib/scimMapper');
const { getRoleIdByBuiltinKey } = require('../lib/userProfiles');
const { checkSeatLimit } = require('../lib/seats');

const router = express.Router();

// ── Discovery (no auth required by spec, but harmless to leave open) ─────────────
router.get('/ServiceProviderConfig', (req, res) => {
  res.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    documentationUri: 'https://docs.experient.ai/scim',
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: true },
    etag: { supported: false },
    authenticationSchemes: [{
      type: 'oauthbearertoken', name: 'Bearer Token',
      description: 'Bearer token generated in Experient Admin Console',
    }],
  });
});

router.get('/ResourceTypes', (req, res) => {
  res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 2,
    Resources: [
      { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'User', name: 'User', endpoint: '/Users', schema: 'urn:ietf:params:scim:schemas:core:2.0:User' },
      { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'Group', name: 'Group', endpoint: '/Groups', schema: 'urn:ietf:params:scim:schemas:core:2.0:Group' },
    ],
  });
});

router.get('/Schemas', (req, res) => {
  res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 1,
    Resources: [{ id: 'urn:ietf:params:scim:schemas:core:2.0:User', name: 'User' }],
  });
});

// Everything below requires SCIM auth.
router.use(scimAuth);

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}/scim/v2`;
}

// Parse the narrow filter Okta sends: userName eq "x@y.com"
function parseUserNameFilter(filter) {
  if (!filter) return null;
  const m = /userName\s+eq\s+"([^"]+)"/i.exec(filter);
  return m ? m[1] : null;
}

// ── Users ────────────────────────────────────────────────────────────────────
router.get('/Users', async (req, res) => {
  try {
    const startIndex = Math.max(parseInt(req.query.startIndex, 10) || 1, 1);
    const count = Math.min(parseInt(req.query.count, 10) || 100, 200);
    const email = parseUserNameFilter(req.query.filter);

    const conditions = ['org_id = $1'];
    const params = [req.scimOrgId];
    if (email) { conditions.push(`email = $${params.length + 1}`); params.push(email); }

    const { rows } = await db.query(
      `SELECT * FROM user_profiles WHERE ${conditions.join(' AND ')}
       ORDER BY created_at LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, count, startIndex - 1]
    );
    const { rows: [{ total }] } = await db.query(
      `SELECT COUNT(*)::int AS total FROM user_profiles WHERE ${conditions.join(' AND ')}`, params
    );

    res.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: total,
      startIndex,
      itemsPerPage: rows.length,
      Resources: rows.map((r) => profileToScim(r, { baseUrl: baseUrl(req) })),
    });
  } catch (err) {
    scimError(res, 500, err.message);
  }
});

router.get('/Users/:id', async (req, res) => {
  try {
    const { rows: [row] } = await db.query(
      'SELECT * FROM user_profiles WHERE user_id = $1 AND org_id = $2', [req.params.id, req.scimOrgId]
    );
    if (!row) return scimError(res, 404, 'User not found');
    res.json(profileToScim(row, { baseUrl: baseUrl(req) }));
  } catch (err) { scimError(res, 500, err.message); }
});

router.post('/Users', async (req, res) => {
  try {
    const p = scimToProfile(req.body);
    if (!p.email) return scimError(res, 400, 'userName/email is required');

    // Seat enforcement — 409 so the IdP (Okta) retries after a seat frees up.
    if (p.isActive) {
      const seat = await checkSeatLimit(req.scimOrgId, 1.0);
      if (!seat.allowed) return scimError(res, 409, `Seat limit reached (${seat.current}/${seat.limit})`);
    }

    // SCIM-provisioned users default to the member role.
    const roleId = await getRoleIdByBuiltinKey(req.scimOrgId, 'org:member');
    const userId = p.externalId ? `scim:${p.externalId}` : `scim:${p.email}`;
    const displayName = p.displayName || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;

    const { rows: [row] } = await db.query(
      `INSERT INTO user_profiles
         (user_id, org_id, email, first_name, last_name, display_name, job_title,
          cost_center, employee_id, phone, avatar_url, locale, timezone,
          custom_attributes, role_id, provisioned_by, scim_external_id, scim_provisioner_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,'en'),COALESCE($13,'UTC'),$14,$15,'scim',$16,$17,$18)
       ON CONFLICT (user_id) DO UPDATE SET
         email=EXCLUDED.email, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
         display_name=EXCLUDED.display_name, is_active=EXCLUDED.is_active, updated_at=NOW()
       RETURNING *`,
      [userId, req.scimOrgId, p.email, p.firstName, p.lastName, displayName, p.jobTitle,
       p.costCenter, p.employeeId, p.phone, p.avatarUrl, p.locale, p.timezone,
       JSON.stringify(p.customAttributes || {}), roleId, p.externalId, req.scimTokenId, p.isActive]
    );

    auditLog({ orgId: req.scimOrgId, actorType: 'scim', eventType: 'scim.user_provisioned',
      targetUserId: userId, targetResourceType: 'user', targetResourceId: userId,
      afterState: { email: p.email } });

    res.status(201).json(profileToScim(row, { baseUrl: baseUrl(req) }));
  } catch (err) { scimError(res, 500, err.message); }
});

router.put('/Users/:id', async (req, res) => {
  try {
    const p = scimToProfile(req.body);
    const displayName = p.displayName || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
    const { rows: [row] } = await db.query(
      `UPDATE user_profiles SET email=$3, first_name=$4, last_name=$5, display_name=$6,
         job_title=$7, is_active=$8, deprovisioned_at = CASE WHEN $8 THEN NULL ELSE NOW() END, updated_at=NOW()
       WHERE user_id=$1 AND org_id=$2 RETURNING *`,
      [req.params.id, req.scimOrgId, p.email, p.firstName, p.lastName, displayName, p.jobTitle, p.isActive]
    );
    if (!row) return scimError(res, 404, 'User not found');
    auditLog({ orgId: req.scimOrgId, actorType: 'scim', eventType: 'scim.user_updated',
      targetUserId: req.params.id, targetResourceType: 'user', targetResourceId: req.params.id });
    res.json(profileToScim(row, { baseUrl: baseUrl(req) }));
  } catch (err) { scimError(res, 500, err.message); }
});

// PATCH — the common deprovision path (Okta sends active=false).
router.patch('/Users/:id', async (req, res) => {
  try {
    const update = applyScimPatch(req.body?.Operations);
    const map = { isActive: 'is_active', jobTitle: 'job_title', displayName: 'display_name',
      firstName: 'first_name', lastName: 'last_name', email: 'email' };
    const sets = []; const params = [req.params.id, req.scimOrgId]; let p = 3;
    for (const [key, col] of Object.entries(map)) {
      if (key in update) { sets.push(`${col} = $${p++}`); params.push(update[key]); }
    }
    if ('isActive' in update) {
      sets.push(update.isActive ? 'deprovisioned_at = NULL' : 'deprovisioned_at = NOW()');
    }
    if (sets.length === 0) return scimError(res, 400, 'No supported operations');

    const { rows: [row] } = await db.query(
      `UPDATE user_profiles SET ${sets.join(', ')}, updated_at=NOW()
       WHERE user_id=$1 AND org_id=$2 RETURNING *`, params
    );
    if (!row) return scimError(res, 404, 'User not found');

    const event = ('isActive' in update && !update.isActive) ? 'scim.user_deprovisioned' : 'scim.user_updated';
    auditLog({ orgId: req.scimOrgId, actorType: 'scim', eventType: event,
      targetUserId: req.params.id, targetResourceType: 'user', targetResourceId: req.params.id });
    res.json(profileToScim(row, { baseUrl: baseUrl(req) }));
  } catch (err) { scimError(res, 500, err.message); }
});

router.delete('/Users/:id', async (req, res) => {
  try {
    const { rows: [row] } = await db.query(
      `UPDATE user_profiles SET is_active=FALSE, deprovisioned_at=NOW(), updated_at=NOW()
       WHERE user_id=$1 AND org_id=$2 RETURNING user_id`, [req.params.id, req.scimOrgId]
    );
    if (!row) return scimError(res, 404, 'User not found');
    auditLog({ orgId: req.scimOrgId, actorType: 'scim', eventType: 'scim.user_deprovisioned',
      targetUserId: req.params.id, targetResourceType: 'user', targetResourceId: req.params.id });
    res.status(204).send();
  } catch (err) { scimError(res, 500, err.message); }
});

// ── Groups (SCIM-synced) ───────────────────────────────────────────────────────
router.get('/Groups', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM user_groups WHERE org_id=$1 AND is_active=TRUE ORDER BY created_at`, [req.scimOrgId]
    );
    res.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: rows.length, startIndex: 1, itemsPerPage: rows.length,
      Resources: rows.map(groupToScim),
    });
  } catch (err) { scimError(res, 500, err.message); }
});

router.post('/Groups', async (req, res) => {
  try {
    const displayName = req.body.displayName;
    if (!displayName) return scimError(res, 400, 'displayName is required');
    const { rows: [row] } = await db.query(
      `INSERT INTO user_groups (org_id, name, group_type, scim_external_id, scim_provisioner_id)
       VALUES ($1,$2,'scim_synced',$3,$4)
       ON CONFLICT (org_id, scim_external_id) DO UPDATE SET name=EXCLUDED.name, updated_at=NOW()
       RETURNING *`,
      [req.scimOrgId, displayName, req.body.externalId || displayName, req.scimTokenId]
    );
    auditLog({ orgId: req.scimOrgId, actorType: 'scim', eventType: 'scim.group_synced',
      targetResourceType: 'group', targetResourceId: row.id });
    res.status(201).json(groupToScim(row));
  } catch (err) { scimError(res, 500, err.message); }
});

router.get('/Groups/:id', async (req, res) => {
  try {
    const { rows: [row] } = await db.query(
      'SELECT * FROM user_groups WHERE id=$1 AND org_id=$2', [req.params.id, req.scimOrgId]
    );
    if (!row) return scimError(res, 404, 'Group not found');
    res.json(groupToScim(row));
  } catch (err) { scimError(res, 500, err.message); }
});

router.delete('/Groups/:id', async (req, res) => {
  try {
    const { rows: [row] } = await db.query(
      `UPDATE user_groups SET is_active=FALSE, updated_at=NOW() WHERE id=$1 AND org_id=$2 RETURNING id`,
      [req.params.id, req.scimOrgId]
    );
    if (!row) return scimError(res, 404, 'Group not found');
    res.status(204).send();
  } catch (err) { scimError(res, 500, err.message); }
});

function groupToScim(row) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
    id: row.id,
    displayName: row.name,
    externalId: row.scim_external_id || undefined,
    meta: { resourceType: 'Group', created: row.created_at, lastModified: row.updated_at },
  };
}

module.exports = router;
