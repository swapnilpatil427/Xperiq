/**
 * Prism connector — Qualtrics (catalog §2 Qualtrics "most open, fully self-serve" ✅ flagship; Wave W1).
 *
 * Auth: X-API-TOKEN header (api_key) OR OAuth2 client_credentials. The datacenter id lives
 * in the host (`{dc}.qualtrics.com`) and is supplied via auth `extra.datacenterId`.
 *
 *   DISCOVER  → GET /API/v3/surveys                         (list surveys)
 *   EXTRACT   → responses via the async export 3-step (helpers.exportPoll):
 *                 POST /surveys/{id}/export-responses        → progressId
 *                 GET  …/export-responses/{progressId}       → fileId (poll)
 *                 GET  …/export-responses/{fileId}/file      → ZIP (download/stream)
 *              survey-definitions: GET /survey-definitions/{id}
 *              mailing lists:      GET /mailinglists (+ /{id}/contacts)
 *   CDC       → event subscriptions (push)
 *
 * Rate posture: serialize large exports (low export limits + concurrency) — declared
 * concurrentExports:3. Egress is locked to the connection's `{dc}.qualtrics.com` host.
 *
 * Legal posture: first_party_owned — customer owns the data (security-compliance.md §4).
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

const meta: ConnectorMeta = {
  platform: 'qualtrics',
  label: 'Qualtrics',
  authKind: 'api_key', // also supports oauth2; declared primary kind is the API token
  capabilities: ['survey_def', 'response', 'contact', 'distribution', 'continuous_sync'],
  legalPosture: {
    basis: 'first_party_owned',
    mayStoreContent: true,
    mayProcessWithAI: true,
    attributionRequired: false,
    requiresLicenseFlag: false,
    notes: 'Customer owns the data + authorizes export (security-compliance.md §4). Full store + AI.',
  },
  // Brand-wide ~3,000 req/min but exports are the bottleneck → serialize, concurrentExports:3.
  rateLimit: { concurrentExports: 3 },
  // Event subscriptions deliver new responses by push; poll (continuationToken) is the backstop.
  captureModes: { response: 'push' },
};

/** Resolve the datacenter id (host segment) from connection config. Required. */
function datacenter(conn: Connection): string {
  const dc = typeof conn.config?.datacenterId === 'string' ? conn.config.datacenterId : '';
  if (!dc) throw new Error('qualtrics connector: datacenterId missing on connection config');
  return dc;
}

function hostFor(conn: Connection): string {
  return `${datacenter(conn)}.qualtrics.com`;
}

function baseFor(conn: Connection): string {
  return `https://${hostFor(conn)}/API/v3`;
}

/**
 * Auth headers. The engine resolves credential_ref → token via Secret Manager; we read it
 * defensively off config. X-API-TOKEN for api_key; Bearer for oauth2.
 * TODO(verify): exact credential plumbing once oauthFlow()/SM resolver is wired.
 */
function authHeaders(conn: Connection): Record<string, string> {
  const apiToken = typeof conn.config?.apiToken === 'string' ? conn.config.apiToken : '';
  if (apiToken) return { 'X-API-TOKEN': apiToken };
  const bearer = typeof conn.config?.accessToken === 'string' ? conn.config.accessToken : '';
  return bearer ? { Authorization: `Bearer ${bearer}` } : {};
}

async function apiGet<T>(conn: Connection, path: string): Promise<T> {
  const host = hostFor(conn);
  return helpers.withRetry(async () => {
    const res = await helpers.guardedFetch(
      `${baseFor(conn)}${path}`,
      { method: 'GET', headers: { Accept: 'application/json', ...authHeaders(conn) } },
      [host],
    );
    if (!res.ok) {
      const err = new Error(`qualtrics GET ${path} → ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  });
}

async function apiPost<T>(conn: Connection, path: string, body: unknown): Promise<T> {
  const host = hostFor(conn);
  return helpers.withRetry(async () => {
    const res = await helpers.guardedFetch(
      `${baseFor(conn)}${path}`,
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeaders(conn) },
        body: JSON.stringify(body),
      },
      [host],
    );
    if (!res.ok) {
      const err = new Error(`qualtrics POST ${path} → ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  });
}

// ── Source shapes (subset; per api.qualtrics.com) ─────────────────────────────
interface QxSurveyListItem {
  id: string;
  name: string;
  lastModified?: string;
  isActive?: boolean;
}
interface QxSurveyList {
  result: { elements: QxSurveyListItem[]; nextPage?: string | null };
}
interface QxExportStart {
  result: { progressId: string };
}
interface QxExportProgress {
  result: { percentComplete?: number; status: string; fileId?: string };
}
interface QxResponseRow {
  responseId?: string;
  values?: Record<string, unknown>;
  labels?: Record<string, unknown>;
  recordedDate?: string;
  endDate?: string;
}
interface QxSurveyDefinition {
  result: {
    id?: string;
    name?: string;
    questions?: Record<string, { questionText?: string; questionType?: { type?: string; selector?: string } }>;
  };
}
interface QxMailingList {
  id: string;
  name: string;
}
interface QxMailingLists {
  result: { elements: QxMailingList[]; nextPage?: string | null };
}

export const qualtricsConnector: PrismConnector = {
  meta,

  /**
   * CONNECT. Validates we have either an API token (api_key) or an OAuth client-credentials
   * grant, plus a datacenter id. The shared oauth/SM helper owns secret storage; we return
   * the opaque credential ref. TODO(verify) oauthFlow() entrypoint + SM ref shape.
   */
  async authenticate(input: AuthInput): Promise<CredentialRef> {
    const dc = typeof input.extra?.datacenterId === 'string' ? input.extra.datacenterId : '';
    if (!dc) throw new Error('qualtrics connector: extra.datacenterId is required');

    if (input.authKind === 'api_key') {
      if (!input.apiKey) throw new Error('qualtrics connector: apiKey (X-API-TOKEN) required');
      // TODO(verify): store the token enveloped in Secret Manager and return its ref.
      return input.apiKey;
    }
    if (input.authKind === 'oauth2') {
      if (!input.oauthCode && !input.apiKey) {
        throw new Error('qualtrics connector: missing OAuth client-credentials grant');
      }
      // TODO(verify): exchange via oauthFlow() (client_credentials, space-separated scopes
      // e.g. read:surveys read:survey_responses), store enveloped, return ref.
      return input.oauthCode ?? (input.apiKey as string);
    }
    throw new Error(`qualtrics connector: unsupported authKind ${input.authKind}`);
  },

  /**
   * DISCOVER — list surveys (token-paginated via result.nextPage) and mailing lists. Each
   * survey becomes both a survey_def and a response resource; each mailing list a contact
   * resource. The engine picks which to extract from the resource ref's kind.
   */
  async *discover(conn: Connection): AsyncIterable<DiscoveredResource> {
    // Surveys
    let next: string | null | undefined = '/surveys';
    while (next) {
      const page: QxSurveyList = await apiGet<QxSurveyList>(conn, pathFromNext(next, '/surveys'));
      for (const s of page.result.elements ?? []) {
        yield {
          resourceRef: { kind: 'survey_def', id: s.id },
          label: s.name || s.id,
          recordType: 'survey_def',
        };
        yield {
          resourceRef: { kind: 'response', id: s.id },
          label: `${s.name || s.id} — responses`,
          recordType: 'response',
        };
      }
      next = page.result.nextPage ?? null;
    }

    // Mailing lists (XM Directory) → contact resources
    let nextList: string | null | undefined = '/mailinglists';
    while (nextList) {
      const page: QxMailingLists = await apiGet<QxMailingLists>(
        conn,
        pathFromNext(nextList, '/mailinglists'),
      );
      for (const ml of page.result.elements ?? []) {
        yield {
          resourceRef: { kind: 'contact', id: ml.id },
          label: `${ml.name || ml.id} — contacts`,
          recordType: 'contact',
        };
      }
      nextList = page.result.nextPage ?? null;
    }
  },

  /**
   * EXTRACT. Dispatches by resource kind:
   *   survey_def → GET /survey-definitions/{id}  (single record)
   *   response   → async export-poll (POST → poll progressId → download fileId)
   *   contact    → GET /mailinglists/{id}/contacts (paginated)  TODO(verify): async export shape
   */
  extract(
    conn: Connection,
    resource: ResourceRef,
    cursor?: Cursor,
  ): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
    switch (resource.kind) {
      case 'survey_def':
        return extractSurveyDef(conn, resource.id);
      case 'contact':
        return extractContacts(conn, resource.id);
      case 'response':
      default:
        return extractResponses(conn, resource.id, cursor);
    }
  },

  /**
   * PROFILE — describe the source schema. From a survey definition we read the question map
   * (keyed on QID — the stable key mappings bind to); from response rows we read the value
   * field keys. QID/question-type hints feed the schema-mapper (architecture-ingestion.md §6).
   */
  profile(raw: RawRecord[]): SourceSchemaProfile {
    const defRec = raw.find((r) => r.record_type === 'survey_def');
    if (defRec && isSurveyDef(defRec.payload)) {
      const result = (defRec.payload as QxSurveyDefinition).result;
      const fields = Object.entries(result.questions ?? {}).map(([qid, q]) => ({
        name: qid, // QID — stable mapping key
        type: q.questionType?.type ?? 'unknown',
        label: q.questionText,
      }));
      return { fields, shapeHash: shapeHashOf(fields) };
    }

    const seen = new Map<string, { samples: unknown[] }>();
    for (const rec of raw) {
      const row = rec.payload as QxResponseRow;
      for (const [k, v] of Object.entries(row?.values ?? {})) {
        if (!seen.has(k)) seen.set(k, { samples: [] });
        const slot = seen.get(k)!;
        if (slot.samples.length < 3 && v != null) slot.samples.push(v);
      }
    }
    const fields = [...seen.entries()].map(([name, v]) => ({
      name,
      type: 'unknown',
      sampleValues: v.samples,
    }));
    return { fields, shapeHash: shapeHashOf(fields) };
  },
};

// ── Extraction strategies (module-level so `this` is never relied on) ─────────

/** survey_def: GET /survey-definitions/{id} → one verbatim survey_def record. */
async function* extractSurveyDef(
  conn: Connection,
  surveyId: string,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  const def = await apiGet<QxSurveyDefinition>(
    conn,
    `/survey-definitions/${encodeURIComponent(surveyId)}`,
  );
  yield {
    records: [
      helpers.toRawRecord({
        org_id: conn.orgId,
        job_id: '',
        connection_id: conn.id,
        source_platform: 'qualtrics',
        record_type: 'survey_def',
        source_record_id: def.result.id ?? surveyId,
        payload: def.result,
        ingress: 'backfill',
        source_observed_at: null,
      }),
    ],
  };
}

/**
 * response: the async export 3-step, driven by helpers.exportPoll. The helper owns the
 * poll loop, resumes from progressId/fileId via the cursor, and streams the downloaded ZIP
 * so a 50M-row export never loads into memory. We supply start/poll/download/toRecords.
 *
 * TODO(verify): exact export request body (format json/ndjson, useLabels, continuationToken
 * for incrementals, startDate/endDate filtering on survey START date per the catalog) and
 * the ZIP entry shape yielded by the download stream.
 */
function extractResponses(
  conn: Connection,
  surveyId: string,
  cursor?: Cursor,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  const continuationToken =
    typeof cursor?.continuationToken === 'string' ? (cursor.continuationToken as string) : undefined;

  return helpers.exportPoll<QxResponseRow>({
    // 1. POST /surveys/{id}/export-responses → progressId
    start: async (): Promise<string> => {
      const body: Record<string, unknown> = { format: 'json' };
      // TODO(verify): continuationToken enables incremental (continuous-sync) export.
      if (continuationToken) body.continuationToken = continuationToken;
      const started = await apiPost<QxExportStart>(
        conn,
        `/surveys/${encodeURIComponent(surveyId)}/export-responses`,
        body,
      );
      return started.result.progressId;
    },
    // 2. GET …/export-responses/{progressId} → { done, fileId, pct }
    poll: async (progressId: string) => {
      const prog = await apiGet<QxExportProgress>(
        conn,
        `/surveys/${encodeURIComponent(surveyId)}/export-responses/${encodeURIComponent(progressId)}`,
      );
      const status = prog.result.status;
      const done = status === 'complete';
      if (status === 'failed') {
        throw new Error(`qualtrics export failed for survey ${surveyId}`);
      }
      return { done, fileId: prog.result.fileId, pct: prog.result.percentComplete };
    },
    // 3. GET …/export-responses/{fileId}/file → ZIP → stream-parse to rows.
    // The helper handles the ZIP/stream decode; it yields parsed response rows of type T.
    download: (fileId: string): AsyncIterable<QxResponseRow> =>
      downloadExportFile(conn, surveyId, fileId),
    toRecords: (row: QxResponseRow): RawRecord[] => [
      helpers.toRawRecord({
        org_id: conn.orgId,
        job_id: '',
        connection_id: conn.id,
        source_platform: 'qualtrics',
        record_type: 'response',
        source_record_id: row.responseId ?? '',
        payload: row,
        ingress: cursor ? 'poll' : 'backfill',
        // recordedDate is the source-observed time → monotonicity guard (§4).
        source_observed_at: row.recordedDate ?? row.endDate ?? null,
      }),
    ],
  });
}

/**
 * Stream the export ZIP file. Delegates the HTTP GET to guardedFetch; the actual ZIP entry
 * decode + JSON-array streaming is the SDK's parse concern. We yield each parsed response row.
 *
 * TODO(verify): the export file is a ZIP whose single entry is a JSON document
 * `{ responses: [...] }`. Until a streaming ZIP/JSON decoder is exposed by the SDK, we read
 * the file and iterate the responses array. For a true 50M-row export this MUST become a
 * streamed parse (architecture-ingestion.md §7) — flagged for the SDK helper.
 */
async function* downloadExportFile(
  conn: Connection,
  surveyId: string,
  fileId: string,
): AsyncIterable<QxResponseRow> {
  const host = hostFor(conn);
  const res = await helpers.guardedFetch(
    `${baseFor(conn)}/surveys/${encodeURIComponent(surveyId)}/export-responses/${encodeURIComponent(fileId)}/file`,
    { method: 'GET', headers: { ...authHeaders(conn) } },
    [host],
  );
  if (!res.ok) {
    const err = new Error(`qualtrics download ${fileId} → ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  // TODO(verify): decode the ZIP entry as a stream. Placeholder: parse the JSON body and
  // iterate `responses`. The body is the unzipped JSON when the SDK transparently inflates.
  const doc = (await res.json()) as { responses?: QxResponseRow[] };
  for (const row of doc.responses ?? []) yield row;
}

/**
 * contact: paginate GET /mailinglists/{id}/contacts (token-paginated). XM Directory also
 * supports an async export; TODO(verify) whether to switch to exportPoll for large lists.
 */
function extractContacts(
  conn: Connection,
  listId: string,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  interface QxContactsPage {
    result: { elements: Array<Record<string, unknown>>; nextPage?: string | null };
  }
  return helpers.paginate<Record<string, unknown>>({
    fetchPage: async (c?: Cursor) => {
      const next = typeof c?.next === 'string' ? (c.next as string) : `/mailinglists/${encodeURIComponent(listId)}/contacts`;
      const page = await apiGet<QxContactsPage>(conn, pathFromNext(next, `/mailinglists/${encodeURIComponent(listId)}/contacts`));
      const nextCursor = page.result.nextPage ? ({ next: page.result.nextPage } as Cursor) : undefined;
      return { items: page.result.elements ?? [], nextCursor };
    },
    toRecords: (items): RawRecord[] =>
      items.map((c) =>
        helpers.toRawRecord({
          org_id: conn.orgId,
          job_id: '',
          connection_id: conn.id,
          source_platform: 'qualtrics',
          record_type: 'contact',
          source_record_id: String((c.id ?? c.contactId ?? '') as string),
          payload: c,
          ingress: 'backfill',
          source_observed_at: null,
        }),
      ),
  });
}

// ── pure helpers ──────────────────────────────────────────────────────────────

/**
 * Qualtrics `nextPage` is a full URL/path. Convert it to a path under /API/v3, falling back
 * to the base path when it's the first (untokenised) page. We never fetch an arbitrary URL —
 * only the path portion is reused, and guardedFetch re-validates the host allowlist.
 */
function pathFromNext(next: string, base: string): string {
  if (next === base) return base;
  try {
    const u = new URL(next, 'https://placeholder.qualtrics.com');
    const idx = u.pathname.indexOf('/API/v3');
    const path = idx >= 0 ? u.pathname.slice(idx + '/API/v3'.length) : u.pathname;
    return `${path}${u.search}`;
  } catch {
    return base;
  }
}

function isSurveyDef(payload: unknown): payload is QxSurveyDefinition {
  return !!payload && typeof payload === 'object' && 'result' in (payload as object);
}

function shapeHashOf(fields: { name: string; type: string }[]): string {
  const canonical = fields
    .map((f) => `${f.name}:${f.type}`)
    .sort()
    .join('|');
  return sha256(canonical);
}

export default qualtricsConnector;
