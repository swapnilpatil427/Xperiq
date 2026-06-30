/**
 * Prism connector registry.
 *
 * Maps a platform key → its PrismConnector instance, and exposes the list of connector metas
 * for the frontend "add a source" gallery. A connector is the ONLY thing written to add a
 * source; the engine (queues, idempotency, dry-run, reconcile, UI) is source-agnostic
 * (architecture-ingestion.md §7).
 *
 * To add a connector: implement PrismConnector in a sibling file and register it here.
 *
 * Two kinds of gallery entry:
 *   1. STORING connectors — registered in REGISTRY; have a full extract impl; the engine may
 *      store/AI-process per their legalPosture.
 *   2. DISPLAY-ONLY / EXCLUDED metas — `displayOnlyMetas` (Google Places, Yelp, TripAdvisor =
 *      display_only; Glassdoor, Amazon = no_compliant_path). NO extract impl: they appear in
 *      the gallery (greyed / "display-only") but are NOT in REGISTRY, so getConnector() throws
 *      if a job ever targets one — the engine refuses to store a source it may not store. Their
 *      metas are appended to listConnectorMetas() so the FE can render + explain them.
 */
import type { PrismConnector, ConnectorMeta } from '../../../types/prism';
import { fileConnector } from './file';
import { typeformConnector } from './typeform';
import { qualtricsConnector } from './qualtrics';
import { surveymonkeyConnector } from './surveymonkey';
import { googleformsConnector } from './googleforms';
import { gbpConnector } from './gbp';
import { appleAscConnector } from './apple_asc';
import { googlePlayConnector } from './google_play';
import { trustpilotConnector } from './trustpilot';
import { displayOnlyMetas } from './displayOnlyMetas';

/**
 * platform key → connector instance. The key normally matches `connector.meta.platform`,
 * EXCEPT the file connector, which is aliased under every file-import tile key the FE may
 * send. The single `fileConnector` instance is format-agnostic (it parses per
 * `resource.extra.format`), so `getConnector('spss'|'qsf'|'json'|'csv'|'file_auto'|'file')`
 * all resolve to it. The actual format/platform is carried on the job's ResourceRef, not on
 * the connector identity.
 */
const REGISTRY: Record<string, PrismConnector> = {
  // File-import tiles — all resolve to the one format-agnostic file connector.
  [fileConnector.meta.platform]: fileConnector, // 'file'
  file_auto: fileConnector,
  csv: fileConnector,
  spss: fileConnector,
  json: fileConnector,
  qsf: fileConnector,
  [typeformConnector.meta.platform]: typeformConnector,
  [qualtricsConnector.meta.platform]: qualtricsConnector,
  // Wave W2 — high-volume self-serve surveys
  [surveymonkeyConnector.meta.platform]: surveymonkeyConnector,
  [googleformsConnector.meta.platform]: googleformsConnector,
  // Wave W2/W3 — owned-property reviews (first-party; map to the Signal model downstream)
  [gbpConnector.meta.platform]: gbpConnector,
  [appleAscConnector.meta.platform]: appleAscConnector,
  [googlePlayConnector.meta.platform]: googlePlayConnector,
  [trustpilotConnector.meta.platform]: trustpilotConnector,
};

/**
 * Resolve a connector by platform key. Throws on an unknown platform so a bad
 * `prism_connections.platform` never silently no-ops a job. Display-only/excluded sources are
 * intentionally NOT in REGISTRY → this throws for them (the engine may not store them).
 */
export function getConnector(platform: string): PrismConnector {
  const connector = REGISTRY[platform];
  if (!connector) {
    throw new Error(`prism: no connector registered for platform '${platform}'`);
  }
  return connector;
}

/** True if a connector exists for the platform (for validation before a 404/400). */
export function hasConnector(platform: string): boolean {
  return platform in REGISTRY;
}

/** Every registered (storing) platform key. */
export function listPlatforms(): string[] {
  return Object.keys(REGISTRY);
}

/**
 * The connector metas — the source of truth for the frontend source gallery (label, auth
 * kind, capabilities, legal posture, rate limits, capture modes). Non-secret, safe to
 * serialize to the client.
 *
 * Returns the STORING connectors (REGISTRY) followed by the DISPLAY-ONLY / EXCLUDED metas so
 * the FE can render every source. Display-only/excluded entries have no extract impl; the FE
 * greys them and the engine refuses to store them per their legalPosture.
 */
export function listConnectorMetas(): ConnectorMeta[] {
  // De-dupe by connector instance: the file connector is aliased under several keys
  // (file/file_auto/csv/spss/json/qsf) but is a single source → one gallery meta.
  const seen = new Set<PrismConnector>();
  const storingMetas: ConnectorMeta[] = [];
  for (const c of Object.values(REGISTRY)) {
    if (seen.has(c)) continue;
    seen.add(c);
    storingMetas.push(c.meta);
  }
  return [...storingMetas, ...displayOnlyMetas];
}

/**
 * Materialized connector-meta list (the alias the engine/API expect). Equivalent to calling
 * listConnectorMetas() — provided as a constant for direct import.
 */
export const connectorMetas: ConnectorMeta[] = listConnectorMetas();

export {
  fileConnector,
  typeformConnector,
  qualtricsConnector,
  surveymonkeyConnector,
  googleformsConnector,
  gbpConnector,
  appleAscConnector,
  googlePlayConnector,
  trustpilotConnector,
  displayOnlyMetas,
};
