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

export interface Insight {
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

// ── Copilot ───────────────────────────────────────────────────────────────────

export interface CopilotChange {
  question_id?:  string;
  what_changed?: string;
  action?:       string;  // "added" | "removed" | "edited"
}

// ── Breakpoint ────────────────────────────────────────────────────────────────

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';
