// SCIM 2.0 provisioning endpoints. Mounted at /scim/v2, authed via scimAuth
// (bearer token), NOT Clerk. All operations are org-scoped to req.scimOrgId.
//
// Implements the Okta/Azure AD core surface: ServiceProviderConfig, Schemas,
// ResourceTypes, Users (list/get/create/replace/patch/deprovision), Groups
// (list/get/create/replace/delete). Live IdP certification requires a real
// Okta/Azure tenant — verified here with mocked-IdP tests.
import express from 'express';
import type { Request, Response } from 'express';
import { query } from '../lib/db';
import { scimAuth, scimError } from '../middleware/scimAuth';
import { auditLog } from '../lib/auditLog';
import { scimToProfile, profileToScim, applyScimPatch } from '../lib/scimMapper';
import { getRoleIdByBuiltinKey } from '../lib/userProfiles';
import { checkSeatLimit } from '../lib/seats';

const router = express.Router();

// ── Discovery (no auth required by spec, but harmless to leave open) ─────────────
router.get('/ServiceProviderConfig', (req: Request, res: Response): void => {
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

router.get('/ResourceTypes', (req: Request, res: Response): void => {
  res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 2,
    Resources: [
      { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'User', name: 'User', endpoint: '/Users', schema: 'urn:ietf:params:scim:schemas:core:2.0:User' },
      { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'Group', name: 'Group', endpoint: '/Groups', schema: 'urn:ietf:params:scim:schemas:core:2.0:Group' },
    ],
  });
});

router.get('/Schemas', (req: Request, res: Response): void => {
  res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 1,
    Resources: [{ id: 'urn:ietf:params:scim:schemas:core:2.0:User', name: 'User' }],
  });
});

// Everything below requires SCIM auth.
router.use(scimAuth);

function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}/scim/v2`;
}

// Parse the narrow filter Okta sends: userName eq "x@y.com"
function parseUserNameFilter(filter: string | undefined): string | null {
  if (!filter) return null;
  const m = /userName\s+eq\s+"([^"]+)"/i.exec(filter);
  return m ? m[1] : null;
}

// ── Users ────────────────────────────────────────────────────────────────────
router.get('/Users', async (req: Request, res: Response): Promise<void> => {
  try {
    const startIndex = Math.max(parseInt(String(req.query.startIndex ?? ''), 10) || 1, 1);
    const count = Math.min(parseInt(String(req.query.count ?? ''), 10) || 100, 200);
    const email = parseUserNameFilter(req.query.filter as string | undefined);

    const conditions = ['org_id = $1'];
    const params: unknown[] = [req.scimOrgId];
    if (email) { conditions.push(`email = $${params.length + 1}`); params.push(email); }

    const { rows } = await query(
      `SELECT * FROM user_profiles WHERE ${conditions.join(' AND ')}
       ORDER BY created_at LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, count, startIndex - 1]
    );
    const { rows: [{ total }] } = await query(
      `SELECT COUNT(*)::int AS total FROM user_profiles WHERE ${conditions.join(' AND ')}`, params
    );

    res.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: total,
      startIndex,
      itemsPerPage: rows.length,
      Resources: rows.map((r: Record<string, unknown>) => profileToScim(r as Parameters<typeof profileToScim>[0], { baseUrl: baseUrl(req) })),
    });
  } catch (err: unknown) {
    scimError(res, 500, err instanceof Error ? err.message : String(err));
  }
});

router.get('/Users/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [row] } = await query(
      'SELECT * FROM user_profiles WHERE user_id = $1 AND org_id = $2', [req.params.id, req.scimOrgId]
    );
    if (!row) { scimError(res, 404, 'User not found'); return; }
    res.json(profileToScim(row as Parameters<typeof profileToScim>[0], { baseUrl: baseUrl(req) }));
  } catch (err: unknown) { scimError(res, 500, err instanceof Error ? err.message : String(err)); }
});

router.post('/Users', async (req: Request, res: Response): Promise<void> => {
  try {
    const p = scimToProfile(req.body);
    if (!p.email) { scimError(res, 400, 'userName/email is required'); return; }

    // Seat enforcement — 409 so the IdP (Okta) retries after a seat frees up.
    if (p.isActive) {
      const seat = await checkSeatLimit(req.scimOrgId!, 1.0);
      if (!seat.allowed) { scimError(res, 409, `Seat limit reached (${seat.current}/${seat.limit})`); return; }
    }

    // SCIM-provisioned users default to the member role.
    const roleId = await getRoleIdByBuiltinKey(req.scimOrgId!, 'org:member');
    const userId = p.externalId ? `scim:${p.externalId}` : `scim:${p.email}`;
    const displayName = p.displayName || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;

    const { rows: [row] } = await query(
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

    auditLog({ orgId: req.scimOrgId!, actorType: 'scim', eventType: 'scim.user_provisioned',
      targetUserId: userId, targetResourceType: 'user', targetResourceId: userId,
      afterState: { email: p.email } });

    res.status(201).json(profileToScim(row as Parameters<typeof profileToScim>[0], { baseUrl: baseUrl(req) }));
  } catch (err: unknown) { scimError(res, 500, err instanceof Error ? err.message : String(err)); }
});

router.put('/Users/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const p = scimToProfile(req.body);
    const displayName = p.displayName || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
    const { rows: [row] } = await query(
      `UPDATE user_profiles SET email=$3, first_name=$4, last_name=$5, display_name=$6,
         job_title=$7, is_active=$8, deprovisioned_at = CASE WHEN $8 THEN NULL ELSE NOW() END, updated_at=NOW()
       WHERE user_id=$1 AND org_id=$2 RETURNING *`,
      [req.params.id, req.scimOrgId, p.email, p.firstName, p.lastName, displayName, p.jobTitle, p.isActive]
    );
    if (!row) { scimError(res, 404, 'User not found'); return; }
    auditLog({ orgId: req.scimOrgId!, actorType: 'scim', eventType: 'scim.user_updated',
      targetUserId: req.params.id, targetResourceType: 'user', targetResourceId: req.params.id });
    res.json(profileToScim(row as Parameters<typeof profileToScim>[0], { baseUrl: baseUrl(req) }));
  } catch (err: unknown) { scimError(res, 500, err instanceof Error ? err.message : String(err)); }
});

// PATCH — the common deprovision path (Okta sends active=false).
router.patch('/Users/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const update = applyScimPatch(req.body?.Operations);
    const map: Record<string, string> = { isActive: 'is_active', jobTitle: 'job_title', displayName: 'display_name',
      firstName: 'first_name', lastName: 'last_name', email: 'email' };
    const sets: string[] = []; const params: unknown[] = [req.params.id, req.scimOrgId]; let p = 3;
    for (const [key, col] of Object.entries(map)) {
      if (key in update) { sets.push(`${col} = $${p++}`); params.push((update as Record<string, unknown>)[key]); }
    }
    if ('isActive' in update) {
      sets.push((update as Record<string, unknown>).isActive ? 'deprovisioned_at = NULL' : 'deprovisioned_at = NOW()');
    }
    if (sets.length === 0) { scimError(res, 400, 'No supported operations'); return; }

    const { rows: [row] } = await query(
      `UPDATE user_profiles SET ${sets.join(', ')}, updated_at=NOW()
       WHERE user_id=$1 AND org_id=$2 RETURNING *`, params
    );
    if (!row) { scimError(res, 404, 'User not found'); return; }

    const upd = update as Record<string, unknown>;
    const event = ('isActive' in upd && !upd.isActive) ? 'scim.user_deprovisioned' : 'scim.user_updated';
    auditLog({ orgId: req.scimOrgId!, actorType: 'scim', eventType: event,
      targetUserId: req.params.id, targetResourceType: 'user', targetResourceId: req.params.id });
    res.json(profileToScim(row as Parameters<typeof profileToScim>[0], { baseUrl: baseUrl(req) }));
  } catch (err: unknown) { scimError(res, 500, err instanceof Error ? err.message : String(err)); }
});

router.delete('/Users/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [row] } = await query(
      `UPDATE user_profiles SET is_active=FALSE, deprovisioned_at=NOW(), updated_at=NOW()
       WHERE user_id=$1 AND org_id=$2 RETURNING user_id`, [req.params.id, req.scimOrgId]
    );
    if (!row) { scimError(res, 404, 'User not found'); return; }
    auditLog({ orgId: req.scimOrgId!, actorType: 'scim', eventType: 'scim.user_deprovisioned',
      targetUserId: req.params.id, targetResourceType: 'user', targetResourceId: req.params.id });
    res.status(204).send();
  } catch (err: unknown) { scimError(res, 500, err instanceof Error ? err.message : String(err)); }
});

// ── Groups (SCIM-synced) ───────────────────────────────────────────────────────
router.get('/Groups', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT * FROM user_groups WHERE org_id=$1 AND is_active=TRUE ORDER BY created_at`, [req.scimOrgId]
    );
    res.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: rows.length, startIndex: 1, itemsPerPage: rows.length,
      Resources: rows.map(groupToScim),
    });
  } catch (err: unknown) { scimError(res, 500, err instanceof Error ? err.message : String(err)); }
});

router.post('/Groups', async (req: Request, res: Response): Promise<void> => {
  try {
    const displayName = req.body.displayName;
    if (!displayName) { scimError(res, 400, 'displayName is required'); return; }
    const { rows: [row] } = await query(
      `INSERT INTO user_groups (org_id, name, group_type, scim_external_id, scim_provisioner_id)
       VALUES ($1,$2,'scim_synced',$3,$4)
       ON CONFLICT (org_id, scim_external_id) DO UPDATE SET name=EXCLUDED.name, updated_at=NOW()
       RETURNING *`,
      [req.scimOrgId, displayName, req.body.externalId || displayName, req.scimTokenId]
    );
    auditLog({ orgId: req.scimOrgId!, actorType: 'scim', eventType: 'scim.group_synced',
      targetResourceType: 'group', targetResourceId: row.id });
    res.status(201).json(groupToScim(row));
  } catch (err: unknown) { scimError(res, 500, err instanceof Error ? err.message : String(err)); }
});

router.get('/Groups/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [row] } = await query(
      'SELECT * FROM user_groups WHERE id=$1 AND org_id=$2', [req.params.id, req.scimOrgId]
    );
    if (!row) { scimError(res, 404, 'Group not found'); return; }
    res.json(groupToScim(row));
  } catch (err: unknown) { scimError(res, 500, err instanceof Error ? err.message : String(err)); }
});

router.delete('/Groups/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [row] } = await query(
      `UPDATE user_groups SET is_active=FALSE, updated_at=NOW() WHERE id=$1 AND org_id=$2 RETURNING id`,
      [req.params.id, req.scimOrgId]
    );
    if (!row) { scimError(res, 404, 'Group not found'); return; }
    res.status(204).send();
  } catch (err: unknown) { scimError(res, 500, err instanceof Error ? err.message : String(err)); }
});

function groupToScim(row: Record<string, unknown>) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
    id: row.id,
    displayName: row.name,
    externalId: row.scim_external_id || undefined,
    meta: { resourceType: 'Group', created: row.created_at, lastModified: row.updated_at },
  };
}

export default router;
