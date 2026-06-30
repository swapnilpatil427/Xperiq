/**
 * Prism TRANSFORM — apply a confirmed PrismMapping to raw records, producing
 * canonical staging rows (responses / signals shape) with `metadata.prism`
 * provenance. Pure function of (raw + mappings): re-runnable, never touches
 * canonical tables (architecture-ingestion.md §3, §6).
 *
 * Filled-out a form → Response; came from any other channel → Signal (the
 * boundary rule). Unmapped fields are PRESERVED as embedded data — never dropped.
 * Source submit time → submitted_at / original_at (NEVER import time).
 */
import type {
  RawRecord,
  PrismMapping,
  FieldMapping,
  ValueRule,
} from '../../types/prism';
import { hashPayload } from './helpers';

/** A canonical staging row ready for LOAD. Not yet written to a live table. */
export interface StagedRow {
  kind: 'response' | 'signal';
  org_id: string;
  /**
   * Target survey for a response row. An import MATERIALIZES a survey (see
   * lib/prism/survey.ts) and every response attaches to it — `responses.survey_id`
   * is NOT NULL. Stamped here from the transform context so LOAD can satisfy the
   * constraint without re-deriving it. Null only for signal-only imports (signals
   * carry their source ref in metadata, not a survey_id).
   */
  survey_id: string | null;
  source_platform: string;
  source_record_id: string;
  natural_key: string;            // source_platform:source_record_id
  /** answers (response) or content/metadata (signal). */
  answers: Record<string, unknown>;
  respondent: Record<string, unknown> | null;
  submitted_at: string | null;    // source time → submitted_at/original_at
  source_observed_at: string | null;
  metadata: { prism: Record<string, unknown> };
  /** sha256 of the canonical answers payload → LOAD no-op detection. */
  payload_hash: string;
}

export interface TransformResult {
  rows: StagedRow[];
  unmapped: { source_record_id: string; source_field: string; action: string }[];
}

export interface TransformContext {
  importBatchId: string;
  mappingVersion: number;
  connectorVersion?: string;
  legalBasis?: string;
  /** record_type → 'signal' forces signal shape (reviews/calls); default 'response'. */
  recordKind?: 'response' | 'signal';
  /**
   * The materialized survey id for this import (lib/prism/survey.ts). Stamped onto
   * every response staged row so LOAD satisfies `responses.survey_id` NOT NULL.
   * Null for signal-only imports.
   */
  surveyId?: string | null;
}

// ── Value coercion ─────────────────────────────────────────────────────────────

/** Linear rescale: out = round((in-inMin)/(inMax-inMin)*(outMax-outMin)+outMin). */
function applyRescale(value: number, rule: ValueRule): number {
  const { in_min = 0, in_max = 1, out_min = 0, out_max = 1 } = rule;
  if (in_max === in_min) return out_min;
  const scaled = ((value - in_min) / (in_max - in_min)) * (out_max - out_min) + out_min;
  return Math.round(scaled);
}

function applyValueRules(raw: unknown, rules?: ValueRule[]): unknown {
  if (!rules || rules.length === 0) return raw;
  let value: unknown = raw;
  for (const rule of rules) {
    if (rule.kind === 'verbatim') continue;
    if (rule.kind === 'map' && rule.map) {
      const key = String(value);
      value = rule.map[key] ?? value;
    } else if (rule.kind === 'rescale') {
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isNaN(num)) value = applyRescale(num, rule);
    }
  }
  return value;
}

/** Pull a source field's value from a raw payload by stable id (best-effort). */
function readField(payload: unknown, field: string): unknown {
  if (!payload || typeof payload !== 'object') return undefined;
  const obj = payload as Record<string, unknown>;
  if (field in obj) return obj[field];
  // Common nested shapes: { answers: { <field>: ... } } / { values: {...} }.
  for (const container of ['answers', 'values', 'data', 'fields']) {
    const inner = obj[container];
    if (inner && typeof inner === 'object' && field in (inner as Record<string, unknown>)) {
      return (inner as Record<string, unknown>)[field];
    }
  }
  return undefined;
}

/** Source-time extraction with a few common field names. */
function readSourceTime(payload: unknown, fallback: string | null): string | null {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['submitted_at', 'submittedAt', 'recorded_at', 'recordedDate', 'created', 'created_at', 'submitted', 'endDate', 'date']) {
      const v = obj[key];
      if (typeof v === 'string' && v) return v;
    }
  }
  return fallback;
}

/**
 * Apply a confirmed mapping to a batch of NON-POISON raw records.
 * Mapped fields → answers keyed by target; 'embedded_data'/'preserve'/'display_text'
 * targets → preserved under metadata.prism.embedded (lossless).
 */
export function transform(
  raw: RawRecord[],
  mapping: PrismMapping,
  ctx: TransformContext,
): TransformResult {
  const rows: StagedRow[] = [];
  const unmapped: TransformResult['unmapped'] = [];
  const byField: Map<string, FieldMapping> = new Map(
    mapping.mappings.map((m) => [m.source_field, m]),
  );

  for (const rec of raw) {
    if (rec.poison) continue; // quarantined — excluded from TRANSFORM

    const answers: Record<string, unknown> = {};
    const embedded: Record<string, unknown> = {};

    for (const [field, fm] of byField) {
      const value = readField(rec.payload, field);
      if (value === undefined) continue;
      const coerced = applyValueRules(value, fm.value_rules);
      if (fm.target === 'embedded_data' || fm.target === 'preserve' || fm.target === 'display_text') {
        embedded[field] = coerced;
        unmapped.push({
          source_record_id: rec.source_record_id,
          source_field: field,
          action: fm.target === 'embedded_data' ? 'preserved_as_embedded_data' : `preserved_as_${fm.target}`,
        });
      } else {
        answers[field] = { value: coerced, target: fm.target, metric: fm.metric ?? null };
      }
    }

    // Any source field with no mapping at all → preserve verbatim (never drop).
    if (rec.payload && typeof rec.payload === 'object') {
      for (const key of Object.keys(rec.payload as Record<string, unknown>)) {
        if (!byField.has(key) && !(key in embedded)) {
          embedded[key] = (rec.payload as Record<string, unknown>)[key];
        }
      }
    }

    const kind = ctx.recordKind ?? (rec.record_type === 'review' || rec.record_type === 'signal' ? 'signal' : 'response');
    const submittedAt = readSourceTime(rec.payload, rec.source_observed_at);

    const prism: Record<string, unknown> = {
      source_platform: rec.source_platform,
      source_record_id: rec.source_record_id,
      import_batch_id: ctx.importBatchId,
      imported_at: new Date().toISOString(),
      source_observed_at: rec.source_observed_at,
      mapping_version: ctx.mappingVersion,
      connector_version: ctx.connectorVersion ?? null,
      legal_basis: ctx.legalBasis ?? null,
      ingress: rec.ingress,
    };
    if (Object.keys(embedded).length) prism.embedded = embedded;

    rows.push({
      kind,
      org_id: rec.org_id,
      // Response rows attach to the import's materialized survey; signals carry none.
      survey_id: kind === 'response' ? (ctx.surveyId ?? null) : null,
      source_platform: rec.source_platform,
      source_record_id: rec.source_record_id,
      natural_key: `${rec.source_platform}:${rec.source_record_id}`,
      answers,
      respondent: null,
      submitted_at: submittedAt,
      source_observed_at: rec.source_observed_at,
      metadata: { prism },
      payload_hash: hashPayload(answers),
    });
  }

  return { rows, unmapped };
}
