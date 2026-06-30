/**
 * Prism — shared type contract (single source of truth).
 *
 * Every Prism layer (engine, connectors, API, and the frontend mirror at
 * app/src/types/prism.ts) codes against THESE types. Field names match the
 * Postgres migrations in supabase/migrations/20260629120000_prism_core_ingestion.sql
 * (+ _sync_and_identity, _bitemporal_unified_feedback).
 *
 * Design references: docs/otherplatforms/migration/architecture-ingestion.md,
 * security-compliance.md, architecture-review.md.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums / unions
// ─────────────────────────────────────────────────────────────────────────────

/** Operating mode per connection (the spectrum). */
export type PrismMode = 'augment' | 'ingest' | 'migrate';

/** Pipeline stages (the spine). */
export type PrismStage =
  | 'connect' | 'discover' | 'extract' | 'profile' | 'map'
  | 'transform' | 'dryrun' | 'load' | 'reconcile' | 'enrich' | 'publish';

/** Job lifecycle. */
export type PrismJobStatus =
  | 'queued' | 'running' | 'awaiting_input' | 'paused'
  | 'complete' | 'partial' | 'failed';

export type PrismJobKind = 'migration' | 'sync' | 'backfill';

export type PrismAuthKind = 'oauth2' | 'api_key' | 'service_account' | 'file_upload';

export type PrismConnectionStatus =
  | 'active' | 'paused' | 'error' | 'disconnected' | 'pending_auth';

/** How a connector captures NEW data for continuous sync (CDC). */
export type CaptureMode = 'push' | 'poll' | 'push_verified';

/** Legal basis gating whether content may be stored / AI-processed. */
export type LegalPostureBasis =
  | 'first_party_owned' | 'public_api_licensed' | 'display_only' | 'no_compliant_path';

/** How a raw record arrived. */
export type IngressKind = 'backfill' | 'poll' | 'webhook' | 'file';

export type RecordType =
  | 'survey_def' | 'response' | 'contact' | 'distribution' | 'review' | 'signal' | 'topic';

// ─────────────────────────────────────────────────────────────────────────────
// Entities (rows)
// ─────────────────────────────────────────────────────────────────────────────

export interface PrismConnection {
  id: string;
  org_id: string;
  platform: string;                 // 'qualtrics' | 'typeform' | 'csv' | ...
  label: string;
  auth_kind: PrismAuthKind;
  status: PrismConnectionStatus;
  credential_ref: string | null;    // Secret Manager ref — NEVER the secret
  mode: PrismMode;
  history_window: number;           // 1..12 months; new data always checkpointed regardless
  config: Record<string, unknown>;
  stats: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PrismJob {
  id: string;
  org_id: string;
  connection_id: string;
  kind: PrismJobKind;
  stage: PrismStage;
  status: PrismJobStatus;
  cursor: Record<string, unknown> | null;
  counts: PrismCounts;
  error: { stage: PrismStage; message: string; retryable: boolean } | null;
  triggered_by: 'user' | 'schedule' | 'webhook';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PrismCounts {
  discovered?: number;
  extracted?: number;
  transformed?: number;
  loaded?: number;
  skipped?: number;
  failed?: number;
  poison?: number;
}

export interface RawRecord {
  id?: string;
  org_id: string;
  job_id: string;
  connection_id: string;
  source_platform: string;
  record_type: RecordType;
  source_record_id: string;
  payload: unknown;                 // verbatim source record
  payload_hash: string;             // sha256(payload)
  ingress: IngressKind;
  poison?: boolean;
  source_observed_at: string | null; // source's own modified/created time (monotonicity guard)
  extracted_at?: string;
}

export interface PrismMapping {
  id?: string;
  org_id: string;
  connection_id: string;
  schema_shape_hash: string;        // sha256 of ordered field types/labels
  mapping_version: number;
  mappings: FieldMapping[];
  created_at?: string;
}

export interface FieldMapping {
  source_field: string;
  source_type?: string;
  target: string;                   // Xperiq QuestionType / 'embedded_data' / 'preserve'
  metric?: 'nps' | 'csat' | 'ces' | null;
  value_rules?: ValueRule[];
  confidence: number;               // 0..1
  origin: 'deterministic' | 'template' | 'llm';
  rationale?: string;
}

export interface ValueRule {
  kind: 'rescale' | 'map' | 'verbatim';
  in_min?: number; in_max?: number; out_min?: number; out_max?: number;
  map?: Record<string, string>;
}

// ── Dry-run + reconciliation reports ────────────────────────────────────────

export interface DryRunReport {
  summary: { create: number; update: number; skip_duplicate: number; conflict: number };
  metric_parity: ParityEntry[];
  unmapped_fields: { source_field: string; action: string }[];
  timestamp_continuity: { earliest: string; latest: string; gaps: string[] };
  conflicts: { source_record_id: string; reason: string }[];
}

/** Two-tier parity (ADR-019): Tier-1 data fidelity guaranteed; Tier-2 metric best-effort + explainer. */
export interface ParityEntry {
  metric: 'nps' | 'csat' | 'ces' | string;
  source_value: number | null;     // source-reported (may be unknown)
  prism_computed: number | null;
  match: boolean;
  delta?: number;
  explanation?: string;             // parity explainer's most-likely cause
  method?: 'match_source' | 'prism';
}

export interface ReconReport {
  tier1_pass: boolean;
  counts: { source: number; prism: number; match: boolean };
  checksum: { source: string; prism: string; match: boolean };
  metric_parity: ParityEntry[];
  generated_at: string;
}

// ── Continuous sync (CDC) state ─────────────────────────────────────────────

export interface PrismSyncState {
  connection_id: string;
  record_type: RecordType;
  org_id: string;
  capture_mode: CaptureMode;
  cursor: Record<string, unknown> | null;
  last_event_at: string | null;
  last_synced_at: string | null;
  lag_seconds: number | null;
  freshness_slo_s: number;
  poll_cadence_s: number;
  consecutive_fail: number;
  webhook_secret_ref: string | null;
  paused: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector SDK contract
// ─────────────────────────────────────────────────────────────────────────────

export interface LegalPosture {
  basis: LegalPostureBasis;
  mayStoreContent: boolean;
  mayProcessWithAI: boolean;
  attributionRequired: boolean;
  cacheTtlHours?: number;
  requiresLicenseFlag: boolean;
  notes: string;
}

export type Capability =
  | 'survey_def' | 'response' | 'contact' | 'distribution'
  | 'review' | 'topic' | 'continuous_sync';

export interface ConnectorMeta {
  platform: string;
  label: string;
  authKind: PrismAuthKind;
  capabilities: Capability[];
  legalPosture: LegalPosture;
  /** Source rate limits → feed the Redis token bucket. */
  rateLimit?: { perSecond?: number; perDay?: number; concurrentExports?: number };
  /** Per resource-type capture preference for CDC. */
  captureModes?: Partial<Record<RecordType, CaptureMode>>;
}

export interface AuthInput {
  orgId: string;
  authKind: PrismAuthKind;
  apiKey?: string;
  oauthCode?: string;
  serviceAccountJson?: string;
  fileRef?: string;                 // uploaded file storage ref
  extra?: Record<string, unknown>;  // e.g. datacenterId for Qualtrics
}

/** Opaque ref to a secret stored in Secret Manager. */
export type CredentialRef = string;

export interface DiscoveredResource {
  resourceRef: ResourceRef;
  label: string;
  recordType: RecordType;
  counts?: number;
  dateRange?: { start: string; end: string };
  metric?: 'nps' | 'csat' | 'ces' | null;
}

export interface ResourceRef {
  kind: RecordType;
  id: string;
  extra?: Record<string, unknown>;
}

export type Cursor = Record<string, unknown>;

export interface SourceSchemaProfile {
  fields: { name: string; type: string; label?: string; sampleValues?: unknown[] }[];
  shapeHash: string;
  hints?: { metricFields?: Record<string, 'nps' | 'csat' | 'ces'>; logicExposed?: boolean };
}

export interface Connection {
  id: string;
  orgId: string;
  credentialRef: CredentialRef | null;
  config: Record<string, unknown>;
}

/** A connector is a source adapter; the engine is source-agnostic. */
export interface PrismConnector {
  meta: ConnectorMeta;
  authenticate(input: AuthInput): Promise<CredentialRef>;
  discover(conn: Connection): AsyncIterable<DiscoveredResource>;
  /** Bulk + continuous use the same extract at different offsets (ADR-022). */
  extract(
    conn: Connection,
    resource: ResourceRef,
    cursor?: Cursor,
  ): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }>;
  profile(raw: RawRecord[]): SourceSchemaProfile;
}

// ─────────────────────────────────────────────────────────────────────────────
// SDK helper signatures (implemented in backend/src/lib/prism/helpers/)
// Connectors import these — do not reimplement per connector.
// ─────────────────────────────────────────────────────────────────────────────

export interface PrismHelpers {
  /** Async export → poll → download → stream-parse (Qualtrics/Medallia). */
  exportPoll<T>(opts: ExportPollOpts<T>): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }>;
  /** Page through a cursor/page-token API. */
  paginate<T>(opts: PaginateOpts<T>): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }>;
  /** Parse an uploaded CSV/XLSX/SPSS/JSON file into raw records. */
  parseFile(opts: ParseFileOpts): AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }>;
  /** Build a provenance-stamped RawRecord. */
  toRawRecord(input: Omit<RawRecord, 'payload_hash'> & { payload: unknown }): RawRecord;
  /** Egress-guarded fetch (SSRF allowlist). */
  guardedFetch(url: string, init: RequestInit, allowHosts: string[]): Promise<Response>;
  /** Exponential backoff + jitter wrapper; classifies retryable vs not. */
  withRetry<T>(fn: () => Promise<T>, opts?: { caps?: number }): Promise<T>;
}

export interface ExportPollOpts<T> {
  start: () => Promise<string>;                       // → progressId
  poll: (progressId: string) => Promise<{ done: boolean; fileId?: string; pct?: number }>;
  download: (fileId: string) => AsyncIterable<T>;
  toRecords: (chunk: T) => RawRecord[];
}
export interface PaginateOpts<T> {
  fetchPage: (cursor?: Cursor) => Promise<{ items: T[]; nextCursor?: Cursor }>;
  toRecords: (items: T[]) => RawRecord[];
}
export interface ParseFileOpts {
  fileRef: string;
  format: 'csv' | 'xlsx' | 'spss' | 'json' | 'qsf' | 'triple_s';
  toRecords: (row: Record<string, unknown>, idx: number) => RawRecord;
}

// ─────────────────────────────────────────────────────────────────────────────
// API DTOs (/api/prism/*)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateConnectionRequest {
  platform: string;
  authKind: PrismAuthKind;
  mode: PrismMode;
  history_window?: number;
  credentials?: { apiKey?: string; serviceAccountJson?: string; extra?: Record<string, unknown> };
  oauthCode?: string;
  fileRef?: string;
}

export interface CreateJobRequest {
  connectionId: string;
  kind: PrismJobKind;
  resources: ResourceRef[];
  options?: { include_partials?: boolean; date_from?: string; date_to?: string };
}

export interface ConfirmMappingRequest { mappings: FieldMapping[]; }

export interface ApproveRequest {
  conflictResolutions?: { source_record_id: string; resolution: 'keep_source' | 'keep_existing' | 'create_new' }[];
  metricMethods?: Record<string, 'match_source' | 'prism'>;
}

// ─────────────────────────────────────────────────────────────────────────────
// API RESPONSE DTOs (/api/prism/*) — CANONICAL SOURCE OF TRUTH
//
// One shape per endpoint. The Express router (routes/prism.ts, prismUploads.ts,
// prismOauth.ts) MUST return exactly these; the frontend mirror
// (app/src/types/prism.ts) and `app/src/lib/api.ts` MUST consume exactly these.
// Field names / wrapper keys here are authoritative — do not diverge per layer.
//
// Convention: a single created/fetched entity is wrapped under a named key
// (`{ connection }`, `{ job }`) so the response is self-describing and forward-
// compatible (extra sibling fields never collide). Lists wrap under a plural key.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/prism/connections (201) — the created connection row (no secrets). */
export interface CreateConnectionResponse { connection: PrismConnection; }

/** GET /api/prism/connections — active connections for the org (no secrets). */
export interface ListConnectionsResponse { connections: PrismConnection[]; }

/** DELETE /api/prism/connections/:id — soft-delete + secret revoke. */
export interface DeleteConnectionResponse { success: boolean; }

/** GET /api/prism/connections/:id/resources — discovered source resources. */
export interface DiscoverResponse { resources: DiscoveredResource[]; }

/** POST /api/prism/jobs (201) — the created job row. */
export interface CreateJobResponse { job: PrismJob; }

/** GET /api/prism/jobs — recent jobs (platform joined in). */
export interface ListJobsResponse { jobs: PrismJob[]; }

/** GET /api/prism/jobs/:id — full job (UI polls this). */
export interface GetJobResponse { job: PrismJob; }

/**
 * POST /api/prism/jobs/:id/(pause|resume|cancel) — lifecycle transition.
 * Returns the full job so the FE can `setJob(...)` from the response directly.
 */
export interface JobActionResponse { job: PrismJob; }

/** GET /api/prism/jobs/:id/mapping — mapping suggestions (key: `mappings`). */
export interface MappingResponse {
  mappings: FieldMapping[];
  mapping_version?: number;
  schema_shape_hash?: string;
}

/** PUT /api/prism/jobs/:id/mapping — confirm/edit mapping. */
export interface PutMappingResponse { success: boolean; }

/** GET /api/prism/jobs/:id/dryrun — dry-run report (returned UNWRAPPED). */
export type DryRunResponse = DryRunReport;

/** POST /api/prism/jobs/:id/approve (202) — returns the job (status → loading). */
export interface ApproveResponse { job: PrismJob; }

/** GET /api/prism/jobs/:id/reconciliation — recon report (returned UNWRAPPED). */
export type ReconResponse = ReconReport;

/** POST /api/prism/uploads (201) — parked upload + detection. */
export interface UploadResponse {
  fileRef: string;
  filename: string;
  sizeBytes: number;
  detectedFormat: string;
  detectedPlatform?: string;
}

/** POST /api/prism/oauth/:platform/start — provider authorize URL. */
export interface OAuthStartResponse { authorizeUrl: string; }

/** POST /api/prism/connections/:id/sync (201) — registered CDC sync state. */
export interface RegisterSyncResponse {
  sync: unknown;
  mode: 'cdc' | 'poll';
  cursor: Record<string, unknown> | null;
}

/** GET /api/prism/connections/:id/sync — per-record-type sync state. */
export interface GetSyncResponse { sync: PrismSyncState[]; }
