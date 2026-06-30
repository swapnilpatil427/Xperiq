/**
 * Prism connector — SurveyMonkey (catalog §2 SurveyMonkey; Wave W2 high-volume self-serve).
 *
 * OAuth2 self-serve. Largest-volume self-serve survey source. The binding constraint is the
 * **500 req/day** quota (120/min ceiling beneath it) → backfills are paced across days; the
 * Redis token bucket throttles to budget via meta.rateLimit.
 *
 *   DISCOVER  → GET /v3/surveys                       (list the account's surveys)
 *   EXTRACT   → GET /v3/surveys/{id}/details          (survey_def: whole design, one call)
 *              GET /v3/surveys/{id}/responses/bulk?simple=true  (response: inline answer text)
 *              GET /v3/contact_lists (+ /{id}/contacts)         (contact)
 *   CDC       → poll (page cursor); no first-class push in this connector
 *
 * `simple=true` inlines answer text (the bulk endpoint is ID-only by default). Answers key on
 * `family`+`display_type` downstream (TRANSFORM). Egress is locked to api.surveymonkey.com.
 *
 * NOTE — conditional logic: SurveyMonkey does NOT expose skip/branching logic in its API
 * (catalog §3 "Not exposed"). The dry-run flags the gap rather than silently dropping it;
 * there is nothing to extract here. TODO(verify): re-confirm no logic endpoint exists.
 *
 * Legal posture: first_party_owned — customer owns the surveys (security-compliance.md §4
 * "Survey/XM sources are first-party by definition"). Full store + AI.
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

const API_HOST = 'api.surveymonkey.com';
const API_BASE = `https://${API_HOST}`;
const ALLOW_HOSTS = [API_HOST];

/** per_page max is 100 (catalog); keep at the ceiling for fewest calls under the 500/day cap. */
const PAGE_SIZE = 100;

const meta: ConnectorMeta = {
  platform: 'surveymonkey',
  label: 'SurveyMonkey',
  authKind: 'oauth2',
  capabilities: ['survey_def', 'response', 'contact'],
  legalPosture: {
    basis: 'first_party_owned',
    mayStoreContent: true,
    mayProcessWithAI: true,
    attributionRequired: false,
    requiresLicenseFlag: false,
    notes:
      'Customer owns the surveys; Survey/XM data is first-party by definition '
      + '(security-compliance.md §4). Full store + AI.',
  },
  // 120/min AND 500/day — the 500/day is binding → multi-day paced backfill. We declare
  // perDay so the token bucket spreads a large backfill across days (catalog [⚠ verify]).
  rateLimit: { perSecond: 2, perDay: 500 },
  // No first-class push wired here; poll (page cursor) is the capture mode.
  captureModes: { response: 'poll' },
};

/** Bearer token from connection config. The engine resolves credential_ref → token (SM). */
function authHeader(conn: Connection): Record<string, string> {
  // TODO(verify): credential plumbing once oauthFlow()/SM resolver is wired (see typeform.ts).
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
      const err = new Error(`surveymonkey GET ${path} → ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  });
}

// ── Source response shapes (subset; per developer.surveymonkey.com) ───────────
interface SmListItem {
  id: string;
  title?: string;
  href?: string;
}
interface SmList<T> {
  data: T[];
  per_page?: number;
  page?: number;
  total?: number;
  links?: { next?: string };
}
interface SmSurveyDetails {
  id: string;
  title?: string;
  pages?: Array<{
    id?: string;
    questions?: Array<{
      id?: string;
      family?: string;
      subtype?: string;
      display_type?: string;
      headings?: Array<{ heading?: string }>;
    }>;
  }>;
}
interface SmResponse {
  id?: string;
  survey_id?: string;
  date_created?: string;
  date_modified?: string;
  pages?: Array<{ questions?: Array<{ id?: string; answers?: unknown[] }> }>;
}
interface SmContact {
  id?: string;
  email?: string;
}

export const surveymonkeyConnector: PrismConnector = {
  meta,

  /**
   * CONNECT. OAuth2 (scopes surveys_read, responses_read_detail [paid], contacts_read). The
   * shared oauthFlow helper owns the exchange/refresh/Secret Manager dance; we return the
   * opaque credential ref. TODO(verify) exact oauth helper entrypoint + SM ref shape.
   */
  async authenticate(input: AuthInput): Promise<CredentialRef> {
    if (input.authKind !== 'oauth2') {
      throw new Error('surveymonkey connector: expected authKind oauth2');
    }
    if (!input.oauthCode && !input.apiKey) {
      throw new Error('surveymonkey connector: missing OAuth authorization code');
    }
    // TODO(verify): delegate to oauthFlow() to exchange the code and store the refresh token
    // enveloped in Secret Manager; until wired, surface the code as the placeholder ref.
    return input.oauthCode ?? (input.apiKey as string);
  },

  /**
   * DISCOVER — enumerate the account's surveys (GET /v3/surveys, page-cursored) and contact
   * lists (GET /v3/contact_lists). Each survey becomes both a survey_def and a response
   * resource; each contact list a contact resource. The engine selects by resource kind.
   */
  async *discover(conn: Connection): AsyncIterable<DiscoveredResource> {
    // Surveys
    let page = 1;
    for (;;) {
      const list = await getJson<SmList<SmListItem>>(
        conn,
        `/v3/surveys?per_page=${PAGE_SIZE}&page=${page}`,
      );
      const items = list.data ?? [];
      for (const s of items) {
        yield {
          resourceRef: { kind: 'survey_def', id: s.id },
          label: s.title || s.id,
          recordType: 'survey_def',
        };
        yield {
          resourceRef: { kind: 'response', id: s.id },
          label: `${s.title || s.id} — responses`,
          recordType: 'response',
        };
      }
      if (!list.links?.next || items.length < PAGE_SIZE) break;
      page += 1;
    }

    // Contact lists
    let listPage = 1;
    for (;;) {
      const list = await getJson<SmList<SmListItem>>(
        conn,
        `/v3/contact_lists?per_page=${PAGE_SIZE}&page=${listPage}`,
      );
      const items = list.data ?? [];
      for (const cl of items) {
        yield {
          resourceRef: { kind: 'contact', id: cl.id },
          label: `${cl.title || cl.id} — contacts`,
          recordType: 'contact',
        };
      }
      if (!list.links?.next || items.length < PAGE_SIZE) break;
      listPage += 1;
    }
  },

  /**
   * EXTRACT. Dispatches by resource kind:
   *   survey_def → GET /v3/surveys/{id}/details          (single record, whole design)
   *   response   → GET /v3/surveys/{id}/responses/bulk?simple=true (page-paginated)
   *   contact    → GET /v3/contact_lists/{id}/contacts    (page-paginated)
   *
   * For continuous sync the same extract tails the head: the response cursor carries the
   * page number (or a `start_modified_at` filter) so a poll fetches only newer responses
   * (ADR-022 — bulk and continuous are one consumer at different offsets).
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
   * PROFILE — describe the source schema. From survey details we read the question map
   * (keyed on question id — the stable key mappings bind to); from response rows we read the
   * answered question ids. `family`/`display_type` feed the schema-mapper downstream.
   */
  profile(raw: RawRecord[]): SourceSchemaProfile {
    const defRec = raw.find((r) => r.record_type === 'survey_def');
    if (defRec && isSurveyDetails(defRec.payload)) {
      const def = defRec.payload as SmSurveyDetails;
      const fields: { name: string; type: string; label?: string }[] = [];
      for (const page of def.pages ?? []) {
        for (const q of page.questions ?? []) {
          fields.push({
            name: q.id ?? 'unknown', // question id — stable mapping key
            type: `${q.family ?? 'unknown'}:${q.display_type ?? q.subtype ?? ''}`,
            label: q.headings?.[0]?.heading,
          });
        }
      }
      return { fields, shapeHash: shapeHashOf(fields) };
    }

    const seen = new Map<string, true>();
    for (const rec of raw) {
      const r = rec.payload as SmResponse;
      for (const page of r?.pages ?? []) {
        for (const q of page.questions ?? []) {
          if (q.id) seen.set(q.id, true);
        }
      }
    }
    const fields = [...seen.keys()].map((name) => ({ name, type: 'unknown' }));
    return { fields, shapeHash: shapeHashOf(fields) };
  },
};

// ── Extraction strategies (module-level; no `this`) ───────────────────────────

/** survey_def: GET /v3/surveys/{id}/details → one verbatim survey_def record. */
async function* extractSurveyDef(
  conn: Connection,
  surveyId: string,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  const def = await getJson<SmSurveyDetails>(
    conn,
    `/v3/surveys/${encodeURIComponent(surveyId)}/details`,
  );
  yield {
    records: [
      helpers.toRawRecord({
        org_id: conn.orgId,
        job_id: '',
        connection_id: conn.id,
        source_platform: 'surveymonkey',
        record_type: 'survey_def',
        source_record_id: def.id ?? surveyId,
        payload: def,
        ingress: 'backfill',
        source_observed_at: null,
      }),
    ],
  };
}

/**
 * response: page over GET /v3/surveys/{id}/responses/bulk?simple=true via helpers.paginate.
 * `simple=true` inlines answer text (the default bulk endpoint returns ID-only choices).
 *
 * TODO(verify): exact cursor — SurveyMonkey returns `links.next` (a full URL with page=N);
 * we page by incrementing `page`. `start_modified_at` enables incremental continuous sync.
 */
function extractResponses(
  conn: Connection,
  surveyId: string,
  cursor?: Cursor,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  const sinceModified =
    typeof cursor?.start_modified_at === 'string' ? (cursor.start_modified_at as string) : undefined;

  return helpers.paginate<SmResponse>({
    fetchPage: async (c?: Cursor) => {
      const page = typeof c?.page === 'number' ? (c.page as number) : 1;
      const params = new URLSearchParams({
        simple: 'true',
        per_page: String(PAGE_SIZE),
        page: String(page),
      });
      if (sinceModified) params.set('start_modified_at', sinceModified);
      const res = await getJson<SmList<SmResponse>>(
        conn,
        `/v3/surveys/${encodeURIComponent(surveyId)}/responses/bulk?${params.toString()}`,
      );
      const items = res.data ?? [];
      // Advance only when a full page came back AND the API reports a next link.
      const nextCursor =
        items.length === PAGE_SIZE && res.links?.next ? ({ page: page + 1 } as Cursor) : undefined;
      return { items, nextCursor };
    },
    toRecords: (items: SmResponse[]): RawRecord[] =>
      items.map((r) =>
        helpers.toRawRecord({
          org_id: conn.orgId,
          job_id: '',
          connection_id: conn.id,
          source_platform: 'surveymonkey',
          record_type: 'response',
          source_record_id: r.id ?? '',
          payload: r, // verbatim; TRANSFORM keys answers on family+display_type
          ingress: cursor ? 'poll' : 'backfill',
          source_observed_at: r.date_modified ?? r.date_created ?? null,
        }),
      ),
  });
}

/** contact: page over GET /v3/contact_lists/{id}/contacts via helpers.paginate. */
function extractContacts(
  conn: Connection,
  listId: string,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  return helpers.paginate<SmContact>({
    fetchPage: async (c?: Cursor) => {
      const page = typeof c?.page === 'number' ? (c.page as number) : 1;
      const res = await getJson<SmList<SmContact>>(
        conn,
        `/v3/contact_lists/${encodeURIComponent(listId)}/contacts?per_page=${PAGE_SIZE}&page=${page}`,
      );
      const items = res.data ?? [];
      const nextCursor =
        items.length === PAGE_SIZE && res.links?.next ? ({ page: page + 1 } as Cursor) : undefined;
      return { items, nextCursor };
    },
    toRecords: (items: SmContact[]): RawRecord[] =>
      items.map((c) =>
        helpers.toRawRecord({
          org_id: conn.orgId,
          job_id: '',
          connection_id: conn.id,
          source_platform: 'surveymonkey',
          record_type: 'contact',
          source_record_id: c.id ?? '',
          payload: c,
          ingress: 'backfill',
          source_observed_at: null,
        }),
      ),
  });
}

// ── pure helpers ──────────────────────────────────────────────────────────────

function isSurveyDetails(payload: unknown): payload is SmSurveyDetails {
  return !!payload && typeof payload === 'object' && 'pages' in (payload as object);
}

function shapeHashOf(fields: { name: string; type: string }[]): string {
  const canonical = fields
    .map((f) => `${f.name}:${f.type}`)
    .sort()
    .join('|');
  return sha256(canonical);
}

export default surveymonkeyConnector;
