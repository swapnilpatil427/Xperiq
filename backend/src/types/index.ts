/**
 * Shared domain types for the Experient API.
 *
 * Express Request augmentation lives here — import this file in any module that
 * reads req.orgId, req.userId, req.orgRole, or req.id.
 */

import type { Request, Response, NextFunction } from 'express';

// ── Express augmentation ──────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** Clerk org ID — set by requireAuth middleware. */
      orgId: string;
      /** Clerk user ID (sub claim) — set by requireAuth middleware. */
      userId: string;
      /** Unique request ID — set by requestId middleware. */
      id?: string;
      /** Clerk org_role claim — set by requireRole middleware. */
      orgRole?: string | null;
      /** SCIM org ID — set by scimAuth middleware. */
      scimOrgId?: string;
      /** SCIM token row ID — set by scimAuth middleware. */
      scimTokenId?: string;
      /** Permission action that was evaluated — set by requirePermission middleware. */
      permissionAction?: string;
      /** Resource ID that was evaluated — set by requirePermission middleware. */
      permissionResourceId?: string;
    }
  }
}

// ── Utility types ─────────────────────────────────────────────────────────────

export type DbRow = Record<string, unknown>;
export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Extract a safe Error from an unknown catch value. */
export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// ── Survey domain ─────────────────────────────────────────────────────────────

export type SurveyStatus = 'draft' | 'active' | 'paused' | 'closed';

export interface Question {
  id: string;
  type: string;
  text: string;
  required?: boolean;
  options?: string[];
  logic?: QuestionLogic[];
  [key: string]: unknown;
}

export interface QuestionLogic {
  condition: string;
  value: unknown;
  action: string;
  target?: string;
}

export interface Survey {
  id: string;
  org_id: string;
  title: string;
  description?: string | null;
  status: SurveyStatus;
  survey_type_id?: string | null;
  questions: Question[];
  settings?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  tags?: SurveyTag[];
}

// ── Response domain ───────────────────────────────────────────────────────────

export interface ResponseAnswer {
  question_id: string;
  value: unknown;
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  org_id: string;
  answers: ResponseAnswer[];
  respondent_id?: string | null;
  metadata?: Record<string, unknown> | null;
  submitted_at: string;
}

// ── Insight domain ────────────────────────────────────────────────────────────

export type InsightLayer = 'descriptive' | 'diagnostic' | 'predictive' | 'prescriptive';
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Insight {
  id: string;
  org_id: string;
  survey_id: string;
  run_id: string;
  layer: InsightLayer;
  category: string;
  headline: string;
  narrative: string;
  metric_json?: Record<string, unknown> | null;
  citations_json?: unknown[] | null;
  trust_score?: number | null;
  priority?: number | null;
  created_at: string;
  superseded_at?: string | null;
}

export interface AgentRun {
  id: string;
  org_id: string;
  survey_id: string;
  status: RunStatus;
  stream_events: unknown[];
  error_log: unknown[];
  trigger: string;
  created_at: string;
  completed_at?: string | null;
  heartbeat_at?: string | null;
}

// ── Tag / Group domain ────────────────────────────────────────────────────────

export interface SurveyTag {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  color: string;
  description?: string | null;
  program_config?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  survey_count?: number;
}

export interface GroupInsightRun {
  id: string;
  org_id: string;
  tag_ids: string[];
  survey_ids: string[];
  status: RunStatus;
  stream_events: unknown[];
  error_log: unknown[];
  result_json?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface GroupInsight {
  id: string;
  org_id: string;
  run_id: string;
  tag_ids: string[];
  survey_ids: string[];
  layer: string;
  category: string;
  headline: string;
  narrative: string;
  metric_json?: Record<string, unknown> | null;
  citations_json?: unknown[] | null;
  trust_score?: number | null;
  priority?: number | null;
  data_gap_signals?: Record<string, unknown> | null;
  suggested_survey_types?: string[] | null;
  suggested_survey_json?: Record<string, unknown> | null;
  created_at: string;
  superseded_at?: string | null;
}

// ── Org / Member domain ───────────────────────────────────────────────────────

export interface Org {
  id: string;
  name: string;
  plan?: string | null;
  created_at: string;
}

export interface OrgMember {
  user_id: string;
  org_id: string;
  role: string;
  email?: string | null;
  name?: string | null;
  joined_at?: string | null;
}

// ── Template domain ───────────────────────────────────────────────────────────

export interface Template {
  id: string;
  org_id?: string | null;
  title: string;
  description?: string | null;
  survey_type_id?: string | null;
  questions: Question[];
  is_global: boolean;
  created_at: string;
}

// ── Workflow domain ───────────────────────────────────────────────────────────

export type WorkflowStatus = 'active' | 'paused' | 'draft';

export interface WorkflowTrigger {
  type: string;
  conditions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorkflowAction {
  type: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  status: WorkflowStatus;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
}

// ── Notification domain ───────────────────────────────────────────────────────

export type NotificationStatus = 'unread' | 'read' | 'dismissed';

export interface Notification {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  status: NotificationStatus;
  payload?: Record<string, unknown> | null;
  created_at: string;
  read_at?: string | null;
}

// ── Alert domain ──────────────────────────────────────────────────────────────

export interface Alert {
  id: string;
  org_id: string;
  name: string;
  condition: Record<string, unknown>;
  channels: string[];
  status: 'active' | 'paused';
  created_by?: string | null;
  created_at: string;
}

// ── SCIM / User Directory ─────────────────────────────────────────────────────

export interface ScimToken {
  id: string;
  org_id: string;
  token_hash: string;
  description?: string | null;
  created_by?: string | null;
  created_at: string;
  last_used_at?: string | null;
}

export interface Seat {
  id: string;
  org_id: string;
  user_id: string;
  seat_type: string;
  allocated_at: string;
}

// ── RBAC domain ───────────────────────────────────────────────────────────────

export type PermissionAction =
  | 'survey:read'
  | 'survey:write'
  | 'survey:distribute'
  | 'survey:insights:read'
  | 'survey:insights:generate'
  | 'survey:responses:export'
  | 'survey:delete'
  | 'dashboard:read'
  | 'alerts:manage'
  | 'workflows:manage'
  | 'users:manage'
  | 'billing:manage';

export type PermissionScope = 'ALL' | 'OWNED' | 'SHARED' | 'OWN' | 'NONE';

export interface BuiltinRole {
  builtinKey: string;
  name: string;
  description: string;
  seatWeight: number;
  permissions: Partial<Record<PermissionAction, PermissionScope>>;
}

// ── Dashboard domain ──────────────────────────────────────────────────────────

export interface DashboardWidget {
  id: string;
  type: string;
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

export {};
