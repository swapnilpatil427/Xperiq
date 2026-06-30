/**
 * Prism connector — Google Play (catalog §4 Google Play; Wave W2 owned reviews).
 *
 * OWN apps only — first-party reviews for the customer's own Android apps via the Google Play
 * Developer API (`androidpublisher`). Auth is a Workspace/Cloud service account; a short-lived
 * access token is minted IN MEMORY from the envelope-encrypted SA JSON at call time
 * (security-compliance.md §2.3).
 *
 *   DISCOVER  → app packageNames are configured on the connection (the API has no list-apps
 *               endpoint); each configured package becomes a review resource.
 *   EXTRACT   → review: GET /androidpublisher/v3/applications/{pkg}/reviews (pageToken/token)
 *   CDC       → poll (token); the Reply-to-Reviews API has no review-create webhook.
 *
 * Reviews map to the Signal model (sourceType google_play_review) downstream. Egress is locked
 * to androidpublisher.googleapis.com.
 *
 * NOTE — history window: the Reviews API returns only the last **~7 days** AND **commented-only**
 * reviews (catalog §4 / security-compliance.md §4). For full history and rating-only reviews the
 * compliant path is the **GCS CSV export** Google writes to a Cloud Storage bucket; that export
 * is ingested via the file connector path (GCS object → parseFile). This connector only tails
 * the live ~7-day API window. TODO(verify): GCS export bucket/object plumbing + whether it
 * should be a first-class resource kind here vs the file connector.
 *
 * Legal posture: first_party_owned — own apps; Store ✅ / AI ✅ (security-compliance.md §4
 * ruling table). Full store + AI.
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

const API_HOST = 'androidpublisher.googleapis.com';
const API_BASE = `https://${API_HOST}`;
const ALLOW_HOSTS = [API_HOST];

/** reviews.list maxResults (API max 100). */
const PAGE_SIZE = 100;

const meta: ConnectorMeta = {
  platform: 'google_play',
  label: 'Google Play (own apps)',
  authKind: 'service_account',
  capabilities: ['review', 'continuous_sync'],
  legalPosture: {
    basis: 'first_party_owned',
    mayStoreContent: true,
    mayProcessWithAI: true,
    attributionRequired: false,
    requiresLicenseFlag: false,
    notes:
      'Own apps via the Play Developer API — first-party (security-compliance.md §4 ruling: '
      + 'Store ✅ / AI ✅). API ≈ last 7 days & commented-only → use the GCS CSV export '
      + '(file connector path) for full history/rating-only. Full store + AI.',
  },
  rateLimit: { perSecond: 1 },
  // No review webhook; poll (token) is the capture mode for the live ~7-day window.
  captureModes: { review: 'poll' },
};

/**
 * Auth header. The engine mints a short-lived access token from the envelope-decrypted SA JSON
 * IN MEMORY at call time and passes it on config — the SA key never touches disk or logs
 * (security-compliance.md §2.3). We read the token defensively off config.
 * TODO(verify): SA→access-token minting helper entrypoint.
 */
function authHeader(conn: Connection): Record<string, string> {
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
      const err = new Error(`google_play GET ${path} → ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  });
}

// ── Source response shapes (subset; per developers.google.com/android-publisher) ──
interface GpComment {
  userComment?: {
    text?: string;
    starRating?: number;
    lastModified?: { seconds?: string };
    reviewerLanguage?: string;
  };
}
interface GpReview {
  reviewId?: string;
  authorName?: string;
  comments?: GpComment[];
}
interface GpReviewsPage {
  reviews?: GpReview[];
  tokenPagination?: { nextPageToken?: string };
}

/** Configured app package names from connection config (the API has no list-apps endpoint). */
function packageNames(conn: Connection): string[] {
  const cfg = conn.config ?? {};
  const raw = cfg.packageNames ?? cfg.packageName;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw === 'string' && raw) return [raw];
  return [];
}

export const googlePlayConnector: PrismConnector = {
  meta,

  /**
   * CONNECT. Validates we have a service-account JSON (with the Play Console linked) and at
   * least one app packageName (in extra/config). The shared SA helper envelope-stores the SA
   * JSON; we return the opaque credential ref. TODO(verify) helper entrypoint + SM ref shape.
   */
  async authenticate(input: AuthInput): Promise<CredentialRef> {
    if (input.authKind !== 'service_account') {
      throw new Error('google_play connector: expected authKind service_account');
    }
    if (!input.serviceAccountJson) {
      throw new Error('google_play connector: serviceAccountJson required');
    }
    const pkgs = input.extra?.packageNames ?? input.extra?.packageName;
    if (!pkgs) {
      throw new Error('google_play connector: extra.packageNames (app id) is required');
    }
    // TODO(verify): store the SA JSON enveloped in Secret Manager and return its ref; the
    // worker mints a short-lived access token in memory at call time (§2.3).
    return input.serviceAccountJson;
  },

  /**
   * DISCOVER — the Play API has no list-apps endpoint; the customer's app package names are
   * configured on the connection. Each configured package becomes a review resource.
   */
  async *discover(conn: Connection): AsyncIterable<DiscoveredResource> {
    for (const pkg of packageNames(conn)) {
      yield {
        resourceRef: { kind: 'review', id: pkg },
        label: `${pkg} — reviews (last ~7 days)`,
        recordType: 'review',
      };
    }
  },

  /**
   * EXTRACT (review). Page over GET /androidpublisher/v3/applications/{pkg}/reviews via
   * helpers.paginate. The API returns only ~7 days of commented reviews; the token cursor
   * tails it for continuous sync (ADR-022). Full history rides the GCS export (file path).
   */
  extract(
    conn: Connection,
    resource: ResourceRef,
    cursor?: Cursor,
  ): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }> {
    const pkg = resource.id;

    return helpers.paginate<GpReview>({
      fetchPage: async (c?: Cursor) => {
        const token = typeof c?.token === 'string' ? (c.token as string) : undefined;
        const params = new URLSearchParams({ maxResults: String(PAGE_SIZE) });
        if (token) params.set('token', token);
        const page = await getJson<GpReviewsPage>(
          conn,
          `/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/reviews?${params.toString()}`,
        );
        const items = page.reviews ?? [];
        const next = page.tokenPagination?.nextPageToken;
        const nextCursor = next ? ({ token: next } as Cursor) : undefined;
        return { items, nextCursor };
      },
      toRecords: (items: GpReview[]): RawRecord[] =>
        items.map((r) =>
          helpers.toRawRecord({
            org_id: conn.orgId,
            job_id: '',
            connection_id: conn.id,
            source_platform: 'google_play',
            record_type: 'review',
            source_record_id: r.reviewId ?? '',
            payload: r, // verbatim (maps to Signal/google_play_review downstream)
            ingress: cursor ? 'poll' : 'backfill',
            source_observed_at: lastModifiedIso(r),
          }),
        ),
    });
  },

  /** PROFILE — reviews have a fixed shape; expose the canonical fields + stable shape hash. */
  profile(_raw: RawRecord[]): SourceSchemaProfile {
    const fields = [
      { name: 'userComment.starRating', type: 'rating' },
      { name: 'userComment.text', type: 'text' },
      { name: 'authorName', type: 'string' },
      { name: 'userComment.lastModified', type: 'datetime' },
    ];
    return { fields, shapeHash: shapeHashOf(fields) };
  },
};

// ── pure helpers ──────────────────────────────────────────────────────────────

/** Pull the latest userComment.lastModified (epoch seconds) → ISO string, else null. */
function lastModifiedIso(r: GpReview): string | null {
  const secs = r.comments?.[0]?.userComment?.lastModified?.seconds;
  if (typeof secs === 'string' && secs) {
    const n = Number(secs);
    if (!Number.isNaN(n)) return new Date(n * 1000).toISOString();
  }
  return null;
}

function shapeHashOf(fields: { name: string; type: string }[]): string {
  const canonical = fields
    .map((f) => `${f.name}:${f.type}`)
    .sort()
    .join('|');
  return sha256(canonical);
}

export default googlePlayConnector;
