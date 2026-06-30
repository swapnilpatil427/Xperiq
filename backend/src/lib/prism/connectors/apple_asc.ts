/**
 * Prism connector — Apple App Store Connect (catalog §4 Apple App Store; Wave W2 owned reviews).
 *
 * OWN apps only — first-party customer reviews for the customer's own apps via the App Store
 * Connect API. Auth is a service-account-style JWT: a short-lived ES256 token signed with the
 * customer's `.p8` private key (+ keyId + issuerId). The `.p8` is envelope-encrypted; the JWT
 * is minted IN MEMORY at call time and never persisted/logged (security-compliance.md §2.3).
 *
 *   DISCOVER  → GET /v1/apps                                   (the account's apps)
 *   EXTRACT   → review: GET /v1/apps/{id}/customerReviews      (cursor-paginated; ?include=…)
 *   CDC       → poll (cursor); ASC has no review webhook.
 *
 * The official `customerReviews` endpoint is authoritative (the public RSS feed is sampling
 * only — not used here). Reviews map to the Signal model (sourceType apple_app_store_review)
 * downstream. Egress is locked to api.appstoreconnect.apple.com.
 *
 * Legal posture: first_party_owned — own apps via the ASC API; Store ✅ / AI ✅
 * (security-compliance.md §4 ruling table). Attribution not required (own content).
 *
 * TODO(verify): exact ES256 JWT claims (aud "appstoreconnect-v1", iss=issuerId, 20-min exp,
 * kid=keyId) and the customerReviews query params (?limit, ?sort, ?filter[territory]).
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

const API_HOST = 'api.appstoreconnect.apple.com';
const API_BASE = `https://${API_HOST}`;
const ALLOW_HOSTS = [API_HOST];

/** customerReviews page limit (ASC max 200); keep modest under the ~3,600/hr budget. */
const PAGE_LIMIT = 200;

const meta: ConnectorMeta = {
  platform: 'apple_asc',
  label: 'Apple App Store Connect (own apps)',
  authKind: 'service_account', // .p8 private key → short-lived ES256 JWT minted per call
  capabilities: ['review', 'continuous_sync'],
  legalPosture: {
    basis: 'first_party_owned',
    mayStoreContent: true,
    mayProcessWithAI: true,
    attributionRequired: false,
    requiresLicenseFlag: false,
    notes:
      'Own apps via the App Store Connect API — first-party (security-compliance.md §4 '
      + 'ruling: Store ✅ / AI ✅). RSS feed is sampling only; the customerReviews endpoint is '
      + 'authoritative. Full store + AI.',
  },
  // ~3,600/hr (catalog [⚠ verify]) → ~1/sec sustained keeps us well inside budget.
  rateLimit: { perSecond: 1 },
  // No webhook on ASC reviews; poll (cursor) is the capture mode.
  captureModes: { review: 'poll' },
};

/**
 * Auth header. The engine mints a short-lived ES256 JWT from the envelope-decrypted `.p8`
 * (keyId/issuerId) IN MEMORY and passes it on config — the `.p8` never touches disk or logs
 * (security-compliance.md §2.3). We read the minted bearer defensively off config.
 * TODO(verify): JWT minting helper entrypoint + claim set.
 */
function authHeader(conn: Connection): Record<string, string> {
  const token = typeof conn.config?.ascJwt === 'string' ? conn.config.ascJwt : '';
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
      const err = new Error(`apple_asc GET ${path} → ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  });
}

// ── Source response shapes (subset; per developer.apple.com/documentation/appstoreconnectapi) ──
interface AscApp {
  id: string;
  attributes?: { name?: string; bundleId?: string };
}
interface AscAppsList {
  data?: AscApp[];
  links?: { next?: string };
}
interface AscReview {
  id: string;
  attributes?: {
    rating?: number;
    title?: string;
    body?: string;
    reviewerNickname?: string;
    createdDate?: string;
    territory?: string;
  };
}
interface AscReviewsPage {
  data?: AscReview[];
  links?: { next?: string };
}

export const appleAscConnector: PrismConnector = {
  meta,

  /**
   * CONNECT. Validates we have the `.p8` private key plus keyId + issuerId (carried in extra).
   * The shared SA helper envelope-stores the `.p8` in Secret Manager; we return the opaque
   * credential ref. TODO(verify) helper entrypoint + SM ref shape + keyId/issuerId config.
   */
  async authenticate(input: AuthInput): Promise<CredentialRef> {
    if (input.authKind !== 'service_account') {
      throw new Error('apple_asc connector: expected authKind service_account (.p8 key)');
    }
    const p8 = input.serviceAccountJson; // the .p8 PEM body travels in serviceAccountJson
    const keyId = typeof input.extra?.keyId === 'string' ? input.extra.keyId : '';
    const issuerId = typeof input.extra?.issuerId === 'string' ? input.extra.issuerId : '';
    if (!p8 || !keyId || !issuerId) {
      throw new Error('apple_asc connector: .p8 key, extra.keyId and extra.issuerId are required');
    }
    // TODO(verify): store the .p8 (+ keyId/issuerId metadata) enveloped in Secret Manager and
    // return its ref; the worker mints the ES256 JWT in memory at call time (§2.3).
    return p8;
  },

  /**
   * DISCOVER — enumerate the account's apps (GET /v1/apps, link-paginated). Each app becomes a
   * review resource carrying its id for the customerReviews path.
   */
  async *discover(conn: Connection): AsyncIterable<DiscoveredResource> {
    let path: string | undefined = `/v1/apps?limit=${PAGE_LIMIT}`;
    while (path) {
      const list: AscAppsList = await getJson<AscAppsList>(conn, path);
      for (const app of list.data ?? []) {
        yield {
          resourceRef: { kind: 'review', id: app.id },
          label: `${app.attributes?.name || app.id} — reviews`,
          recordType: 'review',
        };
      }
      path = pathFromNext(list.links?.next);
    }
  },

  /**
   * EXTRACT (review). Page over GET /v1/apps/{id}/customerReviews via helpers.paginate. ASC
   * uses an opaque `links.next` cursor; we carry the resolved path on the cursor. For
   * continuous sync the same extract tails the head (ADR-022).
   */
  extract(
    conn: Connection,
    resource: ResourceRef,
    cursor?: Cursor,
  ): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
    const appId = resource.id;
    const firstPath = `/v1/apps/${encodeURIComponent(appId)}/customerReviews?limit=${PAGE_LIMIT}&sort=-createdDate`;

    return helpers.paginate<AscReview>({
      fetchPage: async (c?: Cursor) => {
        const path = typeof c?.path === 'string' ? (c.path as string) : firstPath;
        const page = await getJson<AscReviewsPage>(conn, path);
        const items = page.data ?? [];
        const next = pathFromNext(page.links?.next);
        const nextCursor = next ? ({ path: next } as Cursor) : undefined;
        return { items, nextCursor };
      },
      toRecords: (items: AscReview[]): RawRecord[] =>
        items.map((r) =>
          helpers.toRawRecord({
            org_id: conn.orgId,
            job_id: '',
            connection_id: conn.id,
            source_platform: 'apple_asc',
            record_type: 'review',
            source_record_id: r.id,
            payload: r, // verbatim (maps to Signal/apple_app_store_review downstream)
            ingress: cursor ? 'poll' : 'backfill',
            source_observed_at: r.attributes?.createdDate ?? null,
          }),
        ),
    });
  },

  /** PROFILE — reviews have a fixed shape; expose the canonical fields + stable shape hash. */
  profile(_raw: RawRecord[]): SourceSchemaProfile {
    const fields = [
      { name: 'rating', type: 'rating' },
      { name: 'title', type: 'text' },
      { name: 'body', type: 'text' },
      { name: 'reviewerNickname', type: 'string' },
      { name: 'createdDate', type: 'datetime' },
    ];
    return { fields, shapeHash: shapeHashOf(fields) };
  },
};

// ── pure helpers ──────────────────────────────────────────────────────────────

/**
 * ASC `links.next` is a full absolute URL. We reuse only its path+query (guardedFetch
 * re-validates the host allowlist); never fetch an arbitrary URL.
 */
function pathFromNext(next?: string): string | undefined {
  if (!next) return undefined;
  try {
    const u = new URL(next, `https://${API_HOST}`);
    return `${u.pathname}${u.search}`;
  } catch {
    return undefined;
  }
}

function shapeHashOf(fields: { name: string; type: string }[]): string {
  const canonical = fields
    .map((f) => `${f.name}:${f.type}`)
    .sort()
    .join('|');
  return sha256(canonical);
}

export default appleAscConnector;
