/**
 * Prism — Zod request schemas for the `/api/prism/*` surface.
 *
 * These validate the API DTOs declared in the shared contract
 * `backend/src/types/prism.ts` (CreateConnectionRequest, CreateJobRequest,
 * ConfirmMappingRequest, ApproveRequest) plus the continuous-sync register DTO.
 *
 * SECURITY (security-compliance.md §2.4, §3.3): every schema is `.strict()` so a
 * client can NEVER mass-assign server-controlled fields (`org_id`, `credential_ref`,
 * `status`, …). `org_id` is ALWAYS derived from the Clerk token (`req.orgId`) — it is
 * never read from body/query/header. Raw secret material (apiKey / serviceAccountJson)
 * is accepted write-only here and immediately handed to the secret manager; it is never
 * persisted to Postgres nor returned to the client.
 */
import { z } from 'zod';

// ── Shared enums (mirror types/prism.ts) ─────────────────────────────────────
const authKindSchema = z.enum(['oauth2', 'api_key', 'service_account', 'file_upload']);
const modeSchema     = z.enum(['augment', 'ingest', 'migrate']);
const jobKindSchema  = z.enum(['migration', 'sync', 'backfill']);
const metricSchema   = z.enum(['nps', 'csat', 'ces']);
const recordTypeSchema = z.enum([
  'survey_def', 'response', 'contact', 'distribution', 'review', 'signal', 'topic',
]);

// ── ResourceRef (DiscoveredResource selection for a job) ─────────────────────
const resourceRefSchema = z.object({
  kind: recordTypeSchema,
  id:   z.string().min(1).max(512),
  extra: z.record(z.string(), z.unknown()).optional(),
}).strict();

// ── ValueRule + FieldMapping (mapping confirmation) ──────────────────────────
const valueRuleSchema = z.object({
  kind:    z.enum(['rescale', 'map', 'verbatim']),
  in_min:  z.number().optional(),
  in_max:  z.number().optional(),
  out_min: z.number().optional(),
  out_max: z.number().optional(),
  map:     z.record(z.string(), z.string()).optional(),
}).strict();

const fieldMappingSchema = z.object({
  source_field: z.string().min(1).max(512),
  source_type:  z.string().max(128).optional(),
  target:       z.string().min(1).max(256),  // Xperiq QuestionType | 'embedded_data' | 'preserve'
  metric:       metricSchema.nullish(),
  value_rules:  z.array(valueRuleSchema).max(500).optional(),
  confidence:   z.number().min(0).max(1),
  origin:       z.enum(['deterministic', 'template', 'llm']),
  rationale:    z.string().max(2000).optional(),
}).strict();

// ── CreateConnectionRequest ──────────────────────────────────────────────────
// credentials.* hold raw secret material (write-only → secret manager). `oauthCode`
// is the OAuth authorization code (also exchanged + stored server-side, never echoed).
export const createConnectionSchema = z.object({
  platform:   z.string().min(1).max(64),
  authKind:   authKindSchema,
  mode:       modeSchema,
  history_window: z.number().int().min(1).max(12).optional(),
  credentials: z.object({
    apiKey:             z.string().max(8192).optional(),
    serviceAccountJson: z.string().max(65536).optional(),
    extra:              z.record(z.string(), z.unknown()).optional(),  // e.g. datacenterId for Qualtrics
  }).strict().optional(),
  oauthCode:  z.string().max(8192).optional(),
  fileRef:    z.string().max(1024).optional(),
}).strict();

// ── CreateJobRequest ─────────────────────────────────────────────────────────
export const createJobSchema = z.object({
  connectionId: z.string().min(1).max(128),
  kind:         jobKindSchema,
  // Empty/omitted ⇒ discovery-driven job (API connectors enumerate resources in DISCOVER).
  // File imports pass explicit resources (one per uploaded file). Never require ≥1.
  resources:    z.array(resourceRefSchema).max(1000).default([]),
  options: z.object({
    include_partials: z.boolean().optional(),
    date_from:        z.string().datetime().optional(),
    date_to:          z.string().datetime().optional(),
  }).strict().optional(),
}).strict();

// ── ConfirmMappingRequest (PUT /jobs/:id/mapping) ────────────────────────────
export const confirmMappingSchema = z.object({
  mappings: z.array(fieldMappingSchema).min(1).max(5000),
}).strict();

// ── ApproveRequest (POST /jobs/:id/approve → LOAD) ───────────────────────────
export const approveSchema = z.object({
  conflictResolutions: z.array(z.object({
    source_record_id: z.string().min(1).max(512),
    resolution:       z.enum(['keep_source', 'keep_existing', 'create_new']),
  }).strict()).max(10000).optional(),
  metricMethods: z.record(z.string(), z.enum(['match_source', 'prism'])).optional(),
}).strict();

// ── Continuous sync registration (POST /connections/:id/sync) ────────────────
// Not in the API DTO block of the contract but in architecture-ingestion.md §API:
//   { mode: 'cdc' | 'poll', cursor? }
export const registerSyncSchema = z.object({
  mode:   z.enum(['cdc', 'poll']),
  cursor: z.record(z.string(), z.unknown()).nullish(),
}).strict();

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type CreateJobInput        = z.infer<typeof createJobSchema>;
export type ConfirmMappingInput   = z.infer<typeof confirmMappingSchema>;
export type ApproveInput          = z.infer<typeof approveSchema>;
export type RegisterSyncInput     = z.infer<typeof registerSyncSchema>;
