/**
 * Prism connector — Files (CSV / Excel / SPSS / JSON / QSF / triple-S).
 *
 * The P0 universal wedge (catalog §2 "Files", Wave W1). Covers everything else and the
 * lossy sources (MS Forms export, InMoment SFTP) ride this connector. There is no API:
 * EXTRACT parses an uploaded file into prism_raw_records via `helpers.parseFile`, with the
 * cursor = byte/row offset for resumability (handled inside the helper).
 *
 * Legal posture: first_party_owned — the customer uploads data they own
 * (security-compliance.md §4 "Survey/XM sources are first-party by definition").
 */
import type {
  PrismConnector,
  ConnectorMeta,
  AuthInput,
  CredentialRef,
  Connection,
  DiscoveredResource,
  ResourceRef,
  Cursor,
  RawRecord,
  SourceSchemaProfile,
} from '../../../types/prism';
import { helpers, sha256 } from '../helpers';
import { inferColumnType } from '../parsing/profile';

/** Supported upload formats → the parseFile format discriminant. */
type FileFormat = 'csv' | 'xlsx' | 'spss' | 'json' | 'qsf' | 'triple_s';

const FORMAT_LABELS: Record<FileFormat, string> = {
  csv: 'CSV',
  xlsx: 'Excel (.xlsx)',
  spss: 'SPSS (.sav)',
  json: 'JSON / NDJSON',
  qsf: 'Qualtrics QSF',
  triple_s: 'triple-S (.sss + data)',
};

const meta: ConnectorMeta = {
  platform: 'file',
  label: 'File upload (CSV / Excel / SPSS / JSON)',
  authKind: 'file_upload',
  // A file may carry a survey definition (QSF/triple-S structure) or responses; the engine
  // routes per record_type. The wedge case is response rows from a flat CSV/XLSX.
  capabilities: ['survey_def', 'response'],
  legalPosture: {
    basis: 'first_party_owned',
    mayStoreContent: true,
    mayProcessWithAI: true,
    attributionRequired: false,
    requiresLicenseFlag: false,
    notes:
      'Customer uploads data they own. Survey/XM data is first-party by definition '
      + '(security-compliance.md §4). Full store + AI.',
  },
  // No source API → no source rate limit. Parser size/zip-bomb caps live in the sandboxed
  // worker (security-compliance.md §3.7), not here.
};

/** Files of structure formats (QSF, triple-S) carry a survey definition; the rest are responses. */
function recordTypeForFormat(format: FileFormat): RawRecord['record_type'] {
  return format === 'qsf' || format === 'triple_s' ? 'survey_def' : 'response';
}

/**
 * Best-effort format sniff from a fileRef's extension. The fileRef is the
 * `prism-upload://{org}/{uuid}/{safeName}` ref, so the extension lives on the trailing name.
 * Used only as a fallback when a job's ResourceRef omits `extra.format`.
 */
function formatFromFileRef(fileRef: string): FileFormat {
  const ext = fileRef.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'csv':
    case 'tsv':
      return 'csv';
    case 'xlsx':
    case 'xls':
      return 'xlsx';
    case 'sav':
      return 'spss';
    case 'ndjson':
    case 'json':
      return 'json';
    case 'qsf':
      return 'qsf';
    case 'sss':
      return 'triple_s';
    default:
      return 'csv'; // safest tabular default; the parser re-checks magic bytes
  }
}

export const fileConnector: PrismConnector = {
  meta,

  /**
   * CONNECT for a file is a no-op credential: there is no source to authenticate. The
   * uploaded blob's storage ref travels on the connection config (`fileRef`); we echo it
   * back as the opaque credential ref so the lifecycle stays uniform with API connectors.
   */
  async authenticate(input: AuthInput): Promise<CredentialRef> {
    const ref = input.fileRef;
    if (!ref) {
      throw new Error('file connector: fileRef is required (uploaded file storage ref)');
    }
    return ref;
  },

  /**
   * DISCOVER yields one resource per uploaded file.
   *
   * Path implemented here: when the connection config stores the uploaded files —
   * either `config.files` (array of `{ fileRef, format? }` or bare fileRef strings) or a
   * single `config.fileRef` — we yield one DiscoveredResource per file. Each resource's
   * `extra.format` is the declared/sniffed format and drives EXTRACT (format-agnostic).
   *
   * If the connection carries NO files (files arrive only via the job's `resources`),
   * `discover` yields NOTHING and the engine drives EXTRACT directly from the job's
   * ResourceRef[] (one ResourceRef per uploaded file: `{ kind, id: fileRef,
   * extra: { format, platform } }`). Either path lands at the same `extract`.
   */
  async *discover(conn: Connection): AsyncIterable<DiscoveredResource> {
    const cfg = conn.config ?? {};
    const refs: { fileRef: string; format?: string }[] = [];

    if (Array.isArray(cfg.files)) {
      for (const entry of cfg.files) {
        if (typeof entry === 'string') {
          refs.push({ fileRef: entry });
        } else if (entry && typeof entry === 'object') {
          const e = entry as Record<string, unknown>;
          const fr = typeof e.fileRef === 'string' ? e.fileRef : undefined;
          if (fr) refs.push({ fileRef: fr, format: typeof e.format === 'string' ? e.format : undefined });
        }
      }
    } else if (typeof cfg.fileRef === 'string') {
      refs.push({ fileRef: cfg.fileRef, format: typeof cfg.format === 'string' ? cfg.format : undefined });
    }

    // No files on the connection → engine uses the job's resources directly. Yield nothing.
    for (const { fileRef, format: declared } of refs) {
      const format: FileFormat =
        declared && declared in FORMAT_LABELS
          ? (declared as FileFormat)
          : formatFromFileRef(fileRef);
      const recordType = recordTypeForFormat(format);
      yield {
        resourceRef: { kind: recordType, id: fileRef, extra: { format } },
        label: `${FORMAT_LABELS[format]} upload`,
        recordType,
      };
    }
  },

  /**
   * EXTRACT delegates wholly to `helpers.parseFile`, which streams the file in a sandboxed
   * worker (size/zip-bomb/XXE/zip-slip capped) and emits RawRecords with a byte/row-offset
   * cursor for resumability. We only supply the per-row → RawRecord mapping: each row
   * becomes one verbatim `response` (or `survey_def`) record keyed by a stable row id.
   */
  extract(
    conn: Connection,
    resource: ResourceRef,
    _cursor?: Cursor,
  ): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
    // Format-agnostic: driven by the resource, NOT by meta.platform (the connector is
    // aliased under csv/spss/json/qsf/file_auto). fileRef = resource.id; format from
    // resource.extra.format, falling back to a sniff of the fileRef extension.
    const fileRef = resource.id;
    const declared = resource.extra?.format;
    const format: FileFormat =
      typeof declared === 'string' && declared in FORMAT_LABELS
        ? (declared as FileFormat)
        : formatFromFileRef(fileRef);
    const recordType = recordTypeForFormat(format);

    return helpers.parseFile({
      fileRef,
      format,
      toRecords: (row: Record<string, unknown>, idx: number): RawRecord => {
        // Prefer a stable id column if the source carries one; else fall back to row index so
        // re-extraction of the same file is idempotent (raw unique key includes source_record_id).
        const sourceRecordId = pickRowId(row, idx);
        return helpers.toRawRecord({
          org_id: conn.orgId,
          job_id: '', // engine stamps the active job id; connector leaves blank
          connection_id: conn.id,
          source_platform: 'file',
          record_type: recordType,
          source_record_id: sourceRecordId,
          payload: row, // verbatim row → columns map to RawRecords downstream (TRANSFORM)
          ingress: 'file',
          // Files rarely carry a reliable per-row source timestamp; leave null unless a
          // recognised column is present so the §4 monotonicity guard stays correct.
          source_observed_at: pickRowTimestamp(row),
        });
      },
    });
  },

  /**
   * PROFILE infers the source schema from the first parsed rows. The parsed row payloads are
   * already keyed by the dialect's STABLE field id (for Qualtrics, the ImportId/QID — the
   * mapping key — not the volatile question text), so the column `name`s here are exactly the
   * keys the mapping resolver binds to.
   *
   * Type inference is the shared `inferColumnType` (nps 0–10 / scale / number / date / email /
   * boolean / choice / text), sampled over up to ~25 values per column. We surface a few
   * sample values + a deterministic shape hash so mapping-memory can key on the shape (ADR-018).
   */
  profile(raw: RawRecord[]): SourceSchemaProfile {
    // Preserve first-seen column order across all rows (union of keys).
    const order: string[] = [];
    const seen = new Set<string>();
    const valuesByCol = new Map<string, string[]>();
    const samplesByCol = new Map<string, unknown[]>();
    const sampleSeen = new Map<string, Set<string>>();
    const INFER_WINDOW = 25;
    const SAMPLE_LIMIT = 5;

    for (const rec of raw) {
      const row = rec.payload;
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      for (const [name, value] of Object.entries(row as Record<string, unknown>)) {
        if (!seen.has(name)) {
          seen.add(name);
          order.push(name);
          valuesByCol.set(name, []);
          samplesByCol.set(name, []);
          sampleSeen.set(name, new Set());
        }
        const asStr = value == null ? '' : String(value);
        const vals = valuesByCol.get(name)!;
        if (vals.length < INFER_WINDOW) vals.push(asStr);
        // Distinct, non-blank sample values for the mapping UI.
        if (asStr.trim() !== '') {
          const ss = sampleSeen.get(name)!;
          const samples = samplesByCol.get(name)!;
          if (!ss.has(asStr) && samples.length < SAMPLE_LIMIT) {
            ss.add(asStr);
            samples.push(value);
          }
        }
      }
    }

    const fields = order.map((name) => ({
      name,
      type: inferColumnType(valuesByCol.get(name) ?? []),
      label: name, // labels (question text) are resolved at parse time; id == mapping key here
      sampleValues: samplesByCol.get(name) ?? [],
    }));
    return { fields, shapeHash: shapeHashOf(fields) };
  },
};

// ── local helpers (no source API; pure) ──────────────────────────────────────

/**
 * Stable per-row id. Prefers a recognised id column (incl. Qualtrics ImportId-keyed
 * 'ResponseId'); else a content hash + row index so re-extracting the same file is
 * idempotent (the raw unique key includes source_record_id) yet distinct rows never collide.
 */
function pickRowId(row: Record<string, unknown>, idx: number): string {
  // Qualtrics uses 'ResponseId' as both the ImportId and the column key; the others cover
  // generic CSV / JSON exports. Case-insensitive fallback below catches casing variants.
  const candidates = ['ResponseId', 'response_id', 'responseId', 'id', 'ID', '_id', '_recordId', 'uuid'];
  for (const key of candidates) {
    const v = row[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  // Case-insensitive sweep for a "*id" / "response id" column.
  for (const [k, v] of Object.entries(row)) {
    const lk = k.toLowerCase();
    if ((lk === 'responseid' || lk === 'response id' || lk === 'record id') && v != null && String(v).trim() !== '') {
      return String(v);
    }
  }
  // No id column → content hash keeps idempotency without colliding distinct rows.
  return `row_${idx}_${sha256(JSON.stringify(row)).slice(0, 12)}`;
}

/**
 * Pick a recognised timestamp column → ISO string, else null. Handles Qualtrics ImportId
 * keys ('endDate'/'startDate'/'recordedDate') and generic export names.
 * TODO(verify): exact ImportId casing for date columns in a live Qualtrics export.
 */
function pickRowTimestamp(row: Record<string, unknown>): string | null {
  const candidates = [
    'recordedDate', 'RecordedDate',
    'endDate', 'EndDate',
    'startDate', 'StartDate',
    'submitted_at', 'date_modified', 'timestamp',
  ];
  for (const key of candidates) {
    const v = row[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return new Date(t).toISOString();
    }
  }
  return null;
}

/** Deterministic shape hash over ordered field name+type — keys org mapping-memory (ADR-018). */
function shapeHashOf(fields: { name: string; type: string }[]): string {
  const canonical = fields
    .map((f) => `${f.name}:${f.type}`)
    .sort()
    .join('|');
  return sha256(canonical);
}

export default fileConnector;
