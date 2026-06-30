/**
 * Prism connector — Typeform (catalog §2 Typeform; Wave W1 "best self-serve logic fidelity").
 *
 * OAuth2 self-serve. Highest-fidelity logic import in the catalog: `logic[]` is fully
 * exposed and the stable `ref` (client key) is the join key for logic/piping/answers.
 *
 *   DISCOVER  → GET /forms                 (list the account's forms)
 *   EXTRACT   → GET /forms/{id}            (survey_def: fields[]/hidden[]/logic[]/variables)
 *              GET /forms/{id}/responses  (response: paginated cursor before/after, since/until)
 *   CDC       → form_response webhook (push) embeds form def + answers (HMAC optional)
 *
 * Answers are keyed on `field.ref` (fall back to `field.id`) per the catalog. Rate limit is
 * 2 req/sec per account, shared across Create+Responses → declared conservatively so the
 * Redis token bucket throttles us inside budget. Egress is locked to api.typeform.com.
 *
 * Legal posture: first_party_owned — customer owns the forms (security-compliance.md §4).
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

const API_HOST = 'api.typeform.com';
const API_BASE = `https://${API_HOST}`;
const ALLOW_HOSTS = [API_HOST];

/** Page size for /responses (Typeform max 1000; keep modest for steady pacing). */
const RESPONSES_PAGE_SIZE = 250;
/** Page size for /forms listing (Typeform max 200). */
const FORMS_PAGE_SIZE = 200;

const meta: ConnectorMeta = {
  platform: 'typeform',
  label: 'Typeform',
  authKind: 'oauth2',
  capabilities: ['survey_def', 'response', 'continuous_sync'],
  legalPosture: {
    basis: 'first_party_owned',
    mayStoreContent: true,
    mayProcessWithAI: true,
    attributionRequired: false,
    requiresLicenseFlag: false,
    notes: 'Customer owns the forms (security-compliance.md §4). Full store + AI.',
  },
  // 2 req/s shared Create+Responses (catalog [⚠ verify]); bucket conservative by design.
  rateLimit: { perSecond: 2 },
  // form_response webhooks deliver new responses by push; poll is the reconciling backstop.
  captureModes: { response: 'push' },
};

/** Resolve the bearer token from the connection's credential ref. TODO(verify) ref shape. */
function authHeader(conn: Connection): Record<string, string> {
  // TODO(verify): the engine resolves credential_ref → token via Secret Manager and passes
  // it on conn.config at extract time, OR the SDK injects Authorization automatically. We
  // read a token off config defensively; in production the oauthFlow helper owns refresh.
  const token = typeof conn.config?.accessToken === 'string' ? conn.config.accessToken : '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(conn: Connection, path: string): Promise<T> {
  return helpers.withRetry(async () => {
    const res = await helpers.guardedFetch(
      `${API_BASE}${path}`,
      { method: 'GET', headers: { Accept: 'application/json', ...authHeader(conn) } },
      ALLOW_HOSTS,
    );
    if (!res.ok) {
      const err = new Error(`typeform GET ${path} → ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  });
}

// ── Source response shapes (subset; per typeform.com/developers) ──────────────
interface TfFormSummary {
  id: string;
  title: string;
  last_updated_at?: string;
  _links?: { display?: string };
}
interface TfFormsList {
  items: TfFormSummary[];
  page_count?: number;
  total_items?: number;
}
interface TfField {
  id: string;
  ref?: string;
  title?: string;
  type?: string;
}
interface TfFormDef {
  id: string;
  title?: string;
  fields?: TfField[];
  hidden?: string[];
  logic?: unknown[];
  variables?: Record<string, unknown>;
}
interface TfAnswer {
  field: { id: string; ref?: string; type?: string };
  type: string;
  [k: string]: unknown;
}
interface TfResponse {
  response_id?: string;
  token?: string;
  landed_at?: string;
  submitted_at?: string;
  answers?: TfAnswer[];
  hidden?: Record<string, unknown>;
  calculated?: { score?: number };
}
interface TfResponsesPage {
  total_items?: number;
  page_count?: number;
  items: TfResponse[];
}

export const typeformConnector: PrismConnector = {
  meta,

  /**
   * CONNECT. The oauthFlow helper owns the authorize→exchange→refresh→Secret Manager dance
   * (architecture-ingestion.md §7 SDK helpers); a connector author never sees the token.
   * We return the opaque credential ref. TODO(verify) exact oauth helper entrypoint.
   */
  async authenticate(input: AuthInput): Promise<CredentialRef> {
    if (input.authKind !== 'oauth2') {
      throw new Error('typeform connector: expected authKind oauth2');
    }
    if (!input.oauthCode && !input.apiKey) {
      throw new Error('typeform connector: missing OAuth authorization code');
    }
    // TODO(verify): delegate to the shared oauthFlow() helper to exchange the code, store the
    // refresh token enveloped in Secret Manager, and return its ref. Until that helper is
    // wired, surface the authorization code as the (placeholder) credential ref.
    return input.oauthCode ?? (input.apiKey as string);
  },

  /**
   * DISCOVER — enumerate the account's forms via GET /forms (paginated). Each form becomes a
   * discoverable survey_def resource carrying its id for EXTRACT.
   */
  async *discover(conn: Connection): AsyncIterable<DiscoveredResource> {
    let page = 1;
    for (;;) {
      const list = await getJson<TfFormsList>(
        conn,
        `/forms?page=${page}&page_size=${FORMS_PAGE_SIZE}`,
      );
      for (const form of list.items ?? []) {
        yield {
          resourceRef: { kind: 'survey_def', id: form.id },
          label: form.title || form.id,
          recordType: 'survey_def',
        };
      }
      const pageCount = list.page_count ?? 1;
      if (page >= pageCount || (list.items ?? []).length === 0) break;
      page += 1;
    }
  },

  /**
   * EXTRACT. One form id → both its definition and its responses. The resource.kind selects
   * which: 'survey_def' pulls GET /forms/{id} (a single record); 'response' pages over
   * GET /forms/{id}/responses via helpers.paginate, keying answers on field.ref.
   *
   * For continuous sync the same extract tails the head: the cursor carries the `after`
   * token (or `since` time) so a poll fetches only newer responses (ADR-022 — bulk and
   * continuous are the same consumer at different offsets).
   */
  extract(
    conn: Connection,
    resource: ResourceRef,
    cursor?: Cursor,
  ): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
    const formId = resource.id;

    if (resource.kind === 'survey_def') {
      return extractFormDef(conn, formId);
    }

    // responses → cursor-paginated. Typeform uses `after`/`before` response-token cursors and
    // optional `since`/`until` time filters. We page forward with `after`.
    return helpers.paginate<TfResponse>({
      fetchPage: async (c?: Cursor) => {
        const after = typeof c?.after === 'string' ? (c.after as string) : undefined;
        const since = typeof cursor?.since === 'string' ? (cursor.since as string) : undefined;
        const params = new URLSearchParams({ page_size: String(RESPONSES_PAGE_SIZE) });
        if (after) params.set('after', after);
        // `since` (incremental delta marker) only on the first page of a continuous-sync poll.
        if (since && !after) params.set('since', since);
        const page = await getJson<TfResponsesPage>(
          conn,
          `/forms/${encodeURIComponent(formId)}/responses?${params.toString()}`,
        );
        const items = page.items ?? [];
        const last = items[items.length - 1];
        // Advance the cursor only when a full page came back; an under-full page is the end.
        const nextCursor =
          items.length === RESPONSES_PAGE_SIZE && last
            ? ({ after: last.token ?? last.response_id } as Cursor)
            : undefined;
        return { items, nextCursor };
      },
      toRecords: (items: TfResponse[]): RawRecord[] =>
        items.map((r) =>
          helpers.toRawRecord({
            org_id: conn.orgId,
            job_id: '',
            connection_id: conn.id,
            source_platform: 'typeform',
            record_type: 'response',
            // token is the stable per-submission id; response_id is the fallback.
            source_record_id: r.token ?? r.response_id ?? '',
            payload: r, // verbatim; TRANSFORM keys answers on field.ref downstream
            ingress: cursor ? 'poll' : 'backfill',
            source_observed_at: r.submitted_at ?? r.landed_at ?? null,
          }),
        ),
    });
  },

  /**
   * PROFILE — describe the source schema from a form definition record (preferred) or from
   * response answers. Fields key on the STABLE `ref` (fall back to `id`) so mapping-memory
   * survives label/order changes (ADR-018).
   */
  profile(raw: RawRecord[]): SourceSchemaProfile {
    // Prefer a survey_def record: it lists every field with its type.
    const defRec = raw.find((r) => r.record_type === 'survey_def');
    if (defRec && isFormDef(defRec.payload)) {
      const def = defRec.payload as TfFormDef;
      const fields = (def.fields ?? []).map((f) => ({
        name: f.ref ?? f.id, // stable key — mappings bind here
        type: f.type ?? 'unknown',
        label: f.title,
      }));
      return { fields, shapeHash: shapeHashOf(fields) };
    }

    // Else derive from response answers (each answer carries field.ref + type).
    const seen = new Map<string, { type: string; samples: unknown[] }>();
    for (const rec of raw) {
      const r = rec.payload as TfResponse;
      for (const a of r?.answers ?? []) {
        const key = a.field?.ref ?? a.field?.id ?? 'unknown';
        if (!seen.has(key)) seen.set(key, { type: a.type ?? 'unknown', samples: [] });
        const slot = seen.get(key)!;
        if (slot.samples.length < 3) slot.samples.push(a[a.type as string]);
      }
    }
    const fields = [...seen.entries()].map(([name, v]) => ({
      name,
      type: v.type,
      sampleValues: v.samples,
    }));
    return { fields, shapeHash: shapeHashOf(fields) };
  },
};

/** Single GET /forms/{id} → one survey_def RawRecord. Wrapped as an async iterable. */
async function* extractFormDef(
  conn: Connection,
  formId: string,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  const def = await getJson<TfFormDef>(conn, `/forms/${encodeURIComponent(formId)}`);
  yield {
    records: [
      helpers.toRawRecord({
        org_id: conn.orgId,
        job_id: '',
        connection_id: conn.id,
        source_platform: 'typeform',
        record_type: 'survey_def',
        source_record_id: def.id ?? formId,
        payload: def, // includes fields[]/hidden[]/logic[]/variables verbatim
        ingress: 'backfill',
        source_observed_at: null,
      }),
    ],
  };
}

function isFormDef(payload: unknown): payload is TfFormDef {
  return !!payload && typeof payload === 'object' && Array.isArray((payload as TfFormDef).fields);
}

/** Deterministic shape hash over ordered field name+type (reuse helper sha256). */
function shapeHashOf(fields: { name: string; type: string }[]): string {
  const canonical = fields
    .map((f) => `${f.name}:${f.type}`)
    .sort()
    .join('|');
  return sha256(canonical);
}

export default typeformConnector;
