/**
 * Ontology Layer routes (Tier 3 Closed-Loop Action Platform)
 *
 * Provides a shared vocabulary (entities, relationships, vocabulary mappings)
 * that Crystal uses to reason across X-data and O-data.
 *
 *   GET    /api/ontology              — List nodes (platform + org)
 *   POST   /api/ontology              — Create org node (admin only)
 *   GET    /api/ontology/:id          — Get node + outgoing edges + mappings
 *   PUT    /api/ontology/:id          — Update org node (cannot modify platform nodes)
 *   POST   /api/ontology/edges           — Create relationship
 *   POST   /api/ontology/mappings        — Create/upsert vocabulary mapping
 *   GET    /api/ontology/resolve         — Resolve external value → node + edges
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { query } from '../lib/db';
import { serverError, clientError } from '../lib/httpError';
import { z } from 'zod';
import { validate } from '../lib/validate';

const router = express.Router();

// ── Zod schemas (inline — ontology.ts is self-contained) ─────────────────────

const createNodeSchema = z.object({
  category:    z.enum(['entity', 'metric', 'signal', 'risk', 'action']),
  label:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  definition:  z.string().max(5000).optional(),
  synonyms:    z.array(z.string().max(200)).max(20).optional().default([]),
  x_data_ref:  z.string().max(200).optional(),
  o_data_ref:  z.string().max(200).optional(),
  parent_id:   z.string().uuid().optional(),
});

const updateNodeSchema = z.object({
  category:    z.enum(['entity', 'metric', 'signal', 'risk', 'action']).optional(),
  label:       z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  definition:  z.string().max(5000).optional(),
  synonyms:    z.array(z.string().max(200)).max(20).optional(),
  x_data_ref:  z.string().max(200).optional(),
  o_data_ref:  z.string().max(200).optional(),
  parent_id:   z.string().uuid().optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

const createEdgeSchema = z.object({
  from_node_id:  z.string().uuid(),
  to_node_id:    z.string().uuid(),
  relationship:  z.enum(['drives', 'correlates_with', 'escalates_to', 'is_instance_of', 'requires', 'signals']),
  weight:        z.number().min(0).max(1).optional().default(1.0),
  evidence_type: z.enum(['manual', 'empirical', 'inferred']).optional().default('manual'),
});

const createMappingSchema = z.object({
  source_system:  z.string().min(1).max(100),
  source_field:   z.string().min(1).max(200),
  source_value:   z.string().min(1).max(500),
  target_node_id: z.string().uuid(),
  nps_range_low:  z.number().int().min(0).max(10).optional(),
  nps_range_high: z.number().int().min(0).max(10).optional(),
});

// ── GET /api/ontology ─────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const params: unknown[] = [req.orgId];
    const conditions: string[] = ['(org_id = $1 OR org_id = \'\')'];

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    const { rows } = await query(
      `SELECT * FROM ontology_nodes WHERE ${where} ORDER BY platform_node DESC, category, label`,
      params
    );
    res.json({ nodes: rows });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') { res.json({ nodes: [] }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/ontology ────────────────────────────────────────────────────────

router.post('/', requireAuth, requireRole('admin'), validate(createNodeSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      category: string;
      label: string;
      description?: string;
      definition?: string;
      synonyms?: string[];
      x_data_ref?: string;
      o_data_ref?: string;
      parent_id?: string;
    };

    // Verify parent node is accessible by this org (if specified)
    if (body.parent_id) {
      const { rows: parentRows } = await query<{ id: string }>(
        'SELECT id FROM ontology_nodes WHERE id = $1 AND (org_id = $2 OR org_id = \'\')',
        [body.parent_id, req.orgId]
      );
      if (!parentRows[0]) {
        clientError(res, 400, 'Parent node not found or not accessible');
        return;
      }
    }

    const { rows } = await query(
      `INSERT INTO ontology_nodes
         (org_id, category, label, description, definition, synonyms,
          x_data_ref, o_data_ref, platform_node, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)
       RETURNING *`,
      [
        req.orgId,
        body.category,
        body.label,
        body.description ?? null,
        body.definition ?? null,
        body.synonyms ?? [],
        body.x_data_ref ?? null,
        body.o_data_ref ?? null,
        body.parent_id ?? null,
      ]
    );
    res.status(201).json({ node: rows[0] });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/ontology/edges ──────────────────────────────────────────────────

router.post('/edges', requireAuth, validate(createEdgeSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      from_node_id: string;
      to_node_id: string;
      relationship: string;
      weight?: number;
      evidence_type?: string;
    };

    // Validate both nodes are accessible by this org
    const { rows: nodeRows } = await query<{ id: string }>(
      `SELECT id FROM ontology_nodes
       WHERE id = ANY($1::uuid[]) AND (org_id = $2 OR org_id = '')`,
      [[body.from_node_id, body.to_node_id], req.orgId]
    );

    const foundIds = new Set(nodeRows.map((r) => r.id));
    if (!foundIds.has(body.from_node_id) || !foundIds.has(body.to_node_id)) {
      clientError(res, 400, 'One or both nodes not found or not accessible by this org');
      return;
    }

    const { rows } = await query(
      `INSERT INTO ontology_edges
         (org_id, from_node_id, to_node_id, relationship, weight, evidence_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.orgId,
        body.from_node_id,
        body.to_node_id,
        body.relationship,
        body.weight ?? 1.0,
        body.evidence_type ?? 'manual',
      ]
    );
    res.status(201).json({ edge: rows[0] });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/ontology/mappings ───────────────────────────────────────────────

router.post('/mappings', requireAuth, validate(createMappingSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      source_system: string;
      source_field: string;
      source_value: string;
      target_node_id: string;
      nps_range_low?: number;
      nps_range_high?: number;
    };

    // Validate target node is accessible
    const { rows: nodeRows } = await query<{ id: string; label: string }>(
      'SELECT id, label FROM ontology_nodes WHERE id = $1 AND (org_id = $2 OR org_id = \'\')',
      [body.target_node_id, req.orgId]
    );
    if (!nodeRows[0]) {
      clientError(res, 400, 'Target node not found or not accessible');
      return;
    }

    const { rows } = await query(
      `INSERT INTO ontology_mappings
         (org_id, source_system, source_field, source_value,
          target_node_id, target_label, nps_range_low, nps_range_high)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (org_id, source_system, source_field, source_value) DO UPDATE
         SET target_node_id = EXCLUDED.target_node_id,
             target_label   = EXCLUDED.target_label,
             nps_range_low  = EXCLUDED.nps_range_low,
             nps_range_high = EXCLUDED.nps_range_high
       RETURNING *`,
      [
        req.orgId,
        body.source_system,
        body.source_field,
        body.source_value,
        body.target_node_id,
        nodeRows[0].label,
        body.nps_range_low ?? null,
        body.nps_range_high ?? null,
      ]
    );
    res.status(201).json({ mapping: rows[0] });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/ontology/resolve ─────────────────────────────────────────────────

router.get('/resolve', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const sourceSystem = typeof req.query.source_system === 'string' ? req.query.source_system : null;
    const sourceField  = typeof req.query.source_field  === 'string' ? req.query.source_field  : null;
    const sourceValue  = typeof req.query.source_value  === 'string' ? req.query.source_value  : null;
    const npsValue     = typeof req.query.nps_value     === 'string' ? parseInt(req.query.nps_value, 10) : null;

    if (!sourceSystem && npsValue === null) {
      clientError(res, 400, 'Provide source_system+source_field+source_value or nps_value');
      return;
    }

    let mappingRows: unknown[] = [];

    if (sourceSystem && sourceField && sourceValue) {
      // Resolve by vocabulary mapping
      const { rows } = await query(
        `SELECT m.*, n.label, n.category, n.description, n.synonyms
           FROM ontology_mappings m
           JOIN ontology_nodes n ON n.id = m.target_node_id
          WHERE (m.org_id = $1 OR m.org_id = '')
            AND m.source_system = $2
            AND m.source_field  = $3
            AND m.source_value  = $4
          ORDER BY m.org_id DESC
          LIMIT 1`,
        [req.orgId, sourceSystem, sourceField, sourceValue]
      );
      mappingRows = rows;
    } else if (npsValue !== null) {
      // Resolve by NPS range
      const { rows } = await query(
        `SELECT m.*, n.label, n.category, n.description, n.synonyms
           FROM ontology_mappings m
           JOIN ontology_nodes n ON n.id = m.target_node_id
          WHERE (m.org_id = $1 OR m.org_id = '')
            AND m.nps_range_low  IS NOT NULL
            AND m.nps_range_high IS NOT NULL
            AND $2::int BETWEEN m.nps_range_low AND m.nps_range_high
          ORDER BY m.org_id DESC`,
        [req.orgId, npsValue]
      );
      mappingRows = rows;
    }

    if (!mappingRows.length) {
      res.json({ resolved: false, nodes: [], edges: [] });
      return;
    }

    // Fetch outgoing edges for the matched node(s)
    const nodeIds = [...new Set(mappingRows.map((r) => (r as { target_node_id: string }).target_node_id))];
    const { rows: edgeRows } = await query(
      `SELECT e.*, n.label AS to_node_label, n.category AS to_node_category
         FROM ontology_edges e
         JOIN ontology_nodes n ON n.id = e.to_node_id
        WHERE e.from_node_id = ANY($1::uuid[]) AND (e.org_id = $2 OR e.org_id = '')`,
      [nodeIds, req.orgId]
    );

    res.json({
      resolved: true,
      nodes: mappingRows,
      edges: edgeRows,
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') { res.json({ resolved: false, nodes: [], edges: [] }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/ontology/:id — after static paths ────────────────────────────────

router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: nodeRows } = await query(
      'SELECT * FROM ontology_nodes WHERE id = $1 AND (org_id = $2 OR org_id = \'\')',
      [req.params.id, req.orgId]
    );

    if (!nodeRows[0]) {
      clientError(res, 404, 'Node not found');
      return;
    }

    const { rows: edgeRows } = await query(
      `SELECT e.*, n.label AS to_node_label, n.category AS to_node_category
         FROM ontology_edges e
         JOIN ontology_nodes n ON n.id = e.to_node_id
        WHERE e.from_node_id = $1 AND (e.org_id = $2 OR e.org_id = '')`,
      [req.params.id, req.orgId]
    );

    const { rows: mappingRows } = await query(
      `SELECT * FROM ontology_mappings
       WHERE target_node_id = $1 AND (org_id = $2 OR org_id = '')`,
      [req.params.id, req.orgId]
    );

    res.json({
      ...nodeRows[0],
      edges: edgeRows,
      mappings: mappingRows,
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── PUT /api/ontology/:id ─────────────────────────────────────────────────────

router.put('/:id', requireAuth, requireRole('admin'), validate(updateNodeSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: existing } = await query<{ id: string; platform_node: boolean; org_id: string }>(
      'SELECT id, platform_node, org_id FROM ontology_nodes WHERE id = $1',
      [req.params.id]
    );

    if (!existing[0]) {
      clientError(res, 404, 'Node not found');
      return;
    }
    if (existing[0].platform_node || existing[0].org_id === '') {
      clientError(res, 403, 'Platform nodes cannot be modified');
      return;
    }
    if (existing[0].org_id !== req.orgId) {
      clientError(res, 404, 'Node not found');
      return;
    }

    const body = req.body as {
      category?: string;
      label?: string;
      description?: string;
      definition?: string;
      synonyms?: string[];
      x_data_ref?: string;
      o_data_ref?: string;
      parent_id?: string;
    };

    const setClauses: string[] = [];
    const params: unknown[] = [];

    const fieldMap: Record<string, unknown> = {
      category:    body.category,
      label:       body.label,
      description: body.description,
      definition:  body.definition,
      synonyms:    body.synonyms !== undefined ? body.synonyms : undefined,
      x_data_ref:  body.x_data_ref,
      o_data_ref:  body.o_data_ref,
      parent_id:   body.parent_id,
    };

    for (const [col, val] of Object.entries(fieldMap)) {
      if (val === undefined) continue;
      params.push(col === 'synonyms' ? JSON.stringify(val) : val);
      setClauses.push(`${col} = $${params.length}`);
    }

    if (setClauses.length === 0) {
      clientError(res, 400, 'No fields to update');
      return;
    }

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE ontology_nodes SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ node: rows[0] });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
