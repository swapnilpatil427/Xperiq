/**
 * Prism SDK helpers — the leverage layer connectors compose.
 *
 * Implements the `PrismHelpers` contract from `../../../types/prism`. Connectors
 * import these; they MUST NOT reimplement extraction/retry/SSRF/hashing per
 * connector (architecture-ingestion.md §7 "SDK helpers").
 *
 * No new npm deps: Node stdlib only (crypto, global fetch, net). CSV + JSON are
 * parsed natively here; binary/statistical formats (XLSX/SPSS/QSF/triple_s) throw
 * a typed "not implemented" so the interface holds until a parser dep is added.
 */
import crypto from 'crypto';
import net from 'net';
import type {
  PrismHelpers,
  RawRecord,
  Cursor,
  ExportPollOpts,
  PaginateOpts,
  ParseFileOpts,
} from '../../../types/prism';
import logger from '../../logger';
import { readUpload, detectPlatform, type DetectedPlatform } from '../uploads';
import { tokenizeCsv } from '../parsing/csv';
import { selectDialect, type DetectContext } from '../parsing/dialects';

// ─────────────────────────────────────────────────────────────────────────────
// Hashing / provenance
// ─────────────────────────────────────────────────────────────────────────────

/** Stable, key-ordered JSON so equal payloads always hash equal (order-independent). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** sha256 over canonical JSON of an arbitrary payload. */
export function hashPayload(payload: unknown): string {
  return sha256(canonicalJson(payload));
}

/** Build a provenance-stamped RawRecord (fills payload_hash from the payload). */
export function toRawRecord(
  input: Omit<RawRecord, 'payload_hash'> & { payload: unknown },
): RawRecord {
  return {
    ...input,
    payload_hash: hashPayload(input.payload),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SSRF-guarded fetch (egress allowlist)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_REDIRECTS = 5;

/** Deny private / link-local / loopback / metadata targets regardless of allowlist. */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Cloud metadata endpoints — the canonical SSRF pivot.
  if (h === '169.254.169.254' || h === 'metadata.google.internal' || h === 'fd00:ec2::254') return true;

  // Loopback (IPv4/IPv6) + unspecified
  if (h === '::1' || h === '0.0.0.0' || h === '::') return true;

  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 127) return true;                         // loopback
    if (a === 10) return true;                          // RFC-1918
    if (a === 172 && b >= 16 && b <= 31) return true;   // RFC-1918
    if (a === 192 && b === 168) return true;            // RFC-1918
    if (a === 169 && b === 254) return true;            // link-local (incl. metadata)
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT RFC-6598
    if (a === 0) return true;                           // "this network"
    return false;
  }

  if (net.isIPv6(h)) {
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local fc00::/7
    if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return true; // link-local fe80::/10
    return false;
  }

  // Hostnames that resolve to localhost by convention.
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;

  return false;
}

/**
 * Validate a URL against an EXACT-host allowlist + private-range denylist.
 * Throws on violation so callers never accidentally egress to a blocked target.
 */
function assertUrlAllowed(rawUrl: string, allowHosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`guardedFetch: invalid URL "${rawUrl}"`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`guardedFetch: protocol "${url.protocol}" not allowed`);
  }
  const host = url.hostname.toLowerCase();
  // Exact-host allowlist (no suffix wildcards — exact match only).
  if (!allowHosts.map((a) => a.toLowerCase()).includes(host)) {
    throw new Error(`guardedFetch: host "${host}" not in allowlist`);
  }
  if (isBlockedHost(host)) {
    throw new Error(`guardedFetch: host "${host}" resolves to a blocked range`);
  }
  return url;
}

/**
 * SSRF-guarded fetch. Re-validates the target on every 3xx redirect hop
 * (a server can 302 you to 169.254.169.254 — we re-guard, not trust).
 */
export async function guardedFetch(
  rawUrl: string,
  init: RequestInit,
  allowHosts: string[],
): Promise<Response> {
  let currentUrl = assertUrlAllowed(rawUrl, allowHosts).toString();
  let redirects = 0;

  // Manual redirect handling so we can re-guard each hop.
  while (true) {
    const res = await fetch(currentUrl, { ...init, redirect: 'manual' });
    const status = res.status;
    if (status >= 300 && status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      if (++redirects > MAX_REDIRECTS) {
        throw new Error('guardedFetch: too many redirects');
      }
      const next = new URL(location, currentUrl).toString();
      assertUrlAllowed(next, allowHosts); // re-guard the redirect target
      currentUrl = next;
      continue;
    }
    return res;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry with exponential backoff + jitter
// ─────────────────────────────────────────────────────────────────────────────

/** Classify whether an error is worth retrying (429 / 5xx / network blips). */
export function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: number; code?: string; message?: string };
  const status = e?.status ?? e?.statusCode;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false; // other 4xx are caller faults — not retryable
  }
  const code = e?.code ?? '';
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'ENOTFOUND'].includes(code)) {
    return true;
  }
  const msg = (e?.message ?? '').toLowerCase();
  return msg.includes('timeout') || msg.includes('socket hang up');
}

/** Parse a Retry-After header (seconds or HTTP-date) into milliseconds. */
function retryAfterMs(err: unknown): number | null {
  const e = err as { retryAfter?: string | number; headers?: { get?: (k: string) => string | null } };
  const raw = e?.retryAfter ?? e?.headers?.get?.('retry-after');
  if (raw == null) return null;
  const asNum = Number(raw);
  if (!Number.isNaN(asNum)) return Math.max(0, asNum * 1000);
  const date = Date.parse(String(raw));
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Exponential backoff + full jitter. base=1s, cap=60s, jitter ±50%, max 8 attempts.
 * Honors `Retry-After` for that hop (operations-runbook.md §3.3).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { caps?: number } = {},
): Promise<T> {
  const maxAttempts = opts.caps ?? 8;
  const base = 1000;
  const cap = 60_000;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts - 1) throw err;
      const header = retryAfterMs(err);
      const expo = Math.min(base * 2 ** attempt, cap);
      const jittered = expo * (1 + (Math.random() - 0.5)); // ±50% full jitter
      const delay = header ?? Math.max(0, jittered);
      logger.warn(
        { attempt: attempt + 1, delayMs: Math.round(delay), err: (err as Error).message },
        'prism:withRetry backoff',
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction shapes: exportPoll / paginate
// ─────────────────────────────────────────────────────────────────────────────

/** Async export → poll-until-ready → stream-download → toRecords (Qualtrics/Medallia). */
export async function* exportPoll<T>(
  opts: ExportPollOpts<T>,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  const progressId = await withRetry(() => opts.start());
  // Poll until the export job reports done. Bounded by withRetry per-call only;
  // the surrounding loop terminates on `done`.
  let fileId: string | undefined;
  for (;;) {
    const status = await withRetry(() => opts.poll(progressId));
    if (status.done) {
      fileId = status.fileId;
      break;
    }
    await sleep(2000);
  }
  if (!fileId) throw new Error('exportPoll: export completed without a fileId');

  for await (const chunk of opts.download(fileId)) {
    const records = opts.toRecords(chunk);
    if (records.length) {
      yield { records, nextCursor: { progressId, fileId } };
    }
  }
}

/** Page through a cursor / page-token API, checkpointing per page. */
export async function* paginate<T>(
  opts: PaginateOpts<T>,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  let cursor: Cursor | undefined;
  for (;;) {
    const page = await withRetry(() => opts.fetchPage(cursor));
    const records = opts.toRecords(page.items);
    yield { records, nextCursor: page.nextCursor };
    if (!page.nextCursor || page.items.length === 0) break;
    cursor = page.nextCursor;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// File parsing — CSV + JSON native; others typed stubs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse CSV text into row objects via the file-dialect framework
 * (parsing/csv.ts tokenizer + parsing/dialects.ts dialect selection).
 *
 * The tokenizer is RFC-4180-style (quoted fields, escaped `""`, embedded newlines/commas,
 * CRLF/LF/CR, BOM strip, `sep=` hint, delimiter sniff). The selected dialect decides which
 * row is the header and where data starts — so a Qualtrics export's THREE leading rows are
 * handled correctly instead of mangled, and a plain CSV uses its single header row.
 *
 * Each data row becomes an object keyed by the dialect's STABLE field id (for Qualtrics the
 * ImportId/QID — the mapping key — not the volatile question text). Rows are padded/truncated
 * to the field count so ragged rows never desync columns. Duplicate/empty headers are
 * disambiguated. Never throws — unknown shapes fall back to a single-header generic read.
 *
 * `ctx` lets a caller pass the sniffed platform + filename so the right dialect is chosen;
 * omitting it defaults to a generic single-header CSV (back-compatible with the old behavior).
 */
export function parseCsv(text: string, ctx: DetectContext = { filename: '' }): Record<string, unknown>[] {
  const { rows } = tokenizeCsv(text ?? '');
  if (rows.length === 0) return [];

  const dialect = selectDialect(rows, ctx);
  const { fields, dataStartRow } = dialect.resolveHeader(rows);
  const width = fields.length;
  if (width === 0) return [];

  const out: Record<string, unknown>[] = [];
  for (let r = dataStartRow; r < rows.length; r++) {
    const cells = rows[r];
    // Skip a fully-empty data line (already filtered by the tokenizer, but be defensive).
    if (cells.length === 1 && cells[0] === '') continue;
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < width; c++) {
      const v = cells[c];
      obj[fields[c].id] = v === undefined ? null : v; // pad short rows with null
    }
    out.push(obj);
  }
  return out;
}

/** Normalize a parsed JSON file into an array of record objects. */
export function jsonToRows(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    // Common envelopes: { data: [...] } / { results: [...] } / { responses: [...] }
    for (const key of ['data', 'results', 'responses', 'items', 'records']) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
    return [obj];
  }
  return [];
}

/** Filename carried on the trailing segment of a `prism-upload://{org}/{uuid}/{name}` ref. */
function filenameFromRef(fileRef: string): string {
  const seg = fileRef.split('/').pop() ?? '';
  return seg;
}

/**
 * Decode upload bytes to text with a clear error on bad encoding rather than a crash.
 * UTF-8 with a validating decoder (`fatal: true`) catches truncated multibyte / binary
 * blobs masquerading as CSV; the BOM, if any, is stripped downstream by the tokenizer.
 */
function decodeUtf8(buf: Buffer, fileRef: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw new Error(
      `parseFile: "${filenameFromRef(fileRef)}" is not valid UTF-8 text — re-export as UTF-8 CSV/JSON`,
    );
  }
}

/**
 * Parse an uploaded file into raw records. CSV + JSON implemented natively (no new deps);
 * XLSX/SPSS/QSF/triple_s throw until a parser dep is added.
 *
 * CSV goes through the file-dialect framework (parseCsv → tokenizer + dialect selection), so
 * Qualtrics multi-header exports, alternate delimiters, BOM/`sep=` lines and quoted/embedded
 * newlines are all handled generically. The sniffed platform + filename are passed as dialect
 * context so the Qualtrics CSV dialect can claim the file when its `{"ImportId":…}` row is
 * present. JSON keeps the envelope-unwrapping `jsonToRows`.
 */
export async function* parseFile(
  opts: ParseFileOpts,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  const { fileRef, format, toRecords } = opts;

  if (format !== 'csv' && format !== 'json') {
    // Typed stub so the interface holds — a real parser dep is required.
    throw new Error(`parseFile: format "${format}" not implemented — needs parser dep`);
  }

  // Resolve the `prism-upload://{org}/{uuid}/{name}` ref to its bytes via the upload store
  // (the ref reaches here from an already-org-scoped job row). The store validates the ref.
  const buf = await readUpload(fileRef);
  const filename = filenameFromRef(fileRef);
  const text = decodeUtf8(buf, fileRef);

  let rows: Record<string, unknown>[];
  if (format === 'csv') {
    // Sniff the source platform from the bytes (cheap; first ~2 KB) → dialect context.
    let platform: DetectedPlatform | undefined;
    try {
      platform = detectPlatform(filename, buf);
    } catch {
      platform = undefined; // detection is best-effort; never block parsing on it
    }
    const ctx: DetectContext = { filename, platform };
    rows = parseCsv(text, ctx);
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error(`parseFile: "${filename}" is not valid JSON — ${(err as Error).message}`);
    }
    rows = jsonToRows(parsed);
  }

  // Header-only / empty file → no data rows. Yield nothing (a 0-record extract, not an error).
  // Chunk to keep memory bounded (stream-parse spirit; native parse is already in-memory,
  // but we yield in batches so downstream EXTRACT writes incrementally).
  const CHUNK = 500;
  for (let start = 0; start < rows.length; start += CHUNK) {
    const slice = rows.slice(start, start + CHUNK);
    const records = slice.map((row, j) => toRecords(row, start + j));
    yield { records, nextCursor: { rowOffset: start + slice.length } };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembled helpers bundle (the PrismHelpers contract)
// ─────────────────────────────────────────────────────────────────────────────

export const helpers: PrismHelpers = {
  exportPoll,
  paginate,
  parseFile,
  toRawRecord,
  guardedFetch,
  withRetry,
};

export default helpers;
