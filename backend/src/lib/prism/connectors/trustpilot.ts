/**
 * Prism connector — Trustpilot (catalog §4 Trustpilot; Wave W3 owned reviews).
 *
 * OWN profile only — first-party reviews for the customer's own Trustpilot business unit via
 * per-org OAuth. This is the only compliant pattern (security-compliance.md §4 "reviews are
 * first-party-only").
 *
 *   DISCOVER  → GET /v1/private/business-units   (the account's owned business units)
 *   EXTRACT   → review: GET /v1/private/business-units/{id}/reviews (page-paginated)
 *   CDC       → poll (page cursor); no first-class push wired here.
 *
 * Reviews map to the Signal model (sourceType trustpilot_review) downstream. Egress is locked
 * to api.trustpilot.com.
 *
 * ⚠ AI USE: for an OWNED profile, storage is permitted, but AI processing is allowed **only
 * under the org's Trustpilot data licence** (security-compliance.md §4 ruling: Store ✅ /
 * AI ⚠ license). We therefore set `mayProcessWithAI: false` + `requiresLicenseFlag: true` so
 * the engine refuses to send content to CrystalOS until the org attests a data licence on the
 * connection (security-compliance.md §4 operating rule 2). Once attested, the engine may flip
 * the AI gate per the recorded licence — gating stays in the engine, not silently here.
 *
 * Legal posture: first_party_owned (owned profile); Store ✅ / AI ⚠ under data licence.
 * Attribution required (render the Trustpilot source link/logo).
 *
 * TODO(verify): exact private API host/paths, the API key header (Trustpilot business API
 * commonly takes `apikey` alongside the OAuth bearer), and the reviews pagination shape.
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

const API_HOST = 'api.trustpilot.com';
const API_BASE = `https://${API_HOST}`;
const ALLOW_HOSTS = [API_HOST];

/** reviews page size (Trustpilot perPage max 100). */
const PAGE_SIZE = 100;

const meta: ConnectorMeta = {
  platform: 'trustpilot',
  label: 'Trustpilot (own profile)',
  authKind: 'oauth2',
  capabilities: ['review', 'continuous_sync'],
  legalPosture: {
    basis: 'first_party_owned',
    mayStoreContent: true,
    // AI is gated behind the org's data licence (security-compliance.md §4 ruling: AI ⚠
    // license). Default OFF; the engine flips it once a licence is attested.
    mayProcessWithAI: false,
    attributionRequired: true,
    requiresLicenseFlag: true,
    notes:
      'Owned profile via OAuth — first-party for storage (security-compliance.md §4 ruling: '
      + 'Store ✅). AI/Crystal ⚠ ALLOWED ONLY under the org\'s Trustpilot data licence → '
      + 'mayProcessWithAI default false + requiresLicenseFlag true; engine enables AI only '
      + 'after the licence is attested. Render the Trustpilot source link/logo.',
  },
  rateLimit: { perSecond: 1 },
  // No first-class push; poll (page cursor) is the capture mode.
  captureModes: { review: 'poll' },
};

/**
 * Auth headers. OAuth bearer (resolved by the engine from credential_ref) plus the API key
 * (the Trustpilot business API keys requests by `apikey`). We read both defensively off config.
 * TODO(verify): exact header names + whether the key is `apikey` header or query param.
 */
function authHeaders(conn: Connection): Record<string, string> {
  const headers: Record<string, string> = {};
  const bearer = typeof conn.config?.accessToken === 'string' ? conn.config.accessToken : '';
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const apiKey = typeof conn.config?.apiKey === 'string' ? conn.config.apiKey : '';
  if (apiKey) headers.apikey = apiKey;
  return headers;
}

async function getJson<T>(conn: Connection, path: string): Promise<T> {
  return helpers.withRetry(async () => {
    const res = await helpers.guardedFetch(
      `${API_BASE}${path}`,
      { method: 'GET', headers: { Accept: 'application/json', ...authHeaders(conn) } },
      ALLOW_HOSTS,
    );
    if (!res.ok) {
      const err = new Error(`trustpilot GET ${path} → ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  });
}

// ── Source response shapes (subset; per developers.trustpilot.com) ────────────
interface TpBusinessUnit {
  id: string;
  displayName?: string;
  name?: { identifying?: string };
}
interface TpBusinessUnitsList {
  businessUnits?: TpBusinessUnit[];
}
interface TpReview {
  id?: string;
  stars?: number;
  title?: string;
  text?: string;
  createdAt?: string;
  updatedAt?: string;
  consumer?: { displayName?: string };
}
interface TpReviewsPage {
  reviews?: TpReview[];
  links?: Array<{ rel?: string; href?: string }>;
}

export const trustpilotConnector: PrismConnector = {
  meta,

  /**
   * CONNECT. OAuth2 on the owner's account. The shared oauthFlow helper owns the
   * exchange/refresh/Secret Manager dance; we return the opaque credential ref.
   * TODO(verify) oauth helper entrypoint + SM ref shape + apikey storage.
   */
  async authenticate(input: AuthInput): Promise<CredentialRef> {
    if (input.authKind !== 'oauth2') {
      throw new Error('trustpilot connector: expected authKind oauth2');
    }
    if (!input.oauthCode && !input.apiKey) {
      throw new Error('trustpilot connector: missing OAuth authorization code');
    }
    // TODO(verify): delegate to oauthFlow() to exchange the code and store the refresh token
    // (+ apikey) enveloped in Secret Manager; until wired, surface the code as the ref.
    return input.oauthCode ?? (input.apiKey as string);
  },

  /**
   * DISCOVER — enumerate the owner's business units (GET /v1/private/business-units). Each
   * owned business unit becomes a review resource carrying its id.
   */
  async *discover(conn: Connection): AsyncIterable<DiscoveredResource> {
    const list = await getJson<TpBusinessUnitsList>(conn, '/v1/private/business-units');
    for (const bu of list.businessUnits ?? []) {
      yield {
        resourceRef: { kind: 'review', id: bu.id },
        label: `${bu.displayName || bu.name?.identifying || bu.id} — reviews`,
        recordType: 'review',
      };
    }
  },

  /**
   * EXTRACT (review). Page over GET /v1/private/business-units/{id}/reviews via
   * helpers.paginate. The cursor carries the page number; for continuous sync the same extract
   * tails the head (ADR-022). Content is stored, but the engine withholds it from CrystalOS
   * until a data licence is attested (see meta.legalPosture).
   */
  extract(
    conn: Connection,
    resource: ResourceRef,
    cursor?: Cursor,
  ): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
    const buId = resource.id;

    return helpers.paginate<TpReview>({
      fetchPage: async (c?: Cursor) => {
        const page = typeof c?.page === 'number' ? (c.page as number) : 1;
        const params = new URLSearchParams({
          perPage: String(PAGE_SIZE),
          page: String(page),
          orderBy: 'createdat.desc',
        });
        const res = await getJson<TpReviewsPage>(
          conn,
          `/v1/private/business-units/${encodeURIComponent(buId)}/reviews?${params.toString()}`,
        );
        const items = res.reviews ?? [];
        const hasNext = (res.links ?? []).some((l) => l.rel === 'next-page');
        const nextCursor =
          items.length === PAGE_SIZE && hasNext ? ({ page: page + 1 } as Cursor) : undefined;
        return { items, nextCursor };
      },
      toRecords: (items: TpReview[]): RawRecord[] =>
        items.map((r) =>
          helpers.toRawRecord({
            org_id: conn.orgId,
            job_id: '',
            connection_id: conn.id,
            source_platform: 'trustpilot',
            record_type: 'review',
            source_record_id: r.id ?? '',
            payload: r, // verbatim (maps to Signal/trustpilot_review downstream)
            ingress: cursor ? 'poll' : 'backfill',
            source_observed_at: r.updatedAt ?? r.createdAt ?? null,
          }),
        ),
    });
  },

  /** PROFILE — reviews have a fixed shape; expose the canonical fields + stable shape hash. */
  profile(_raw: RawRecord[]): SourceSchemaProfile {
    const fields = [
      { name: 'stars', type: 'rating' },
      { name: 'title', type: 'text' },
      { name: 'text', type: 'text' },
      { name: 'consumer.displayName', type: 'string' },
      { name: 'createdAt', type: 'datetime' },
    ];
    return { fields, shapeHash: shapeHashOf(fields) };
  },
};

// ── pure helpers ──────────────────────────────────────────────────────────────

function shapeHashOf(fields: { name: string; type: string }[]): string {
  const canonical = fields
    .map((f) => `${f.name}:${f.type}`)
    .sort()
    .join('|');
  return sha256(canonical);
}

export default trustpilotConnector;
