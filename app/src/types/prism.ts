// Prism — frontend mirror of the shared contract.
//
// This is the UI-facing subset of backend/src/types/prism.ts (the single source
// of truth). Field names match the backend contract + Postgres migrations. Only
// the types the frontend actually renders / sends are mirrored here; keep them in
// sync with the backend when the contract changes.

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

export type LegalPostureBasis =
  | 'first_party_owned' | 'public_api_licensed' | 'display_only' | 'no_compliant_path';

export type RecordType =
  | 'survey_def' | 'response' | 'contact' | 'distribution' | 'review' | 'signal' | 'topic';

export type MetricKind = 'nps' | 'csat' | 'ces';

/**
 * UI wizard steps. The backend `PrismStage` is finer-grained than the 6-step
 * wizard; `STAGE_TO_STEP` (in PrismJobPage) collapses stages → these steps.
 */
export type PrismWizardStep = 'connect' | 'select' | 'map' | 'review' | 'import' | 'done';

// ─────────────────────────────────────────────────────────────────────────────
// Entities (rows)
// ─────────────────────────────────────────────────────────────────────────────

export interface PrismConnection {
  id: string;
  org_id: string;
  platform: string;
  label: string;
  auth_kind: PrismAuthKind;
  status: PrismConnectionStatus;
  credential_ref: string | null;    // Secret Manager ref — NEVER the secret
  mode: PrismMode;
  history_window: number;           // 1..12 months; new data always checkpointed
  config: Record<string, unknown>;
  stats: Record<string, unknown>;
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

// ── Field mapping ────────────────────────────────────────────────────────────

export interface ValueRule {
  kind: 'rescale' | 'map' | 'verbatim';
  in_min?: number; in_max?: number; out_min?: number; out_max?: number;
  map?: Record<string, string>;
}

export interface FieldMapping {
  source_field: string;
  source_type?: string;
  target: string;                   // Xperiq QuestionType / 'embedded_data' / 'preserve'
  metric?: MetricKind | null;
  value_rules?: ValueRule[];
  confidence: number;               // 0..1
  origin: 'deterministic' | 'template' | 'llm';
  rationale?: string;
}

export interface PrismMapping {
  id?: string;
  org_id: string;
  connection_id: string;
  schema_shape_hash: string;
  mapping_version: number;
  mappings: FieldMapping[];
  created_at?: string;
}

// ── Dry-run + reconciliation reports ────────────────────────────────────────

/** Two-tier parity: Tier-1 data fidelity guaranteed; Tier-2 metric best-effort + explainer. */
export interface ParityEntry {
  metric: MetricKind | string;
  source_value: number | null;     // source-reported (may be unknown)
  prism_computed: number | null;
  match: boolean;
  delta?: number;
  explanation?: string;             // parity explainer's most-likely cause
  method?: 'match_source' | 'prism';
}

export interface DryRunReport {
  summary: { create: number; update: number; skip_duplicate: number; conflict: number };
  metric_parity: ParityEntry[];
  unmapped_fields: { source_field: string; action: string }[];
  timestamp_continuity: { earliest: string; latest: string; gaps: string[] };
  conflicts: { source_record_id: string; reason: string }[];
  /** Optional sample preview rows (humanized) the diff renders as a table. */
  sample?: Array<Record<string, unknown>>;
}

export interface ReconReport {
  tier1_pass: boolean;
  counts: { source: number; prism: number; match: boolean };
  checksum: { source: string; prism: string; match: boolean };
  metric_parity: ParityEntry[];
  generated_at: string;
  /** Signed report artifact (PDF/JSON) when the backend has generated it. */
  report_url?: string | null;
}

// ── Discovery ────────────────────────────────────────────────────────────────

export interface ResourceRef {
  kind: RecordType;
  id: string;
  extra?: Record<string, unknown>;
}

export interface DiscoveredResource {
  resourceRef: ResourceRef;
  label: string;
  recordType: RecordType;
  counts?: number;
  dateRange?: { start: string; end: string };
  metric?: MetricKind | null;
}

// ── Connector SDK contract (UI surface) ─────────────────────────────────────

export type Capability =
  | 'survey_def' | 'response' | 'contact' | 'distribution'
  | 'review' | 'topic' | 'continuous_sync';

export interface LegalPosture {
  basis: LegalPostureBasis;
  mayStoreContent: boolean;
  mayProcessWithAI: boolean;
  attributionRequired: boolean;
  cacheTtlHours?: number;
  requiresLicenseFlag: boolean;
  notes: string;
}

export interface ConnectorMeta {
  platform: string;
  label: string;
  authKind: PrismAuthKind;
  capabilities: Capability[];
  legalPosture: LegalPosture;
  rateLimit?: { perSecond?: number; perDay?: number; concurrentExports?: number };
  /** UI-only grouping hint surfaced by the gallery (survey | reviews | files). */
  group?: ConnectorGroup;
  /** UI-only: comma-separated accepted extensions for file_upload connectors. */
  accept?: string;
  /** UI-only: file_upload connectors that accept several files at once. */
  multiple?: boolean;
  /** UI-only: file_upload connectors that auto-detect format + platform per file. */
  autodetect?: boolean;
}

export type ConnectorGroup = 'survey' | 'reviews' | 'files';

// ─────────────────────────────────────────────────────────────────────────────
// API request DTOs (/api/prism/*)
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
// API RESPONSE DTOs (/api/prism/*) — mirror of backend/src/types/prism.ts.
//
// CANONICAL SOURCE OF TRUTH lives in the backend; this is the UI-facing mirror.
// `app/src/lib/api.ts` normalizes every Prism response into exactly these shapes
// (see the `expectEntity()`/`expectArray()` helpers there). Keep in sync with backend.
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/prism/connections (201). */
export interface CreateConnectionResponse { connection: PrismConnection; }
/** GET /api/prism/connections. */
export interface ListConnectionsResponse { connections: PrismConnection[]; }
/** DELETE /api/prism/connections/:id. */
export interface DeleteConnectionResponse { success: boolean; }
/** GET /api/prism/connections/:id/resources. */
export interface DiscoverResponse { resources: DiscoveredResource[]; }
/** POST /api/prism/jobs (201). */
export interface CreateJobResponse { job: PrismJob; }
/** GET /api/prism/jobs. */
export interface ListJobsResponse { jobs: PrismJob[]; }
/** GET /api/prism/jobs/:id. */
export interface GetJobResponse { job: PrismJob; }
/** POST /api/prism/jobs/:id/(pause|resume|cancel). */
export interface JobActionResponse { job: PrismJob; }
/** GET /api/prism/jobs/:id/mapping. */
export interface MappingResponse {
  mappings: FieldMapping[];
  mapping_version?: number;
  schema_shape_hash?: string;
}
/** PUT /api/prism/jobs/:id/mapping. */
export interface PutMappingResponse { success: boolean; }
/** GET /api/prism/jobs/:id/dryrun (UNWRAPPED). */
export type DryRunResponse = DryRunReport;
/** POST /api/prism/jobs/:id/approve (202). */
export interface ApproveResponse { job: PrismJob; }
/** GET /api/prism/jobs/:id/reconciliation (UNWRAPPED). */
export type ReconResponse = ReconReport;
/** POST /api/prism/uploads (201). */
export interface UploadResponse {
  fileRef: string;
  filename: string;
  sizeBytes: number;
  detectedFormat: string;
  detectedPlatform?: string;
}
/** POST /api/prism/oauth/:platform/start. */
export interface OAuthStartResponse { authorizeUrl: string; }
