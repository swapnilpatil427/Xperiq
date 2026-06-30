/**
 * Prism — uploaded-file storage (the `prism-upload://` backend).
 *
 * File-upload connections (CSV/XLSX/SPSS/JSON exports) need somewhere to park the
 * raw bytes between UPLOAD and the EXTRACT stage's `parseFile`. This module owns that
 * store. The opaque handle is a `fileRef`:
 *
 *   prism-upload://{org_id}/{uuid}/{safeName}
 *
 * The org_id is encoded in the ref so every read/delete can assert the caller's org
 * (the same posture as secretManager's path-prefix check). The frontend never sees a
 * filesystem path — only this ref — and the route re-derives org from the Clerk token,
 * never from the ref.
 *
 * Backend selected by `PRISM_UPLOAD_BACKEND`:
 *   'local' (default; dev) → local filesystem under PRISM_UPLOAD_DIR (default
 *                            os.tmpdir()/prism-uploads), org-namespaced subdirs.
 *   's3'                   → S3-compatible object storage (prod). Works with AWS S3,
 *                            Fly Tigris, MinIO, or GCS' S3-interop endpoint. Object
 *                            key = `${orgId}/${uuid}/${safeName}` in PRISM_UPLOAD_S3_BUCKET.
 *                            Configured from PRISM_UPLOAD_S3_{REGION,ENDPOINT,FORCE_PATH_STYLE,
 *                            ACCESS_KEY_ID,SECRET_ACCESS_KEY}; falls back to the standard AWS
 *                            default credential chain when no explicit creds are set.
 *                            (Legacy 'gcs' is accepted and mapped to 's3' with a one-time warn.)
 *
 * NOTE: the 's3' backend requires `@aws-sdk/client-s3` (a new runtime dependency for prod):
 *   npm i @aws-sdk/client-s3
 * It is imported lazily so the 'local' (dev) backend works without the package installed.
 *
 * Security:
 *  - Filename is sanitized to a single safe basename (no path traversal / zip-slip):
 *    directory components stripped, leading dots stripped, non-safe chars collapsed.
 *  - Size cap enforced (PRISM_UPLOAD_MAX_MB, default 60) on write.
 *  - Org-namespaced paths/keys; reads/deletes assert the ref's org prefix == caller org.
 */
import crypto from 'crypto';
import os from 'os';
import { promises as fs } from 'fs';
import path from 'path';
import { promises as fs } from 'fs';
import logger from '../logger';
import { tokenizeCsv } from './parsing/csv';

/** Minimal S3 client surface — real type comes from @aws-sdk/client-s3 when installed. */
type S3ClientLike = { send: (command: unknown) => Promise<unknown> };

const SCHEME = 'prism-upload://';

/** Default size cap (MB) — overridable via PRISM_UPLOAD_MAX_MB. */
function maxBytes(): number {
  const mb = Number(process.env.PRISM_UPLOAD_MAX_MB ?? 60);
  const safe = Number.isFinite(mb) && mb > 0 ? mb : 60;
  return safe * 1024 * 1024;
}

/** Root dir for the local backend (org subdirs live under here). */
function rootDir(): string {
  return process.env.PRISM_UPLOAD_DIR ?? path.join(os.tmpdir(), 'prism-uploads');
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitization + ref encode/decode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reduce an arbitrary client filename to a single safe basename.
 * Strips any directory components (path traversal / zip-slip) and leading dots, and
 * collapses every char outside [A-Za-z0-9._-] (incl. control chars, spaces, slashes)
 * to '_'. Always returns a non-empty name.
 */
export function safeFilename(filename: string): string {
  // Take the basename only — kills `../`, `/etc/passwd`, `C:\...`, etc.
  const base = path.basename(String(filename ?? '').replace(/\\/g, '/'));
  let safe = base
    .replace(/[^A-Za-z0-9._-]/g, '_') // collapse all else to '_'
    .replace(/^\.+/, '');             // never a dotfile / leading dots
  if (!safe || safe === '.' || safe === '..') safe = 'upload.dat';
  if (safe.length > 200) {
    const ext = path.extname(safe).slice(0, 12);
    safe = safe.slice(0, 200 - ext.length) + ext;
  }
  return safe;
}

/** Build the opaque fileRef for an org/uuid/name triple. */
function makeRef(orgId: string, uuid: string, safeName: string): string {
  return `${SCHEME}${orgId}/${uuid}/${safeName}`;
}

interface ParsedRef {
  orgId: string;
  uuid: string;
  safeName: string;
}

/** Parse a fileRef → its parts; throws on a malformed/unsafe ref. */
export function parseFileRef(fileRef: string): ParsedRef {
  if (typeof fileRef !== 'string' || !fileRef.startsWith(SCHEME)) {
    throw new Error('prism:uploads malformed fileRef (bad scheme)');
  }
  const rest = fileRef.slice(SCHEME.length);
  const parts = rest.split('/');
  if (parts.length !== 3) throw new Error('prism:uploads malformed fileRef (bad shape)');
  const [orgId, uuid, safeName] = parts;
  if (!orgId || !uuid || !safeName) throw new Error('prism:uploads malformed fileRef (empty part)');
  // Re-sanitize on the way out — the stored name was sanitized on write, but never trust.
  if (safeName !== safeFilename(safeName)) throw new Error('prism:uploads unsafe fileRef name');
  if (uuid.includes('..') || orgId.includes('..')) throw new Error('prism:uploads unsafe fileRef');
  return { orgId, uuid, safeName };
}

/** Assert a ref belongs to the caller's org (mirrors secretManager.assertOrgPrefix). */
function assertOrg(orgId: string, parsed: ParsedRef): void {
  if (parsed.orgId !== orgId) {
    throw new Error('prism:uploads fileRef does not belong to this org');
  }
}

/** Detect a coarse upload format from the safe filename extension (best-effort). */
export function detectFormat(safeName: string): 'csv' | 'json' | 'xlsx' | 'spss' | 'qsf' | 'triple_s' | 'unknown' {
  const ext = path.extname(safeName).toLowerCase();
  switch (ext) {
    case '.csv':  return 'csv';
    case '.tsv':  return 'csv';
    case '.json': return 'json';
    case '.xlsx': return 'xlsx';
    case '.xls':  return 'xlsx';
    case '.sav':  return 'spss';
    case '.qsf':  return 'qsf';
    case '.sss':  return 'triple_s';
    default:      return 'unknown';
  }
}

export type DetectedPlatform =
  | 'qualtrics' | 'surveymonkey' | 'typeform' | 'spss' | 'generic' | 'unknown';

/** First N bytes of a buffer as UTF-8 text — keeps sniffing cheap (don't decode whole file). */
function head(buf: Buffer, bytes = 2048): string {
  return buf.subarray(0, Math.min(buf.length, bytes)).toString('utf8');
}

/**
 * Lower-cased first CSV header row, tokenized via the shared RFC-4180 tokenizer so quoted
 * headers containing commas, alternate delimiters, a BOM, or a leading `sep=` line don't
 * corrupt the signature sniff. Good enough for a platform sniff over the first ~2 KB.
 */
function csvHeaderTokens(text: string): string[] {
  const { rows } = tokenizeCsv(text);
  const header = rows[0] ?? [];
  return header
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
}

/**
 * Best-effort detection of the SOURCE PLATFORM a file came from (distinct from its format).
 * Reads only the first ~2 KB for CSV/JSON so a large upload isn't fully decoded. Returns
 * 'generic' when the format is recognised but no platform signature matches, 'unknown' when
 * nothing matches at all.
 *
 * Header/key signatures below are derived from public export formats and are best-effort —
 * keep them permissive (any-of) so a near-miss still maps. See TODO(verify) per branch.
 */
export function detectPlatform(filename: string, buf: Buffer): DetectedPlatform {
  const ext = path.extname(safeFilename(filename)).toLowerCase();

  // Extension-decided platforms (format == platform).
  if (ext === '.qsf') return 'qualtrics';
  if (ext === '.sav') return 'spss';

  if (ext === '.csv' || ext === '.tsv') {
    const text = head(buf);
    const tokens = csvHeaderTokens(text);
    const has = (t: string): boolean => tokens.includes(t);

    // TODO(verify): Qualtrics CSV export header — leading response-metadata columns, plus a
    // second metadata row whose cells contain `{"ImportId":...}`. Best-effort from public exports.
    const qualtricsHeader =
      has('startdate') && has('enddate') && (has('status') || has('progress') || has('ipaddress'));
    const importIdRow = /\{"ImportId"\s*:/.test(text) || text.toLowerCase().includes('{"importid"');
    if (qualtricsHeader || importIdRow) return 'qualtrics';

    // TODO(verify): SurveyMonkey CSV export — `Respondent ID,Collector ID,Start Date,End Date,...`.
    if (has('respondent id') && has('collector id') && (has('start date') || has('end date'))) {
      return 'surveymonkey';
    }

    // TODO(verify): Typeform CSV export — a leading `#` token column and/or token-style columns.
    if (has('#') || has('token') || has('submitted at') || has('start date (utc)')) {
      return 'typeform';
    }

    return 'generic';
  }

  if (ext === '.json' || ext === '.ndjson') {
    const text = head(buf).trimStart();
    // Inspect only the top-level keys we can see in the first ~2 KB (avoid full parse).
    let topKeys: string[] = [];
    try {
      // Best-effort: parse only if the head looks like a complete small object; otherwise
      // fall back to substring sniffing on the head text.
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        topKeys = Object.keys(parsed as Record<string, unknown>).map((k) => k.toLowerCase());
      }
    } catch {
      // Partial/large JSON — sniff key tokens from the head text instead.
    }
    const hasKey = (k: string): boolean =>
      topKeys.includes(k) || new RegExp(`"${k}"\\s*:`, 'i').test(text);

    // TODO(verify): Typeform JSON — `{ form_id, ... }` or an `items` array of responses.
    if (hasKey('form_id') || hasKey('items')) return 'typeform';
    // TODO(verify): Qualtrics JSON export — `{ responses: [...] }`.
    if (hasKey('responses')) return 'qualtrics';
    return 'generic';
  }

  if (ext === '.xlsx' || ext === '.xls' || ext === '.sss') return 'generic';

  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Local filesystem backend
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve the on-disk path for a parsed ref, asserting it stays under the org root. */
function localPath(parsed: ParsedRef): string {
  const orgRoot = path.join(rootDir(), parsed.orgId);
  const full = path.join(orgRoot, parsed.uuid, parsed.safeName);
  // Defense-in-depth: the resolved path must remain inside the org root.
  const normalizedRoot = path.resolve(orgRoot) + path.sep;
  if (!path.resolve(full).startsWith(normalizedRoot)) {
    throw new Error('prism:uploads resolved path escapes org root');
  }
  return full;
}

async function localPut(orgId: string, safeName: string, buf: Buffer): Promise<string> {
  const uuid = crypto.randomUUID();
  const parsed: ParsedRef = { orgId, uuid, safeName };
  const full = localPath(parsed);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf, { mode: 0o600 });
  return makeRef(orgId, uuid, safeName);
}

async function localRead(parsed: ParsedRef): Promise<Buffer> {
  return fs.readFile(localPath(parsed));
}

async function localDelete(parsed: ParsedRef): Promise<void> {
  // Remove the file and its (now-empty) uuid dir; best-effort on the dir.
  const full = localPath(parsed);
  await fs.rm(full, { force: true });
  await fs.rmdir(path.dirname(full)).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// S3-compatible backend (prod) — AWS S3 / Fly Tigris / MinIO / GCS S3-interop.
//
// Requires `@aws-sdk/client-s3` (new runtime dep): `npm i @aws-sdk/client-s3`.
// Object key = `${orgId}/${uuid}/${safeName}` in PRISM_UPLOAD_S3_BUCKET. The org is
// the key prefix, so the same org-prefix assertion used by the local backend applies.
//
// Endpoint + force-path-style are what make non-AWS stores work:
//   - Fly Tigris / MinIO: set PRISM_UPLOAD_S3_ENDPOINT to the store URL and
//     PRISM_UPLOAD_S3_FORCE_PATH_STYLE=true (those stores don't do virtual-hosted
//     bucket subdomains).
//   - GCS S3-interop: set the endpoint to https://storage.googleapis.com with
//     HMAC creds; path-style also recommended.
//   - AWS S3: leave endpoint/force-path-style unset (virtual-hosted style + region).
// ─────────────────────────────────────────────────────────────────────────────

/** S3 object key for a parsed/parts triple — org is the key prefix (the org boundary). */
function s3Key(orgId: string, uuid: string, safeName: string): string {
  return `${orgId}/${uuid}/${safeName}`;
}

function s3Bucket(): string {
  const bucket = process.env.PRISM_UPLOAD_S3_BUCKET;
  if (!bucket) {
    throw new Error('prism:uploads PRISM_UPLOAD_S3_BUCKET is required for the s3 backend');
  }
  return bucket;
}

function envBool(v: string | undefined): boolean {
  return v === '1' || v?.toLowerCase() === 'true';
}

// Lazily-loaded SDK module + a memoized client (creating an S3Client is cheap but we
// avoid importing the SDK at all on the local/dev path so it stays an optional dep).
let s3SdkPromise: Promise<typeof import('@aws-sdk/client-s3')> | undefined;
let s3ClientPromise: Promise<S3ClientLike> | undefined;

async function loadS3Sdk(): Promise<typeof import('@aws-sdk/client-s3')> {
  if (!s3SdkPromise) {
    s3SdkPromise = import('@aws-sdk/client-s3').catch((err: unknown) => {
      s3SdkPromise = undefined; // allow retry after install
      throw new Error(
        'prism:uploads @aws-sdk/client-s3 is not installed — run `npm i @aws-sdk/client-s3` ' +
          `to use PRISM_UPLOAD_BACKEND=s3 (${err instanceof Error ? err.message : String(err)})`
      );
    });
  }
  return s3SdkPromise;
}

async function s3Client(): Promise<S3ClientLike> {
  if (!s3ClientPromise) {
    s3ClientPromise = (async (): Promise<S3ClientLike> => {
      const { S3Client } = await loadS3Sdk();
      const region = process.env.PRISM_UPLOAD_S3_REGION || 'us-east-1';
      const endpoint = process.env.PRISM_UPLOAD_S3_ENDPOINT || undefined;
      const forcePathStyle = envBool(process.env.PRISM_UPLOAD_S3_FORCE_PATH_STYLE);
      const accessKeyId = process.env.PRISM_UPLOAD_S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.PRISM_UPLOAD_S3_SECRET_ACCESS_KEY;
      // Explicit creds when both are set; otherwise fall back to the AWS default
      // credential chain (env, shared config, IAM role / instance metadata, etc.).
      const credentials =
        accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
      logger.info(
        { region, endpoint: endpoint ?? '(aws-default)', forcePathStyle, explicitCreds: !!credentials },
        'prism:uploads initializing s3 backend'
      );
      return new S3Client({ region, endpoint, forcePathStyle, ...(credentials ? { credentials } : {}) });
    })();
  }
  return s3ClientPromise;
}

/** Collect a GetObject body stream into a single Buffer (Node stream or web stream). */
async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  // aws-sdk v3 GetObject Body exposes transformToByteArray() in Node and browsers.
  const maybe = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybe.transformToByteArray === 'function') {
    return Buffer.from(await maybe.transformToByteArray());
  }
  // Fallback: async-iterable Node Readable.
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function s3Put(orgId: string, safeName: string, buf: Buffer): Promise<string> {
  const uuid = crypto.randomUUID();
  const { PutObjectCommand } = await loadS3Sdk();
  const client = await s3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: s3Key(orgId, uuid, safeName),
      Body: buf,
      ContentType: contentTypeFor(safeName),
      // Best-effort at-rest encryption; ignored/honored per store (AWS S3, Tigris).
      ServerSideEncryption: 'AES256',
    })
  );
  return makeRef(orgId, uuid, safeName);
}

async function s3Read(parsed: ParsedRef): Promise<Buffer> {
  const { GetObjectCommand } = await loadS3Sdk();
  const client = await s3Client();
  const out = await client.send(
    new GetObjectCommand({ Bucket: s3Bucket(), Key: s3Key(parsed.orgId, parsed.uuid, parsed.safeName) })
  );
  return streamToBuffer(out.Body);
}

async function s3Delete(parsed: ParsedRef): Promise<void> {
  const { DeleteObjectCommand } = await loadS3Sdk();
  const client = await s3Client();
  await client.send(
    new DeleteObjectCommand({ Bucket: s3Bucket(), Key: s3Key(parsed.orgId, parsed.uuid, parsed.safeName) })
  );
}

/** Best-effort Content-Type from the safe filename extension (for object metadata). */
function contentTypeFor(safeName: string): string {
  const ext = path.extname(safeName).toLowerCase();
  switch (ext) {
    case '.csv':  return 'text/csv';
    case '.tsv':  return 'text/tab-separated-values';
    case '.json': return 'application/json';
    case '.ndjson': return 'application/x-ndjson';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls':  return 'application/vnd.ms-excel';
    case '.sav':  return 'application/x-spss-sav';
    case '.qsf':  return 'application/json';
    case '.sss':  return 'application/xml';
    default:      return 'application/octet-stream';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

let warnedGcsAlias = false;

function backend(): 'local' | 's3' {
  const b = process.env.PRISM_UPLOAD_BACKEND ?? 'local';
  if (b === 's3') return 's3';
  if (b === 'gcs') {
    // Legacy value — GCS is now reached via the S3-interop endpoint. Map to s3 so
    // existing config doesn't crash; warn once.
    if (!warnedGcsAlias) {
      warnedGcsAlias = true;
      logger.warn(
        {},
        "prism:uploads PRISM_UPLOAD_BACKEND='gcs' is legacy — mapping to 's3' (set " +
          'PRISM_UPLOAD_S3_ENDPOINT=https://storage.googleapis.com with HMAC creds for GCS S3-interop)'
      );
    }
    return 's3';
  }
  if (b !== 'local') logger.warn({ backend: b }, 'prism:uploads unknown PRISM_UPLOAD_BACKEND — falling back to local');
  return 'local';
}

/**
 * Store raw upload bytes for an org; returns the opaque `prism-upload://` fileRef.
 * Enforces the size cap and sanitizes the filename. The org is encoded into the ref.
 */
export async function putUpload(orgId: string, filename: string, buf: Buffer): Promise<string> {
  if (!orgId) throw new Error('prism:uploads putUpload requires an orgId');
  if (!Buffer.isBuffer(buf)) throw new Error('prism:uploads putUpload requires a Buffer');
  const cap = maxBytes();
  if (buf.length > cap) {
    const err = Object.assign(new Error(`upload exceeds size cap (${cap} bytes)`), { status: 413 });
    throw err;
  }
  const safeName = safeFilename(filename);
  const ref = backend() === 's3' ? await s3Put(orgId, safeName, buf) : await localPut(orgId, safeName, buf);
  logger.info({ orgId, fileRef: ref, sizeBytes: buf.length }, 'prism:uploads stored');
  return ref;
}

/**
 * Read upload bytes for a fileRef. The org is encoded in the ref (`prism-upload://{org}/…`)
 * and the ref reaches here only from an already-org-scoped context (the EXTRACT stage,
 * resolved from an org-scoped job row); the ref is validated/sanitized on parse. Pass
 * `expectedOrgId` to additionally assert the ref belongs to a specific org (route layer).
 */
export async function readUpload(fileRef: string, expectedOrgId?: string): Promise<Buffer> {
  const parsed = parseFileRef(fileRef);
  if (expectedOrgId) assertOrg(expectedOrgId, parsed);
  return backend() === 's3' ? s3Read(parsed) : localRead(parsed);
}

/** Delete the upload for a fileRef; asserts org ownership when `expectedOrgId` is given. Best-effort. */
export async function deleteUpload(fileRef: string, expectedOrgId?: string): Promise<void> {
  const parsed = parseFileRef(fileRef);
  if (expectedOrgId) assertOrg(expectedOrgId, parsed);
  try {
    if (backend() === 's3') {
      await s3Delete(parsed);
    } else {
      await localDelete(parsed);
    }
  } catch (err) {
    // Best-effort: a failed cleanup must not surface as a request error.
    logger.warn(
      { orgId: parsed.orgId, err: err instanceof Error ? err.message : String(err) },
      'prism:uploads delete failed (best-effort)'
    );
  }
}
