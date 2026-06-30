/**
 * Prism — shared schema profiler for tabular sources.
 *
 * Turns parsed rows (after a dialect has resolved field ids + labels) into a
 * `SourceSchemaProfile`: one entry per field with a STABLE `name` (the mapping key — for
 * Qualtrics this is the ImportId/QID, for a generic CSV it's the disambiguated header),
 * an inferred `type`, a human `label`, and a few `sampleValues`.
 *
 * The `type` here is a lightweight SOURCE-side inference (nps / scale / number / date /
 * email / choice / boolean / text) — NOT a target QuestionType. The mapping resolver
 * (mapping/resolver.ts) consumes this profile; `name` + `type` feed `schemaShapeHash`, so
 * the inference must be deterministic and order-independent (it samples values, never RNG).
 */
import type { SourceSchemaProfile } from '../../../types/prism';

/** Coarse source-side value type. Deterministic so the shape hash is stable. */
export type InferredType =
  | 'nps' | 'scale' | 'number' | 'date' | 'email' | 'boolean' | 'choice' | 'text' | 'null';

/** A field as a dialect hands it to the profiler: stable id + optional human label. */
export interface ProfileField {
  /** Stable source id — the mapping key (ImportId/QID for Qualtrics; header for generic). */
  name: string;
  /** Human-readable label (question text / recode label). Defaults to `name` if absent. */
  label?: string;
}

/** Rows are arrays of cells aligned to `fields` by index (a dialect guarantees alignment). */
export interface ProfileInput {
  fields: ProfileField[];
  rows: string[][];
  /** Max distinct sample values to keep per field (default 5). */
  sampleLimit?: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// ISO-ish or common date/datetime; we only need a coarse signal (Date.parse confirms).
const DATEISH_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;
const SLASH_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}([ T]\d{1,2}:\d{2})?/;
const BOOL_VALUES = new Set(['true', 'false', 'yes', 'no', 'y', 'n']);

function isBlank(v: string | undefined): boolean {
  return v == null || v.trim() === '';
}

function looksNumeric(v: string): boolean {
  const t = v.trim();
  if (t === '') return false;
  // Reject things like "12 apples"; allow leading +/-, decimals, thousands-free.
  return !Number.isNaN(Number(t)) && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t);
}

function looksDate(v: string): boolean {
  const t = v.trim();
  if (!DATEISH_RE.test(t) && !SLASH_DATE_RE.test(t)) return false;
  return !Number.isNaN(Date.parse(t));
}

/**
 * Infer a column's type from sampled non-blank values. The order of checks matters:
 * email/date/boolean are recognised before the numeric family, and within numerics an
 * all-integer 0..10 column is `nps`, a small bounded integer range is `scale`.
 */
export function inferColumnType(values: string[]): InferredType {
  const nonBlank = values.filter((v) => !isBlank(v)).map((v) => v.trim());
  if (nonBlank.length === 0) return 'null';

  const all = (pred: (v: string) => boolean): boolean => nonBlank.every(pred);

  if (all((v) => EMAIL_RE.test(v))) return 'email';
  if (all(looksDate)) return 'date';
  if (all((v) => BOOL_VALUES.has(v.toLowerCase()))) return 'boolean';

  if (all(looksNumeric)) {
    const nums = nonBlank.map(Number);
    const allInt = nums.every((n) => Number.isInteger(n));
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    // Likert-shaped first: a small bounded 1..7 integer range is a scale, NOT NPS — even
    // though 1..5 technically fits inside 0..10. NPS needs evidence of the 0–10 range
    // (reaches 8+, or includes a 0).
    if (allInt && min >= 1 && max <= 7) return 'scale';
    if (allInt && min >= 0 && max <= 10 && (max >= 8 || min === 0)) return 'nps';
    return 'number';
  }

  // Low-cardinality short strings → a choice/category; else free text.
  const distinct = new Set(nonBlank.map((v) => v.toLowerCase()));
  const avgLen = nonBlank.reduce((s, v) => s + v.length, 0) / nonBlank.length;
  if (distinct.size <= 12 && distinct.size < nonBlank.length && avgLen <= 40) return 'choice';
  return 'text';
}

/**
 * Build a `SourceSchemaProfile` from dialect-resolved fields + aligned rows.
 * - Samples the first `sampleLimit` DISTINCT non-blank values per column for type inference
 *   and for the `sampleValues` surfaced to the mapping UI.
 * - `shapeHash` is computed by the caller's resolver (`schemaShapeHash`) — but we also emit a
 *   local one so the profile is self-contained when used standalone; the resolver recomputes
 *   from `name`+`type` regardless.
 */
export function profileRows(input: ProfileInput): SourceSchemaProfile {
  const limit = input.sampleLimit ?? 5;
  const fields = input.fields;

  // Collect sampled values per column index.
  const samplesByCol: string[][] = fields.map(() => []);
  const seenByCol: Set<string>[] = fields.map(() => new Set<string>());
  // For type inference we want a slightly larger window than what we surface.
  const inferWindow = Math.max(limit, 25);
  const inferByCol: string[][] = fields.map(() => []);

  for (const row of input.rows) {
    for (let c = 0; c < fields.length; c++) {
      const cell = row[c] ?? '';
      if (inferByCol[c].length < inferWindow) inferByCol[c].push(cell);
      if (isBlank(cell)) continue;
      const key = cell.trim();
      if (seenByCol[c].has(key)) continue;
      if (samplesByCol[c].length < limit) {
        samplesByCol[c].push(cell);
        seenByCol[c].add(key);
      }
    }
  }

  const outFields = fields.map((f, c) => ({
    name: f.name,
    type: inferColumnType(inferByCol[c]),
    label: f.label ?? f.name,
    sampleValues: samplesByCol[c],
  }));

  return { fields: outFields, shapeHash: localShapeHash(outFields) };
}

/** Local, dependency-free shape hash (FNV-1a) — resolver recomputes its own canonical hash. */
function localShapeHash(fields: { name: string; type: string }[]): string {
  const sig = fields.map((f) => `${f.name}:${f.type}`).sort().join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i++) {
    h ^= sig.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
