/**
 * Prism — display-only & excluded source METAS (no extract impl).
 *
 * These sources appear in the frontend "add a source" gallery so customers see them, but they
 * have **NO connector implementation**: the engine refuses to store/AI-process them per their
 * `legalPosture`. They exist as meta-only entries (greyed / "display-only" in the FE).
 *
 * Two families (verdicts copied EXACTLY from security-compliance.md §4 ruling table):
 *
 *   display_only  (Store ❌ / AI ❌ — live widget: store join key only, fetch at render,
 *                  attribute, never persist):
 *     • Google Places  — Maps terms ban caching review content (Place ID only; TTL 0)
 *     • Yelp Fusion    — explicit GenAI ban; ≤3 truncated excerpts; 24h cache cap
 *     • TripAdvisor    — caching banned (location_id only)
 *
 *   no_compliant_path (Store ❌ / AI ❌ — excluded; surfaced so the FE explains *why* it's
 *                  unavailable rather than leaving a confusing gap):
 *     • Glassdoor      — API enterprise-only/closed; never scrape
 *     • Amazon reviews — no reviews API; ToS bans scraping
 *
 * Because there is no `PrismConnector` for these, `getConnector()` will (correctly) throw if a
 * job is ever created against one — the engine cannot extract a source it may not store. They
 * are NOT added to REGISTRY; only their metas are appended to `listConnectorMetas()`.
 */
import type { ConnectorMeta } from '../../../types/prism';

export const displayOnlyMetas: ConnectorMeta[] = [
  {
    platform: 'google_places',
    label: 'Google Places (display-only)',
    authKind: 'api_key',
    capabilities: ['review'],
    legalPosture: {
      basis: 'display_only',
      mayStoreContent: false,
      mayProcessWithAI: false,
      attributionRequired: true,
      cacheTtlHours: 0, // Place ID only — caching review content banned
      requiresLicenseFlag: false,
      notes:
        'Live display only; Maps terms ban caching review content (security-compliance.md §4 '
        + 'ruling: Store ❌ (Place ID) / AI ❌). Store join key (Place ID), fetch at render, '
        + 'attribute, never persist. No extract impl.',
    },
  },
  {
    platform: 'yelp',
    label: 'Yelp (display-only)',
    authKind: 'api_key',
    capabilities: ['review'],
    legalPosture: {
      basis: 'display_only',
      mayStoreContent: false,
      mayProcessWithAI: false,
      attributionRequired: true,
      cacheTtlHours: 24, // ≤3 truncated excerpts; 24h cache cap
      requiresLicenseFlag: false,
      notes:
        'Live widget only; explicit GenAI ban → no Crystal unless licensed '
        + '(security-compliance.md §4 ruling: Store ❌ (24h cap) / AI ❌). ≤3 truncated '
        + 'excerpts; 500 calls/day. No extract impl.',
    },
  },
  {
    platform: 'tripadvisor',
    label: 'TripAdvisor (display-only)',
    authKind: 'api_key',
    capabilities: ['review'],
    legalPosture: {
      basis: 'display_only',
      mayStoreContent: false,
      mayProcessWithAI: false,
      attributionRequired: true,
      cacheTtlHours: 0, // location_id only — caching banned
      requiresLicenseFlag: false,
      notes:
        'Live display only; caching banned (security-compliance.md §4 ruling: Store ❌ '
        + '(location_id) / AI ❌). ≤5 snippets; store location_id only, never persist. '
        + 'No extract impl.',
    },
  },
  {
    platform: 'glassdoor',
    label: 'Glassdoor (unavailable — no compliant path)',
    authKind: 'api_key',
    capabilities: ['review'],
    legalPosture: {
      basis: 'no_compliant_path',
      mayStoreContent: false,
      mayProcessWithAI: false,
      attributionRequired: false,
      requiresLicenseFlag: false,
      notes:
        'Excluded — API enterprise-only/closed; never scrape (security-compliance.md §4 '
        + 'ruling: Store ❌ / AI ❌). Surfaced only to explain unavailability. No extract impl.',
    },
  },
  {
    platform: 'amazon_reviews',
    label: 'Amazon reviews (unavailable — no compliant path)',
    authKind: 'api_key',
    capabilities: ['review'],
    legalPosture: {
      basis: 'no_compliant_path',
      mayStoreContent: false,
      mayProcessWithAI: false,
      attributionRequired: false,
      requiresLicenseFlag: false,
      notes:
        'Excluded — no reviews API; ToS bans scraping (security-compliance.md §4 ruling: '
        + 'Store ❌ / AI ❌). Surfaced only to explain unavailability. No extract impl.',
    },
  },
];

export default displayOnlyMetas;
