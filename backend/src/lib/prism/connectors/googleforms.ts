/**
 * Prism connector — Google Forms (catalog §2 Google Forms; Wave W2 self-serve, access caveat).
 *
 * OAuth2 (forms.body.readonly + forms.responses.readonly) OR a Workspace service account.
 *
 *   DISCOVER  → Forms has no native "list my forms" endpoint; the account's form ids are
 *               enumerated via the Drive API (mimeType application/vnd.google-apps.form).
 *   EXTRACT   → GET /v1/forms/{id}            (survey_def: items[]/questionItem/grids/sections)
 *              GET /v1/forms/{id}/responses  (response: paginated via pageToken, ≤5000/page)
 *   CDC       → forms.watches (Pub/Sub push); watches expire after 7 days → renewal cron.
 *
 * Responses key on `questionId` (build the question map from the form def first; answers live
 * in `answers[qid].textAnswers`; file uploads are Drive refs). Egress is locked to the two
 * Google API hosts (forms + drive); both go through guardedFetch.
 *
 * NOTE — cross-org access: a service account only reads forms it owns or that are shared with
 * it; bulk cross-org reads require **domain-wide delegation** (impersonate a Workspace user)
 * — the main operational hurdle. TODO(verify): DWD subject/impersonation plumbing, and whether
 * the Drive enumeration runs under the impersonated user.
 *
 * NOTE — logic: Google Forms exposes branching only on RADIO/SELECT choices
 * (goToAction/goToSectionId) — partial fidelity (catalog §3); the dry-run flags the gap.
 *
 * Legal posture: first_party_owned — customer owns the forms (security-compliance.md §4
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

const FORMS_HOST = 'forms.googleapis.com';
const DRIVE_HOST = 'www.googleapis.com';
const FORMS_BASE = `https://${FORMS_HOST}`;
const DRIVE_BASE = `https://${DRIVE_HOST}`;
const ALLOW_HOSTS = [FORMS_HOST, DRIVE_HOST];

/** forms.responses.list pageSize max is 5000; keep modest for steady pacing under the ~180/min cap. */
const RESPONSES_PAGE_SIZE = 1000;
/** Drive files.list page size when enumerating forms. */
const DRIVE_PAGE_SIZE = 100;

const meta: ConnectorMeta = {
  platform: 'googleforms',
  label: 'Google Forms',
  authKind: 'service_account', // also supports oauth2; declared primary is the SA (Workspace)
  capabilities: ['survey_def', 'response'],
  legalPosture: {
    basis: 'first_party_owned',
    mayStoreContent: true,
    mayProcessWithAI: true,
    attributionRequired: false,
    requiresLicenseFlag: false,
    notes:
      'Customer owns the forms; Survey/XM data is first-party by definition '
      + '(security-compliance.md §4). Full store + AI.',
  },
  // forms.responses.list is an "expensive read" → ~180/min/user binding (catalog [⚠ verify]).
  rateLimit: { perSecond: 3 },
  // forms.watches (Pub/Sub) deliver new responses by push; poll is the backstop. Watches
  // expire after 7 days → renewal cron (catalog).
  captureModes: { response: 'push' },
};

/**
 * Auth headers. The engine mints a short-lived access token from the service-account JSON (or
 * OAuth refresh token) in memory at call time and passes it on config — the .p8/SA key never
 * touches disk or logs (security-compliance.md §2.3). We read the token defensively off config.
 * TODO(verify): exact SA→access-token minting + domain-wide-delegation subject plumbing.
 */
function authHeader(conn: Connection): Record<string, string> {
  const token = typeof conn.config?.accessToken === 'string' ? conn.config.accessToken : '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(conn: Connection, base: string, host: string, path: string): Promise<T> {
  return helpers.withRetry(async () => {
    const res = await helpers.guardedFetch(
      `${base}${path}`,
      { method: 'GET', headers: { Accept: 'application/json', ...authHeader(conn) } },
      ALLOW_HOSTS,
    );
    if (!res.ok) {
      const err = new Error(`googleforms GET ${host}${path} → ${res.status}`) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  });
}

// ── Source response shapes (subset; per developers.google.com/forms/api) ──────
interface GfDriveFile {
  id: string;
  name?: string;
}
interface GfDriveList {
  files?: GfDriveFile[];
  nextPageToken?: string;
}
interface GfQuestionItem {
  question?: { questionId?: string; choiceQuestion?: { type?: string }; required?: boolean };
}
interface GfItem {
  itemId?: string;
  title?: string;
  questionItem?: GfQuestionItem;
  questionGroupItem?: { questions?: GfQuestionItem[] };
}
interface GfFormDef {
  formId?: string;
  info?: { title?: string };
  items?: GfItem[];
}
interface GfAnswer {
  questionId?: string;
  textAnswers?: { answers?: Array<{ value?: string }> };
}
interface GfResponse {
  responseId?: string;
  createTime?: string;
  lastSubmittedTime?: string;
  answers?: Record<string, GfAnswer>;
}
interface GfResponsesPage {
  responses?: GfResponse[];
  nextPageToken?: string;
}

export const googleformsConnector: PrismConnector = {
  meta,

  /**
   * CONNECT. Validates we have a service-account JSON (Workspace, optionally with DWD subject)
   * or an OAuth grant. The shared SA/oauth helper owns secret storage; we return the opaque
   * credential ref. TODO(verify) helper entrypoint + SM ref shape + DWD subject config.
   */
  async authenticate(input: AuthInput): Promise<CredentialRef> {
    if (input.authKind === 'service_account') {
      if (!input.serviceAccountJson) {
        throw new Error('googleforms connector: serviceAccountJson required');
      }
      // TODO(verify): store the SA JSON enveloped in Secret Manager and return its ref; the
      // worker mints a short-lived token in memory at call time (security-compliance.md §2.3).
      return input.serviceAccountJson;
    }
    if (input.authKind === 'oauth2') {
      if (!input.oauthCode && !input.apiKey) {
        throw new Error('googleforms connector: missing OAuth authorization code');
      }
      // TODO(verify): exchange via oauthFlow() (scopes forms.body.readonly +
      // forms.responses.readonly), store enveloped, return ref.
      return input.oauthCode ?? (input.apiKey as string);
    }
    throw new Error(`googleforms connector: unsupported authKind ${input.authKind}`);
  },

  /**
   * DISCOVER — Forms has no "list my forms" endpoint, so we enumerate form ids via the Drive
   * API (files of mimeType application/vnd.google-apps.form). Under domain-wide delegation the
   * Drive listing runs as the impersonated Workspace user. Each form → survey_def + response.
   */
  async *discover(conn: Connection): AsyncIterable<DiscoveredResource> {
    let pageToken: string | undefined;
    for (;;) {
      const params = new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.form' and trashed=false",
        pageSize: String(DRIVE_PAGE_SIZE),
        fields: 'files(id,name),nextPageToken',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const list = await getJson<GfDriveList>(
        conn,
        DRIVE_BASE,
        DRIVE_HOST,
        `/drive/v3/files?${params.toString()}`,
      );
      for (const f of list.files ?? []) {
        yield {
          resourceRef: { kind: 'survey_def', id: f.id },
          label: f.name || f.id,
          recordType: 'survey_def',
        };
        yield {
          resourceRef: { kind: 'response', id: f.id },
          label: `${f.name || f.id} — responses`,
          recordType: 'response',
        };
      }
      if (!list.nextPageToken) break;
      pageToken = list.nextPageToken;
    }
  },

  /**
   * EXTRACT. Dispatches by resource kind:
   *   survey_def → GET /v1/forms/{id}             (single record, items[])
   *   response   → GET /v1/forms/{id}/responses   (pageToken-paginated)
   *
   * For continuous sync the cursor carries a `filter: timestamp > N` so a poll fetches only
   * newer responses (ADR-022). Watches deliver pushes; poll is the reconciling backstop.
   */
  extract(
    conn: Connection,
    resource: ResourceRef,
    cursor?: Cursor,
  ): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
    if (resource.kind === 'survey_def') {
      return extractFormDef(conn, resource.id);
    }
    return extractResponses(conn, resource.id, cursor);
  },

  /**
   * PROFILE — describe the source schema. From a form def we read items[] keyed on questionId
   * (the stable mapping key); from responses we read the answered questionIds. The schema
   * mapper resolves question types from the def downstream.
   */
  profile(raw: RawRecord[]): SourceSchemaProfile {
    const defRec = raw.find((r) => r.record_type === 'survey_def');
    if (defRec && isFormDef(defRec.payload)) {
      const def = defRec.payload as GfFormDef;
      const fields: { name: string; type: string; label?: string }[] = [];
      for (const item of def.items ?? []) {
        const single = item.questionItem?.question;
        if (single?.questionId) {
          fields.push({
            name: single.questionId,
            type: single.choiceQuestion?.type ?? 'question',
            label: item.title,
          });
        }
        for (const sub of item.questionGroupItem?.questions ?? []) {
          if (sub.question?.questionId) {
            fields.push({
              name: sub.question.questionId,
              type: sub.question.choiceQuestion?.type ?? 'grid',
              label: item.title,
            });
          }
        }
      }
      return { fields, shapeHash: shapeHashOf(fields) };
    }

    const seen = new Map<string, true>();
    for (const rec of raw) {
      const r = rec.payload as GfResponse;
      for (const qid of Object.keys(r?.answers ?? {})) seen.set(qid, true);
    }
    const fields = [...seen.keys()].map((name) => ({ name, type: 'unknown' }));
    return { fields, shapeHash: shapeHashOf(fields) };
  },
};

// ── Extraction strategies (module-level; no `this`) ───────────────────────────

/** survey_def: GET /v1/forms/{id} → one verbatim survey_def record. */
async function* extractFormDef(
  conn: Connection,
  formId: string,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  const def = await getJson<GfFormDef>(
    conn,
    FORMS_BASE,
    FORMS_HOST,
    `/v1/forms/${encodeURIComponent(formId)}`,
  );
  yield {
    records: [
      helpers.toRawRecord({
        org_id: conn.orgId,
        job_id: '',
        connection_id: conn.id,
        source_platform: 'googleforms',
        record_type: 'survey_def',
        source_record_id: def.formId ?? formId,
        payload: def, // includes items[]/questionItem/grids/sections verbatim
        ingress: 'backfill',
        source_observed_at: null,
      }),
    ],
  };
}

/**
 * response: page over GET /v1/forms/{id}/responses via helpers.paginate. The API uses an
 * opaque pageToken; we carry it on the cursor. A `filter: timestamp > N` enables incremental
 * continuous-sync polls (only the first page sets the filter; the pageToken drives the rest).
 */
function extractResponses(
  conn: Connection,
  formId: string,
  cursor?: Cursor,
): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
  const sinceFilter = typeof cursor?.filter === 'string' ? (cursor.filter as string) : undefined;

  return helpers.paginate<GfResponse>({
    fetchPage: async (c?: Cursor) => {
      const pageToken = typeof c?.pageToken === 'string' ? (c.pageToken as string) : undefined;
      const params = new URLSearchParams({ pageSize: String(RESPONSES_PAGE_SIZE) });
      if (pageToken) params.set('pageToken', pageToken);
      // The incremental filter only applies on the first page of a continuous-sync poll.
      if (sinceFilter && !pageToken) params.set('filter', sinceFilter);
      const res = await getJson<GfResponsesPage>(
        conn,
        FORMS_BASE,
        FORMS_HOST,
        `/v1/forms/${encodeURIComponent(formId)}/responses?${params.toString()}`,
      );
      const items = res.responses ?? [];
      const nextCursor = res.nextPageToken ? ({ pageToken: res.nextPageToken } as Cursor) : undefined;
      return { items, nextCursor };
    },
    toRecords: (items: GfResponse[]): RawRecord[] =>
      items.map((r) =>
        helpers.toRawRecord({
          org_id: conn.orgId,
          job_id: '',
          connection_id: conn.id,
          source_platform: 'googleforms',
          record_type: 'response',
          source_record_id: r.responseId ?? '',
          payload: r, // verbatim; TRANSFORM keys answers on questionId
          ingress: cursor ? 'poll' : 'backfill',
          source_observed_at: r.lastSubmittedTime ?? r.createTime ?? null,
        }),
      ),
  });
}

// ── pure helpers ──────────────────────────────────────────────────────────────

function isFormDef(payload: unknown): payload is GfFormDef {
  return !!payload && typeof payload === 'object' && 'items' in (payload as object);
}

function shapeHashOf(fields: { name: string; type: string }[]): string {
  const canonical = fields
    .map((f) => `${f.name}:${f.type}`)
    .sort()
    .join('|');
  return sha256(canonical);
}

export default googleformsConnector;
