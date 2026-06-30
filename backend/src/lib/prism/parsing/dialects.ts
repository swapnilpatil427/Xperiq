/**
 * Prism — file "dialect" framework.
 *
 * Real-world survey exports are NOT one CSV shape. A naive `split(',') + row[0] is the header`
 * parser mangles a Qualtrics export (which carries THREE leading rows) and silently mislabels
 * every column. This module is a small, pluggable registry of *dialects*: each dialect knows
 * how to look at the tokenized grid (`string[][]`) and answer three questions:
 *
 *   1. detect(rows, ctx)      — "is this me?" → a confidence score (0 = not me).
 *   2. resolveHeader(rows)    — where does the DATA start, and what is each column's
 *                               stable `id` (the mapping key) + human `label`?
 *   3. (inherited)            — everything downstream (records, profile) is driven off (2).
 *
 * Adding a new dialect (surveymonkey_csv, typeform_csv, …) = one small object registered in
 * `DIALECTS`. The framework never throws on an unknown shape — `selectDialect` always returns
 * at least `genericCsv`.
 *
 * Contract with the rest of Prism (types/prism.ts):
 *  - `field.id` becomes `SourceSchemaProfile.fields[].name` — the STABLE mapping key. For
 *    Qualtrics that is the ImportId/QID (NOT the question text, which changes between exports).
 *  - `field.label` becomes the human label shown in the mapping UI.
 */
import type { DetectedPlatform } from '../uploads';
import { tokenizeCsv } from './csv';

/** A resolved column: a stable id (mapping key) + a human-readable label. */
export interface ResolvedField {
  /** Stable source id → SourceSchemaProfile.fields[].name (the mapping key). */
  id: string;
  /** Human label (question text / recode label) → fields[].label. */
  label: string;
}

/** A dialect's read of the grid: where data begins + the resolved column list. */
export interface HeaderResolution {
  fields: ResolvedField[];
  /** 0-based index into `rows` where the FIRST data row lives. */
  dataStartRow: number;
}

export interface DetectContext {
  filename: string;
  /** The platform `uploads.detectPlatform` sniffed (best-effort), if available. */
  platform?: DetectedPlatform;
}

export interface FileDialect {
  /** Stable id, e.g. 'qualtrics_csv'. */
  id: string;
  /** Human label for logs/telemetry. */
  label: string;
  /**
   * Confidence this dialect applies, 0..1 (0 = definitely not). The registry picks the
   * highest score; ties break by registration order. MUST NOT throw.
   */
  detect(rows: string[][], ctx: DetectContext): number;
  /**
   * Resolve header → fields + dataStartRow. MUST NOT throw; on any surprise it should
   * degrade to a best-effort generic read rather than crash.
   */
  resolveHeader(rows: string[][]): HeaderResolution;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Disambiguate duplicate / empty header ids so every field id is unique + non-empty. */
export function disambiguate(ids: string[]): string[] {
  const seen = new Map<string, number>();
  return ids.map((raw, idx) => {
    let id = (raw ?? '').trim();
    if (id === '') id = `col_${idx + 1}`;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return n === 0 ? id : `${id}__${n + 1}`;
  });
}

/** True if a cell parses as a JSON object containing an "ImportId" key (Qualtrics row-3 marker). */
function isImportIdCell(cell: string): boolean {
  const t = (cell ?? '').trim();
  if (!t.startsWith('{') || !t.includes('ImportId')) return false;
  try {
    const obj = JSON.parse(t) as Record<string, unknown>;
    return obj != null && typeof obj === 'object' && 'ImportId' in obj;
  } catch {
    // Tolerate a near-miss (e.g. trailing junk) — the substring match is signal enough.
    return /"ImportId"\s*:/.test(t);
  }
}

/** Extract the ImportId string from a Qualtrics row-3 metadata cell, or null. */
function importIdOf(cell: string): string | null {
  const t = (cell ?? '').trim();
  if (!t.startsWith('{')) return null;
  try {
    const obj = JSON.parse(t) as Record<string, unknown>;
    const v = obj?.ImportId;
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    const m = /"ImportId"\s*:\s*"([^"]*)"/.exec(t);
    return m && m[1] ? m[1] : null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialect: qualtrics_csv
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Qualtrics CSV export shape:
 *   Row 1: column headers (question text OR QIDs, e.g. "What is your NPS?" or "Q1").
 *   Row 2: a SECOND header row — question text / recode labels.
 *   Row 3: a JSON metadata row; each cell like `{"ImportId":"startDate","timeZone":"…"}`
 *          or `{"ImportId":"QID12"}`. THIS is the load-bearing signature.
 *   Row 4+: actual response data.
 *
 * We use the ImportId as the stable field `id` (it's stable across exports — the question
 * text is not), and prefer the richer of row-1/row-2 as the human `label`.
 *
 * TODO(verify): the exact row signatures against a live Qualtrics export
 * ("Haystack test_…csv" was not in the repo at build time). Specifically confirm:
 *   - Row 2 is ALWAYS present (some "use choice text" exports may collapse rows 1+2).
 *   - ImportId values for system columns ("startDate","endDate","Status","IPAddress",
 *     "Progress","Duration (in seconds)","Finished","RecordedDate","ResponseId",
 *     "RecipientLastName"/"…FirstName"/"…Email","ExternalReference","LocationLatitude",
 *     "LocationLongitude","DistributionChannel","UserLanguage") vs question ids ("QID12").
 *   - Whether a leading `sep=,` line and/or BOM appear (we already strip both in the tokenizer).
 */
export const qualtricsCsv: FileDialect = {
  id: 'qualtrics_csv',
  label: 'Qualtrics CSV export',

  detect(rows, ctx): number {
    if (rows.length < 3) return 0;
    // The metadata row is whichever of the first ~3 rows is mostly {"ImportId":…} cells.
    const metaRowIdx = findImportIdRow(rows);
    if (metaRowIdx === -1) {
      // No ImportId row, but the platform sniff said Qualtrics → weak claim (e.g. a
      // "use numeric values" export variant). Let generic still win unless nothing else does.
      return ctx.platform === 'qualtrics' ? 0.2 : 0;
    }
    // Strong signal: a JSON ImportId row in the first three lines.
    const base = metaRowIdx <= 2 ? 0.95 : 0.6;
    return ctx.platform === 'qualtrics' ? Math.min(1, base + 0.04) : base;
  },

  resolveHeader(rows): HeaderResolution {
    const metaRowIdx = findImportIdRow(rows);
    // Defensive: if we somehow lost the signal, fall back to generic.
    if (metaRowIdx === -1) return genericCsv.resolveHeader(rows);

    const row1 = rows[0] ?? [];
    const row2 = metaRowIdx >= 1 ? rows[metaRowIdx - 1] ?? [] : [];
    const metaRow = rows[metaRowIdx] ?? [];
    const width = Math.max(row1.length, row2.length, metaRow.length);

    const rawIds: string[] = [];
    const labels: string[] = [];
    for (let c = 0; c < width; c++) {
      // Stable id: ImportId if present, else fall back to the row-1 header, else a positional id.
      const importId = importIdOf(metaRow[c] ?? '');
      const h1 = (row1[c] ?? '').trim();
      const h2 = (row2[c] ?? '').trim();
      rawIds.push(importId ?? (h1 || h2));
      // Human label: prefer the longer/richer of the two header rows (question text),
      // falling back to the id so a label is never empty.
      const label = pickRicher(h1, h2) || importId || `col_${c + 1}`;
      labels.push(label);
    }

    const ids = disambiguate(rawIds);
    const fields = ids.map((id, c) => ({ id, label: labels[c] || id }));
    return { fields, dataStartRow: metaRowIdx + 1 };
  },
};

/** Index of the first row (within the first 3) that is predominantly `{"ImportId":…}` cells. */
function findImportIdRow(rows: string[][]): number {
  const scan = Math.min(rows.length, 3);
  for (let r = 0; r < scan; r++) {
    const cells = rows[r];
    if (!cells || cells.length === 0) continue;
    const hits = cells.filter(isImportIdCell).length;
    // "Predominantly" = at least half the cells (and ≥1) look like ImportId metadata.
    if (hits >= 1 && hits >= Math.ceil(cells.length / 2)) return r;
  }
  return -1;
}

/** Choose the more informative of two header strings (longer non-empty wins; a wins ties). */
function pickRicher(a: string, b: string): string {
  if (!b) return a;
  if (!a) return b;
  return b.length > a.length ? b : a;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialect: generic_csv (the always-applicable fallback)
// ─────────────────────────────────────────────────────────────────────────────

/** Single header row = field names; data from row 2. Always claims a tiny baseline. */
export const genericCsv: FileDialect = {
  id: 'generic_csv',
  label: 'Generic CSV (single header row)',

  detect(rows): number {
    // Baseline claim so selectDialect always has a winner; any specific dialect outscores it.
    return rows.length > 0 ? 0.1 : 0;
  },

  resolveHeader(rows): HeaderResolution {
    if (rows.length === 0) return { fields: [], dataStartRow: 0 };
    const header = rows[0];
    const ids = disambiguate(header.map((h) => (h ?? '').trim()));
    const fields = ids.map((id) => ({ id, label: id }));
    return { fields, dataStartRow: 1 };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Dialect hooks (TODO — the framework makes adding these trivial)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TODO(verify) surveymonkey_csv: SurveyMonkey exports a TWO-row header (row 1 = question,
 * row 2 = sub-question / choice), leading columns `Respondent ID,Collector ID,Start Date,
 * End Date,IP Address,Email Address,First Name,Last Name,Custom Data 1`. Implement `detect`
 * keyed on those leading headers + a present second header row, and `resolveHeader` that joins
 * row1+row2 into a composite label while using a positional/`Respondent ID`-anchored id.
 *
 * TODO(verify) typeform_csv: a leading `#` index column + token-style columns; usually a
 * single header row, so it can often ride genericCsv — register a dialect only if the field
 * ids need the `ref`/token treatment.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Registry + selection
// ─────────────────────────────────────────────────────────────────────────────

/** Registration order matters only for score ties; specific dialects precede the generic one. */
export const DIALECTS: FileDialect[] = [qualtricsCsv, genericCsv];

/**
 * Pick the best dialect for a tokenized grid. NEVER throws and NEVER returns undefined —
 * `genericCsv` is the guaranteed floor. Uses the detected platform as a tiebreaker hint.
 */
export function selectDialect(rows: string[][], ctx: DetectContext): FileDialect {
  let best: FileDialect = genericCsv;
  let bestScore = -1;
  for (const d of DIALECTS) {
    let score = 0;
    try {
      score = d.detect(rows, ctx);
    } catch {
      score = 0; // a misbehaving dialect must never break selection
    }
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

/** Tokenize + select in one call (convenience for callers that start from raw text). */
export function selectDialectFromText(text: string, ctx: DetectContext): { dialect: FileDialect; rows: string[][] } {
  const { rows } = tokenizeCsv(text);
  return { dialect: selectDialect(rows, ctx), rows };
}
