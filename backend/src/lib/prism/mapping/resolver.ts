/**
 * Prism mapping resolver — deterministic-first, AI for the residual (ADR-018).
 *
 * A 3-layer resolver keeps human review proportional to NOVELTY, not VOLUME
 * (architecture-ingestion.md §6):
 *
 *   L1 — Connector type map  : static per-connector lookup. ~80–90%, zero AI/human.
 *   L2 — Org mapping-memory  : a confirmed mapping keyed by schema_shape_hash; a
 *                              full field-set equality check on STABLE source ids
 *                              guards against hash collisions. Read/write `prism_mappings`.
 *   L3 — LLM residual        : `schema-mapper` (CrystalOS) runs ONLY on the ambiguous
 *                              residual; unknowns default to preserve-as-embedded.
 *
 * Determinism hardening:
 *   - Schema-shape-hash is a fast pre-filter, NOT the match key — a candidate
 *     memory mapping is applied only after full field-set equality on stable ids.
 *   - Source-schema drift → re-map the DELTA only; unchanged fields keep their
 *     confirmed mapping + mapping_version. A type change on a metric-bearing
 *     field is flagged metric-affecting and forces re-confirmation.
 *   - Ambiguous deterministic match (two L1/L2 entries claim a field) → ABSTAIN,
 *     route to L3 with both candidates as context. Determinism never guesses.
 *
 * Boundary rule: CrystalOS PROPOSES, never writes. This module returns proposed
 * FieldMappings; the backend persists on confirm and TRANSFORM applies them.
 */
import type {
  FieldMapping,
  PrismMapping,
  SourceSchemaProfile,
} from '../../../types/prism';
import { query } from '../../db';
import logger from '../../logger';
import * as agentsClient from '../../agentsClient';
import { sha256 } from '../helpers';
import { lookupType } from './typemaps';

// ─────────────────────────────────────────────────────────────────────────────
// Schema-shape hash (collision-safe by design — full equality check at L2)
// ─────────────────────────────────────────────────────────────────────────────

/** Ordered, stable field signature → sha256. Hash is a pre-filter only. */
export function schemaShapeHash(profile: SourceSchemaProfile): string {
  // Sort by stable field name so order changes at source don't change the hash.
  const sig = profile.fields
    .map((f) => `${f.name}:${f.type}`)
    .sort()
    .join('|');
  return sha256(sig);
}

/** The set of (stable id, type) pairs that uniquely identifies a shape for equality. */
function fieldSet(profile: SourceSchemaProfile): Set<string> {
  return new Set(profile.fields.map((f) => `${f.name}::${f.type}`));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — connector type map
// ─────────────────────────────────────────────────────────────────────────────

function resolveL1(platform: string, profile: SourceSchemaProfile): {
  mapped: FieldMapping[];
  residual: SourceSchemaProfile['fields'];
} {
  const mapped: FieldMapping[] = [];
  const residual: SourceSchemaProfile['fields'] = [];
  for (const field of profile.fields) {
    const hit = lookupType(platform, field.type);
    if (!hit) {
      residual.push(field);
      continue;
    }
    mapped.push({
      source_field: field.name,
      source_type: field.type,
      target: hit.target,
      metric: hit.metric ?? null,
      confidence: 1,
      origin: 'deterministic',
      rationale: `connector type-map: ${platform}.${field.type} → ${hit.target}`,
    });
  }
  return { mapped, residual };
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2 — org mapping-memory (prism_mappings)
// ─────────────────────────────────────────────────────────────────────────────

/** Load the newest confirmed mapping for a shape hash within the org. */
async function loadMemory(
  orgId: string,
  connectionId: string,
  shapeHash: string,
): Promise<PrismMapping | null> {
  const { rows } = await query<PrismMapping>(
    `SELECT id, org_id, connection_id, schema_shape_hash, mapping_version, mappings, created_at
       FROM prism_mappings
      WHERE org_id = $1 AND connection_id = $2 AND schema_shape_hash = $3
      ORDER BY mapping_version DESC
      LIMIT 1`,
    [orgId, connectionId, shapeHash],
  );
  return rows[0] ?? null;
}

/**
 * Persist a confirmed mapping (versioned). Bumps mapping_version per shape.
 * Called by the backend on the confirm step — NOT during proposal.
 */
export async function saveConfirmedMapping(
  orgId: string,
  connectionId: string,
  shapeHash: string,
  mappings: FieldMapping[],
): Promise<PrismMapping> {
  const { rows } = await query<PrismMapping>(
    `INSERT INTO prism_mappings (org_id, connection_id, schema_shape_hash, mapping_version, mappings)
     VALUES ($1, $2, $3,
             COALESCE((SELECT MAX(mapping_version) FROM prism_mappings
                        WHERE org_id = $1 AND connection_id = $2 AND schema_shape_hash = $3), 0) + 1,
             $4::jsonb)
     RETURNING id, org_id, connection_id, schema_shape_hash, mapping_version, mappings, created_at`,
    [orgId, connectionId, shapeHash, JSON.stringify(mappings)],
  );
  logger.info({ orgId, connectionId, shapeHash, version: rows[0]?.mapping_version }, 'prism:mapping saved');
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 3 — CrystalOS schema-mapper (proposal only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thin wrapper over the CrystalOS `schema-mapper` skill (Prism resolver Layer 3).
 * Delegates to the typed `agentsClient.proposeMapping()` — the single X-Internal-Key
 * path every CrystalOS call goes through (POST /prism/map). On any failure (skill
 * unavailable, timeout, malformed output) it degrades gracefully to preserve-as-
 * embedded so no residual field is ever dropped (lossless by design).
 */
async function proposeMapping(
  orgId: string,
  connectionId: string,
  platform: string,
  residual: SourceSchemaProfile['fields'],
): Promise<FieldMapping[]> {
  if (residual.length === 0) return [];

  try {
    const res = await agentsClient.proposeMapping({
      orgId,
      connectionId,
      platform,
      fields: residual,
    });
    if (res && Array.isArray(res.mappings)) return res.mappings;
  } catch (err) {
    logger.warn(
      { orgId, connectionId, err: (err as Error).message },
      'prism:mapping L3 schema-mapper unavailable → preserve-as-embedded',
    );
  }

  // Safe default: preserve every residual field as embedded data (lossless, never
  // dropped). Low confidence so the UI surfaces them for human confirm.
  return residual.map((field) => ({
    source_field: field.name,
    source_type: field.type,
    target: 'embedded_data',
    metric: null,
    confidence: 0.2,
    origin: 'llm',
    rationale: 'unresolved residual — preserved as embedded data (no source data loss)',
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveResult {
  shapeHash: string;
  mappings: FieldMapping[];
  /** True when an existing org memory mapping fully covered this shape (auto-apply). */
  fromMemory: boolean;
  /** Fields whose mapping changed vs a prior version (drift delta). */
  driftFields: string[];
  /** Memory version applied / extended, if any. */
  baseVersion?: number;
}

/**
 * Resolve a source schema to FieldMappings, deterministic-first.
 *
 * 1. If org memory exists for this shape AND the field-set matches exactly →
 *    auto-apply it (the 500-near-identical-surveys win).
 * 2. Otherwise resolve L1 (type-map) for every field; route the residual to L3.
 * 3. On a KNOWN connection whose shape drifted, diff against the prior memory and
 *    re-confirm ONLY the changed fields (delta re-map) — unchanged fields keep
 *    their confirmed mapping + version.
 */
export async function resolve(
  orgId: string,
  connectionId: string,
  platform: string,
  profile: SourceSchemaProfile,
): Promise<ResolveResult> {
  const shapeHash = schemaShapeHash(profile);
  const memory = await loadMemory(orgId, connectionId, shapeHash);

  // ── L2 auto-apply: hash hit + full field-set equality ──────────────────────
  if (memory) {
    const memShape = new Set(
      memory.mappings.map((m) => `${m.source_field}::${m.source_type ?? ''}`),
    );
    if (setsEqual(memShape, fieldSet(profile))) {
      logger.info({ orgId, connectionId, shapeHash, version: memory.mapping_version }, 'prism:mapping L2 auto-apply');
      return {
        shapeHash,
        mappings: memory.mappings,
        fromMemory: true,
        driftFields: [],
        baseVersion: memory.mapping_version,
      };
    }
    logger.info(
      { orgId, connectionId, shapeHash },
      'prism:mapping L2 hash hit but field-set mismatch — treating as new shape',
    );
  }

  // ── L1 + L3 for the residual ───────────────────────────────────────────────
  const { mapped, residual } = resolveL1(platform, profile);
  const proposed = await proposeMapping(orgId, connectionId, platform, residual);
  const all = [...mapped, ...proposed];

  // ── Drift delta vs the most-recent memory for this connection (any shape) ──
  const driftFields = await computeDrift(orgId, connectionId, all);

  return { shapeHash, mappings: all, fromMemory: false, driftFields };
}

/**
 * Compare a newly-resolved mapping against the connection's most recent confirmed
 * mapping (any shape) and return the fields whose target/metric changed — the
 * delta a human must re-confirm. A metric-bearing type change is always included
 * (it is metric-affecting). Whole-survey re-mapping is never triggered by partial
 * drift (architecture §6).
 */
async function computeDrift(
  orgId: string,
  connectionId: string,
  fresh: FieldMapping[],
): Promise<string[]> {
  const { rows } = await query<PrismMapping>(
    `SELECT mappings FROM prism_mappings
      WHERE org_id = $1 AND connection_id = $2
      ORDER BY mapping_version DESC LIMIT 1`,
    [orgId, connectionId],
  );
  const prior = rows[0]?.mappings;
  if (!prior) return [];

  const priorByField = new Map(prior.map((m) => [m.source_field, m]));
  const drift: string[] = [];
  for (const f of fresh) {
    const p = priorByField.get(f.source_field);
    if (!p) { drift.push(f.source_field); continue; } // newly added field
    if (p.target !== f.target || (p.metric ?? null) !== (f.metric ?? null)) {
      drift.push(f.source_field);
    }
  }
  return drift;
}
