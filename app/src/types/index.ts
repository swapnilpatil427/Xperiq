// ── Question types ────────────────────────────────────────────────────────────

export type QuestionType =
  | 'nps' | 'csat' | 'rating' | 'slider'
  | 'multiple_choice' | 'checkbox' | 'dropdown' | 'ranking'
  | 'open_text' | 'short_text'
  | 'matrix' | 'date' | 'statement';

export interface SkipLogicCondition {
  operator: 'eq' | 'neq' | 'lt' | 'gt' | 'lte' | 'gte' | 'contains' | 'answered' | 'not_answered';
  value?: string | number | null;
}

export interface SkipLogicRule {
  id: string;
  condition: SkipLogicCondition;
  destination: string;   // question ID or "END_SURVEY"
}

export interface DisplayLogic {
  sourceQuestionId: string;
  operator: string;
  value?: string | number | null;
}

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  question: string;
  required: boolean;
  skipLogic?: SkipLogicRule[];
  displayLogic?: DisplayLogic | null;
}

export interface NpsQuestion extends BaseQuestion { type: 'nps'; labelLow?: string; labelHigh?: string; }
export interface CsatQuestion extends BaseQuestion { type: 'csat'; csatStyle?: 'emoji' | 'stars' | 'numbers'; }
export interface RatingQuestion extends BaseQuestion { type: 'rating'; scaleMax?: number; ratingStyle?: 'stars' | 'numbers'; labelLow?: string; labelHigh?: string; }
export interface SliderQuestion extends BaseQuestion { type: 'slider'; min?: number; max?: number; step?: number; showValue?: boolean; labelLow?: string; labelHigh?: string; }
export interface ChoiceQuestion extends BaseQuestion { type: 'multiple_choice' | 'checkbox' | 'dropdown' | 'ranking'; options?: string[]; allowOther?: boolean; randomize?: boolean; maxSelections?: number | null; placeholder?: string; }
export interface TextQuestion extends BaseQuestion { type: 'open_text' | 'short_text'; placeholder?: string; maxLength?: number | null; validation?: 'email' | 'url' | 'number' | 'phone' | null; }
export interface MatrixQuestion extends BaseQuestion { type: 'matrix'; rows?: string[]; columns?: string[]; matrixType?: 'radio' | 'checkbox'; }
export interface DateQuestion extends BaseQuestion { type: 'date'; dateType?: 'date' | 'time' | 'datetime'; }
export interface StatementQuestion extends BaseQuestion { type: 'statement'; isStatement?: boolean; }

export type Question =
  | NpsQuestion | CsatQuestion | RatingQuestion | SliderQuestion
  | ChoiceQuestion | TextQuestion | MatrixQuestion | DateQuestion
  | StatementQuestion;

// ── Survey ────────────────────────────────────────────────────────────────────

export type SurveyStatus = 'draft' | 'active' | 'paused' | 'closed';

export interface Survey {
  id: string;
  org_id: string;
  title: string;
  description?: string | null;
  status: SurveyStatus;
  questions: Question[];
  survey_type_id?: string | null;
  template_id?: string | null;
  intent?: string | null;
  thank_you_message?: string | null;
  nps_score?: number | null;
  publish_token?: string | null;
  response_count?: number;
  created_by?: string;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  paused_at?: string | null;
  closed_at?: string | null;
  deleted_at?: string | null;
}

// ── Answer / Response ─────────────────────────────────────────────────────────

export interface Answer {
  questionId: string;
  type?: string;
  value: unknown;
}

export interface SurveyResponse {
  id: string;
  survey_id: string;
  org_id: string;
  answers: Answer[];
  nps_score?: number | null;
  submitted_at: string;
}

// ── Template ──────────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  orgId?: string;
  label: string;
  shortLabel?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  bg?: string;
  metrics?: string[];
  tags?: string[];
  recommended?: boolean;
  estimatedMinutes?: number;
  questionCount?: string;
  questions?: Question[];
  scoring?: Record<string, unknown> | null;
  intelligence?: Record<string, unknown> | null;
  isSystem?: boolean;
  status?: string;
  createdBy?: string;
  clonedFromId?: string | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ── Workflow ──────────────────────────────────────────────────────────────────

export interface WorkflowCondition {
  field?: string;
  operator?: string;
  value?: unknown;
}

export interface WorkflowAction {
  type?: string;
  config?: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  org_id?: string;
  name: string;
  condition: WorkflowCondition;
  action: WorkflowAction;
  status: 'active' | 'paused';
  trigger_count?: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// ── Insights ──────────────────────────────────────────────────────────────────

export interface InsightTopic {
  name: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  volume: number;
  phrases?: string[];
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
}

/** @deprecated Use AgenticInsight instead */
export interface LegacyInsight {
  id?: string;
  survey_id?: string;
  org_id?: string;
  summary: string;
  nps_score?: number | null;
  topics?: InsightTopic[];
  sentiment_breakdown?: SentimentBreakdown;
  top_phrases?: string[];
  response_count?: number;
  triggered_by?: string;
  created_at?: string;
}

/** Backward-compat alias */
export type Insight = LegacyInsight;

// ── New Insight types (v2 — per-survey agentic insights) ──────────────────────

export interface InsightMetric {
  name:    string;
  value:   number | null;
  ci_low?: number | null;
  ci_high?: number | null;
  unit?:   string;
  scale?:  number;
  distribution?: Record<string, number>;
}

export interface InsightCitation {
  response_id: string;
  quote:       string;
  sentiment:   'positive' | 'neutral' | 'negative';
  relevance:   number;
  emotion:     string;
}

export interface InsightTrust {
  statistical:  number;
  coverage:     number;
  consistency:  number;
  grounding:    number;
  below_minimum_sample: boolean;
  sample_size:  number;
}

export interface InsightRecommendedAction {
  type:   string;
  label:  string;
  target?: string;
}

export interface InsightAudit {
  model:           string;
  embedding_model: string;
  temperature:     number;
  seed:            number;
  verifier_pass:   boolean;
  verifier_notes:  string;
  prompt_hash:     string;
  run_id:          string;
}

export interface AgenticInsight {
  id:            string;
  survey_id:     string;
  org_id:        string;
  run_id:        string;
  layer:         'descriptive' | 'diagnostic' | 'predictive' | 'prescriptive';
  category:      string;
  question_type?: string;
  segment_json?:  Record<string, unknown>;
  headline:      string;
  narrative:     string;
  recommended_action?: InsightRecommendedAction | null;
  metric_json?:  InsightMetric | null;
  citations_json: InsightCitation[];
  trust_score:   number;
  trust_json:    InsightTrust;
  priority:      number;
  insight_hash:  string;
  audit_json:    InsightAudit;
  user_state_json: {
    pinned?:    boolean;
    dismissed?: boolean;
    thumbs?:    'up' | 'down' | null;
  };
  generated_at: string;
  superseded_at?: string | null;
}

export interface InsightRunStatus {
  run_id:    string;
  status:    'running' | 'completed' | 'failed';
  progress?: number;
  stream_events: Array<{ event: string; agent: string; data: Record<string, unknown>; timestamp: string }>;
  insights_count?: number;
}

// ── Org Profile ───────────────────────────────────────────────────────────────

export interface OrgProfile {
  id?: number;
  org_id?: string;
  industry?: string | null;
  company_size?: string | null;
  use_case?: string | null;
  target_audience?: string | null;
  website?: string | null;
  brand_description?: string | null;
  brand_name?: string | null;
  logo_url?: string | null;
  brand_colors?: Record<string, string>;
  brand_fonts?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

// ── Org & Members ─────────────────────────────────────────────────────────────

export interface Org {
  orgId: string;
  name: string | null;
  logoUrl?: string | null;
}

export interface OrgMember {
  userId: string;
  identifier: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  joinedAt: string;
}

// ── API client ────────────────────────────────────────────────────────────────

export interface ListSurveysParams {
  q?: string;
  status?: SurveyStatus[];
  survey_type_id?: string[];
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ListSurveysResult {
  surveys: Survey[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  stats: {
    total_surveys: number;
    active_surveys: number;
    total_responses: number;
    avg_nps: number | null;
  };
}

// ── Survey Topics ─────────────────────────────────────────────────────────────

export interface SurveyTopic {
  id: string;
  name: string;
  aliases: string[];
  is_new: boolean;
  volume: number;
  sentiment_score: number | null;  // -1 to 1
  dominant_emotion: string | null;
  effort_score: number | null;  // 1-7
  trending: 'up' | 'down' | 'stable' | 'new' | null;
  first_seen_at: string;
}

// ── Copilot ───────────────────────────────────────────────────────────────────

export interface CopilotChange {
  question_id?:  string;
  what_changed?: string;
  action?:       string;  // "added" | "removed" | "edited"
}

// ── Breakpoint ────────────────────────────────────────────────────────────────

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';
