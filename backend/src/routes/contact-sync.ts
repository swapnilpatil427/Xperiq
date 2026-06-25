import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { query } from '../lib/db';
import { serverError, clientError } from '../lib/httpError';
import { createSyncConfigSchema, updateSyncConfigSchema } from '../schemas/contact-sync';
import { fetchContacts } from '../lib/crmConnectors';
import type { FieldMapping, NormalizedContact } from '../lib/crmConnectors';
import logger from '../lib/logger';

const router = express.Router();

/** Redact sensitive credential fields before returning config to the client */
function redactConfig(config: Record<string, string>): Record<string, string> {
  const SENSITIVE = ['api_key', 'access_token', 'password', 'secret'];
  const redacted: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    redacted[k] = SENSITIVE.some((s) => k.toLowerCase().includes(s))
      ? v ? '***' : ''
      : v;
  }
  return redacted;
}

/** Upsert a normalized contact into the contacts table */
async function upsertContact(orgId: string, c: NormalizedContact): Promise<'created' | 'updated' | 'skipped'> {
  if (!c.email && !c.external_id) return 'skipped';

  if (c.external_id) {
    const { rows } = await query<{ was_inserted: boolean }>(
      `INSERT INTO contacts (org_id, external_id, email, name, phone, account_id, account_name, import_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'crm_sync')
       ON CONFLICT (org_id, external_id) DO UPDATE
         SET email        = COALESCE(EXCLUDED.email, contacts.email),
             name         = COALESCE(EXCLUDED.name, contacts.name),
             phone        = COALESCE(EXCLUDED.phone, contacts.phone),
             account_id   = COALESCE(EXCLUDED.account_id, contacts.account_id),
             account_name = COALESCE(EXCLUDED.account_name, contacts.account_name),
             updated_at   = NOW()
       RETURNING (xmax = 0) AS was_inserted`,
      [orgId, c.external_id, c.email ?? null, c.name ?? null, c.phone ?? null, c.account_id ?? null, c.account_name ?? null]
    );
    return rows[0]?.was_inserted ? 'created' : 'updated';
  }

  // Upsert by email
  const { rows } = await query<{ was_inserted: boolean }>(
    `INSERT INTO contacts (org_id, email, name, phone, account_id, account_name, import_source)
     VALUES ($1, $2, $3, $4, $5, $6, 'crm_sync')
     ON CONFLICT (org_id, email) WHERE anonymized_at IS NULL DO UPDATE
       SET name         = COALESCE(EXCLUDED.name, contacts.name),
           phone        = COALESCE(EXCLUDED.phone, contacts.phone),
           account_id   = COALESCE(EXCLUDED.account_id, contacts.account_id),
           account_name = COALESCE(EXCLUDED.account_name, contacts.account_name),
           updated_at   = NOW()
     RETURNING (xmax = 0) AS was_inserted`,
    [orgId, c.email!, c.name ?? null, c.phone ?? null, c.account_id ?? null, c.account_name ?? null]
  );
  return rows[0]?.was_inserted ? 'created' : 'updated';
}

// Apply requireAuth to all routes except the inbound webhook
// (webhook uses HMAC verification instead)
router.use((req, res, next) => {
  // Webhook endpoint is authenticated by HMAC — skip Clerk for it
  if (req.path.startsWith('/webhook/')) return next();
  return requireAuth(req, res, next);
});

// GET /configs — list sync configs for org (config.api_key redacted)
router.get('/configs', requirePermission('contacts:import'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT id, name, provider, config, field_mappings, sync_schedule, is_active,
              last_synced_at, last_sync_status, created_at, updated_at
       FROM contact_sync_configs WHERE org_id = $1 ORDER BY created_at DESC`,
      [req.orgId]
    );
    const configs = rows.map((r) => ({
      ...r,
      config: redactConfig(r.config as Record<string, string>),
    }));
    res.json({ configs });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// POST /configs — create sync config
router.post('/configs', requirePermission('contacts:import'), validate(createSyncConfigSchema), async (req: Request, res: Response): Promise<void> => {
  const { name, provider, config, field_mappings, sync_schedule, is_active } = req.body as {
    name: string;
    provider: string;
    config: Record<string, string>;
    field_mappings: FieldMapping[];
    sync_schedule?: string;
    is_active?: boolean;
  };
  try {
    const { rows } = await query(
      `INSERT INTO contact_sync_configs (org_id, name, provider, config, field_mappings, sync_schedule, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.orgId, name, provider, JSON.stringify(config), JSON.stringify(field_mappings), sync_schedule ?? 'manual', is_active ?? true, req.userId]
    );
    const row = rows[0];
    res.status(201).json({ config: { ...row, config: redactConfig(row.config as Record<string, string>) } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique')) { clientError(res, 409, 'A sync config with that name already exists'); return; }
    serverError(res, err instanceof Error ? err : new Error(msg));
  }
});

// PUT /configs/:configId — update sync config
router.put('/configs/:configId', requirePermission('contacts:import'), validate(updateSyncConfigSchema), async (req: Request, res: Response): Promise<void> => {
  const { configId } = req.params;
  const updates = req.body as {
    name?: string;
    provider?: string;
    config?: Record<string, string>;
    field_mappings?: FieldMapping[];
    sync_schedule?: string;
    is_active?: boolean;
  };
  try {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [req.orgId, configId];
    let p = 3;
    if (updates.name !== undefined) { setClauses.push(`name = $${p++}`); params.push(updates.name); }
    if (updates.provider !== undefined) { setClauses.push(`provider = $${p++}`); params.push(updates.provider); }
    if (updates.config !== undefined) { setClauses.push(`config = $${p++}`); params.push(JSON.stringify(updates.config)); }
    if (updates.field_mappings !== undefined) { setClauses.push(`field_mappings = $${p++}`); params.push(JSON.stringify(updates.field_mappings)); }
    if (updates.sync_schedule !== undefined) { setClauses.push(`sync_schedule = $${p++}`); params.push(updates.sync_schedule); }
    if (updates.is_active !== undefined) { setClauses.push(`is_active = $${p++}`); params.push(updates.is_active); }

    const { rows } = await query(
      `UPDATE contact_sync_configs SET ${setClauses.join(', ')} WHERE org_id = $1 AND id = $2 RETURNING *`,
      params
    );
    if (!rows[0]) { clientError(res, 404, 'Sync config not found'); return; }
    const row = rows[0];
    res.json({ config: { ...row, config: redactConfig(row.config as Record<string, string>) } });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// DELETE /configs/:configId — delete sync config
router.delete('/configs/:configId', requirePermission('contacts:import'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rowCount } = await query(
      `DELETE FROM contact_sync_configs WHERE org_id = $1 AND id = $2`, [req.orgId, req.params.configId]
    );
    if (!rowCount) { clientError(res, 404, 'Sync config not found'); return; }
    res.json({ success: true });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// GET /configs/:configId/logs — list sync logs (most recent 20)
router.get('/configs/:configId/logs', requirePermission('outreach:logs:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    // Verify config belongs to org
    const { rows: [cfg] } = await query(
      `SELECT id FROM contact_sync_configs WHERE org_id = $1 AND id = $2`, [req.orgId, req.params.configId]
    );
    if (!cfg) { clientError(res, 404, 'Sync config not found'); return; }

    const { rows } = await query(
      `SELECT id, status, started_at, completed_at, contacts_created, contacts_updated, contacts_skipped, error_detail
       FROM contact_sync_logs WHERE config_id = $1 ORDER BY started_at DESC LIMIT 20`,
      [req.params.configId]
    );
    res.json({ logs: rows });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// POST /:configId/run — trigger sync run (async background)
router.post('/configs/:configId/run', requirePermission('contacts:import'), async (req: Request, res: Response): Promise<void> => {
  try {
    // Fetch config (include raw credentials for sync, don't redact here)
    const { rows: [cfg] } = await query(
      `SELECT id, provider, config, field_mappings FROM contact_sync_configs WHERE org_id = $1 AND id = $2 AND is_active = TRUE`,
      [req.orgId, req.params.configId]
    );
    if (!cfg) { clientError(res, 404, 'Sync config not found or inactive'); return; }

    // Insert sync log row
    const { rows: [logRow] } = await query(
      `INSERT INTO contact_sync_logs (config_id, status, started_at) VALUES ($1, 'running', NOW()) RETURNING id`,
      [cfg.id]
    );
    const logId = logRow.id as string;

    // Respond immediately
    res.json({ log_id: logId, status: 'started' });

    // Background sync
    (async () => {
      let created = 0; let updated = 0; let skipped = 0;
      try {
        const contacts = await fetchContacts(
          cfg.provider as string,
          cfg.config as Record<string, string>,
          cfg.field_mappings as FieldMapping[]
        );

        for (const contact of contacts) {
          try {
            const result = await upsertContact(req.orgId, contact);
            if (result === 'created') created++;
            else if (result === 'updated') updated++;
            else skipped++;
          } catch (itemErr) {
            logger.warn({ err: itemErr instanceof Error ? itemErr.message : String(itemErr) }, 'contact-sync:upsert-error');
            skipped++;
          }
        }

        await query(
          `UPDATE contact_sync_logs SET status='completed', completed_at=NOW(),
           contacts_created=$1, contacts_updated=$2, contacts_skipped=$3 WHERE id=$4`,
          [created, updated, skipped, logId]
        );
        await query(
          `UPDATE contact_sync_configs SET last_synced_at=NOW(), last_sync_status='completed' WHERE id=$1`,
          [cfg.id]
        );
        logger.info({ configId: cfg.id, created, updated, skipped }, 'contact-sync:completed');
      } catch (syncErr: unknown) {
        const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
        logger.error({ err: msg, configId: cfg.id }, 'contact-sync:failed');
        await query(
          `UPDATE contact_sync_logs SET status='failed', completed_at=NOW(), error_detail=$1 WHERE id=$2`,
          [msg, logId]
        ).catch(() => {});
        await query(
          `UPDATE contact_sync_configs SET last_synced_at=NOW(), last_sync_status='failed' WHERE id=$1`,
          [cfg.id]
        ).catch(() => {});
      }
    })();
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// POST /webhook/:configId — inbound webhook push (no Clerk auth — HMAC verified)
router.post('/webhook/:configId', express.json(), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [cfg] } = await query(
      `SELECT id, org_id, config, field_mappings FROM contact_sync_configs WHERE id = $1 AND provider = 'webhook' AND is_active = TRUE`,
      [req.params.configId]
    );
    if (!cfg) { clientError(res, 404, 'Webhook config not found'); return; }

    // HMAC verification
    const cfgData = cfg.config as Record<string, string>;
    const endpointSecret = cfgData['endpoint_secret'];
    if (endpointSecret) {
      const sigHeader = req.headers['x-hub-signature-256'] as string | undefined;
      if (!sigHeader) { clientError(res, 401, 'Missing X-Hub-Signature-256 header'); return; }
      const bodyStr = JSON.stringify(req.body);
      const expected = 'sha256=' + crypto.createHmac('sha256', endpointSecret).update(bodyStr).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader))) {
        clientError(res, 401, 'Invalid signature'); return;
      }
    }

    const body = req.body as unknown;
    const contacts: unknown[] = Array.isArray(body) ? body : [body];
    let processed = 0;

    for (const raw of contacts) {
      if (!raw || typeof raw !== 'object') continue;
      const mappings = cfg.field_mappings as FieldMapping[];
      // Apply field_mappings to normalize
      const normalized: NormalizedContact = {};
      for (const { source, dest } of mappings) {
        const val = (raw as Record<string, unknown>)[source];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          (normalized as Record<string, unknown>)[dest] = String(val).trim();
        }
      }
      try {
        const result = await upsertContact(cfg.org_id as string, normalized);
        if (result !== 'skipped') processed++;
      } catch {
        // skip bad records
      }
    }

    res.json({ processed });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

export default router;
