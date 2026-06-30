/**
 * Prism connector — Google Business Profile (catalog §4 GBP; Wave W2 first-wow owned reviews).
 *
 * OWNED locations only — first-party reviews for the customer's own Google Business locations
 * via per-org OAuth `business.manage`. This is the only compliant pattern for review content
 * (security-compliance.md §4 "reviews are first-party-only").
 *
 *   DISCOVER  → GET /v1/accounts            (Account Management API)
 *              GET /v1/accounts/{acct}/locations
 *   EXTRACT   → review: GET /v4/accounts/{acct}/locations/{loc}/reviews (pageToken-paginated)
 *   CDC       → poll (pageToken / updateTime); no first-class push wired here.
 *
 * Reviews map to the Signal model (sourceType google_business_review) downstream. Egress is
 * locked to the two Google host families (account management + the v4 business API); both go
 * through guardedFetch.
 *
 * NOTE — access lead time: GBP API access needs Google approval, and the **default quota is 0
 * until granted** (days–weeks) (catalog §4 / security-compliance.md §4). The connector is
 * shippable but a new org cannot extract until quota is granted. TODO(verify): exact v4 review
 * host + whether the new Business Profile APIs split reviews onto a different host/version.
 *
 * Legal posture: first_party_owned — owned locations via OAuth business.manage; mayStore +
 * mayProcessWithAI both TRUE (security-compliance.md §4 ruling table). Attribution required
 * (render the Google source link/logo per Maps brand terms).
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

const ACCOUNT_HOST = 'mybusinessaccountmanagement.googleapis.com';
const REVIEW_HOST = 'mybusiness.googleapis.com';
const BUSINESS_INFO_HOST = 'mybusinessbusinessinformation.googleapis.com';
const ACCOUNT_BASE = `https://${ACCOUNT_HOST}`;
const REVIEW_BASE = `https://${REVIEW_HOST}`;
const BUSINESS_INFO_BASE = `https://${BUSINESS_INFO_HOST}`;
const ALLOW_HOSTS = [ACCOUNT_HOST, REVIEW_HOST, BUSINESS_INFO_HOST];

const PAGE_SIZE = 50;

const meta: ConnectorMeta = {
  platform: 'gbp',
  label: 'Google Business Profile (owned locations)',
  authKind: 'oauth2',
  capabilities: ['review', 'continuous_sync'],
  legalPosture: {
    basis: 'first_party_owned',
    mayStoreContent: true,
    mayProcessWithAI: true,
    attributionRequired: true,
    requiresLicenseFlag: false,
    notes:
      'Owned locations via OAuth business.manage — first-party (security-compliance.md §4 '
      + 'ruling: Store ✅ / AI ✅). Render Google source link/logo. Access needs Google '
      + 'approval; default quota 0 until granted.',
  },
  // Review read quota is approval-gated and conservative; serialize politely.
  rateLimit: { perSecond: 1 },
  // No first-class push; poll (pageToken / updateTime) is the capture mode.
  captureModes: { review: 'poll' },
};

/** Bearer token from connection config (OAuth business.manage). Engine resolves ref → token. */
function authHeader(conn: Connection): Record<string, string> {
  // TODO(verify): credential plumbing once oauthFlow()/SM resolver is wired (see typeform.ts).
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
      const err = new Error(`gbp GET ${host}${path} → ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  });
}

// ── Source response shapes (subset; per developers.google.com/my-business) ────
interface GbpAccount {
  name?: string; // "accounts/{accountId}"
  accountName?: string;
}
interface GbpAccountsList {
  accounts?: GbpAccount[];
  nextPageToken?: string;
}
interface GbpLocation {
  name?: string; // "locations/{locationId}" or "accounts/{a}/locations/{l}"
  title?: string;
}
interface GbpLocationsList {
  locations?: GbpLocation[];
  nextPageToken?: string;
}
interface GbpReview {
  reviewId?: string;
  name?: string;
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewer?: { displayName?: string };
}
interface GbpReviewsPage {
  reviews?: GbpReview[];
  nextPageToken?: string;
  totalReviewCount?: number;
}

export const gbpConnector: PrismConnector = {
  meta,

  /**
   * CONNECT. OAuth2 business.manage on the owner's account. The shared oauthFlow helper owns
   * the exchange/refresh/Secret Manager dance; we return the opaque credential ref.
   * TODO(verify) oauth helper entrypoint + SM ref shape + Google approval/quota gating.
   */
  async authenticate(input: AuthInput): Promise<CredentialRef> {
    if (input.authKind !== 'oauth2') {
      throw new Error('gbp connector: expected authKind oauth2 (business.manage)');
    }
    if (!input.oauthCode && !input.apiKey) {
      throw new Error('gbp connector: missing OAuth authorization code');
    }
    // TODO(verify): delegate to oauthFlow() to exchange the code and store the refresh token
    // enveloped in Secret Manager; until wired, surface the code as the placeholder ref.
    return input.oauthCode ?? (input.apiKey as string);
  },

  /**
   * DISCOVER — enumerate the owner's accounts then locations. Each location becomes a review
   * resource carrying the account+location ids needed to build the v4 reviews path.
   */
  async *discover(conn: Connection): AsyncIterable<DiscoveredResource> {
    let acctToken: string | undefined;
    for (;;) {
      const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
      if (acctToken) params.set('pageToken', acctToken);
      const accts = await getJson<GbpAccountsList>(
        conn,
        ACCOUNT_BASE,
        ACCOUNT_HOST,
        `/v1/accounts?${params.toString()}`,
      );
      for (const acct of accts.accounts ?? []) {
        const acctName = acct.name ?? '';
        // Locations live under the Business Information API.
        let locToken: string | undefined;
        for (;;) {
          const locParams = new URLSearchParams({
            pageSize: String(PAGE_SIZE),
            readMask: 'name,title',
          });
          if (locToken) locParams.set('pageToken', locToken);
          const locs = await getJson<GbpLocationsList>(
            conn,
            BUSINESS_INFO_BASE,
            BUSINESS_INFO_HOST,
            `/v1/${encodeURIComponent(acctName)}/locations?${locParams.toString()}`,
          );
          for (const loc of locs.locations ?? []) {
            const locName = loc.name ?? '';
            yield {
              resourceRef: {
                kind: 'review',
                id: locName,
                extra: { account: acctName, location: locName },
              },
              label: `${loc.title || locName} — reviews`,
              recordType: 'review',
            };
          }
          if (!locs.nextPageToken) break;
          locToken = locs.nextPageToken;
        }
      }
      if (!accts.nextPageToken) break;
      acctToken = accts.nextPageToken;
    }
  },

  /**
   * EXTRACT (review). Page over the v4 reviews endpoint via helpers.paginate. The cursor
   * carries the pageToken; for continuous sync the same extract tails the head (ADR-022).
   */
  extract(
    conn: Connection,
    resource: ResourceRef,
    cursor?: Cursor,
  ): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
    const account = String((resource.extra?.account ?? '') as string);
    const location = String((resource.extra?.location ?? resource.id) as string);
    // v4 review path: /v4/{account}/{location}/reviews where names are fully-qualified.
    // TODO(verify): exact v4 path composition for the current Business Profile review API.
    const reviewsPath = `/v4/${stripPrefixSlash(account)}/${stripPrefixSlash(location)}/reviews`;

    return helpers.paginate<GbpReview>({
      fetchPage: async (c?: Cursor) => {
        const pageToken = typeof c?.pageToken === 'string' ? (c.pageToken as string) : undefined;
        const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
        if (pageToken) params.set('pageToken', pageToken);
        const page = await getJson<GbpReviewsPage>(
          conn,
          REVIEW_BASE,
          REVIEW_HOST,
          `${reviewsPath}?${params.toString()}`,
        );
        const items = page.reviews ?? [];
        const nextCursor = page.nextPageToken ? ({ pageToken: page.nextPageToken } as Cursor) : undefined;
        return { items, nextCursor };
      },
      toRecords: (items: GbpReview[]): RawRecord[] =>
        items.map((r) =>
          helpers.toRawRecord({
            org_id: conn.orgId,
            job_id: '',
            connection_id: conn.id,
            source_platform: 'gbp',
            record_type: 'review',
            source_record_id: r.reviewId ?? r.name ?? '',
            payload: r, // verbatim review (maps to Signal/google_business_review downstream)
            ingress: cursor ? 'poll' : 'backfill',
            source_observed_at: r.updateTime ?? r.createTime ?? null,
          }),
        ),
    });
  },

  /**
   * PROFILE — reviews have a fixed shape; expose the canonical review fields so mapping-memory
   * keys on a stable shape hash (no per-survey schema for reviews).
   */
  profile(_raw: RawRecord[]): SourceSchemaProfile {
    const fields = [
      { name: 'starRating', type: 'rating' },
      { name: 'comment', type: 'text' },
      { name: 'createTime', type: 'datetime' },
      { name: 'reviewer.displayName', type: 'string' },
    ];
    return { fields, shapeHash: shapeHashOf(fields) };
  },
};

// ── pure helpers ──────────────────────────────────────────────────────────────

/** Drop a single leading slash so a name like "accounts/1" composes into a v4 path cleanly. */
function stripPrefixSlash(s: string): string {
  return s.startsWith('/') ? s.slice(1) : s;
}

function shapeHashOf(fields: { name: string; type: string }[]): string {
  const canonical = fields
    .map((f) => `${f.name}:${f.type}`)
    .sort()
    .join('|');
  return sha256(canonical);
}

export default gbpConnector;
