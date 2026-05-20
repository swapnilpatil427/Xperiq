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
  max_responses?: number | null;
  auto_close_at?: string | null;
  allow_multiple_responses?: boolean;
  password_protected?: boolean;
  publish_token?: string | null;
  response_count?: number;
  avg_csat?: number | null;
  sparkline?: number[];
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
  // AI enrichment
  ai_sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
  ai_sentiment_score?: number | null;
  ai_emotion?: string | null;
  ai_effort_score?: number | null;
  ai_topics?: string[] | null;
  // Device / metadata
  country?: string | null;
  city?: string | null;
  device_type?: string | null;
  browser?: string | null;
  os?: string | null;
  completion_time_s?: number | null;
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
  dominant_sentiment?: 'positive' | 'neutral' | 'negative';
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
  trust_json:    InsightTrust | null;
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
  sub_vertical?: string | null;
  company_size?: string | null;
  use_case?: string | null;
  primary_use_case?: string | null;
  target_audience?: string | null;
  website?: string | null;
  brand_description?: string | null;
  brand_name?: string | null;
  product_name?: string | null;
  region?: string | null;
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
  sentiment_score: number | null;    // -1 to 1
  dominant_emotion: string | null;
  effort_score: number | null;       // 1-7
  // Volume direction — are more people talking about this?
  trending: 'up' | 'down' | 'stable' | 'new' | null;
  // Sentiment direction — is it getting better or worse?
  sentiment_momentum: 'improving' | 'worsening' | 'stable' | null;
  // Composite priority score: abs(sentiment) × √volume × (effort/7)
  urgency_score: number | null;
  // Volume change since last pipeline run
  volume_delta: number | null;
  volume_delta_pct: number | null;
  // True when topic has been negative for 3+ consecutive runs
  chronic: boolean;
  first_seen_at: string;
  last_seen_at?: string;
  nps_avg?: number | null;
  nps_correlation?: number | null;   // Pearson r vs NPS score (-1 to 1)
  positive_pct?: number | null;
  negative_pct?: number | null;
  // Hierarchy
  parent_topic_id?: string | null;
  hierarchy_level?: number;          // 0=root topic, 1=subtopic
  sub_topic_count?: number;
  theme?: string | null;             // theme group (e.g. "Checkout Experience")
  // Specialist
  keyword_list?: string[];
}

export interface TopicTheme {
  name: string;
  volume: number;
  sentiment_avg: number | null;
  topics: Array<SurveyTopic & { subtopics?: SurveyTopic[] }>;
}

export interface TopicTrendPoint {
  day: string;
  volume: number;
  avg_nps: number | null;
  promoters: number;
  detractors: number;
}

export interface TopicDetail {
  trend_series: TopicTrendPoint[];
  co_occurring: Array<{ name: string; co_count: number; lift?: number | null }>;
  subtopics: SurveyTopic[];
}

export interface TopicVerbatim {
  response_id: string;
  text: string;
  all_texts?: string[];
  nps_score: number | null;
  sentiment: string | null;
  sentiment_score: number | null;
  submitted_at: string;
  topics: string[];
}

export interface TopicDriver {
  id: string;
  name: string;
  volume: number;
  tagged_count: number;
  topic_avg_nps: number | null;
  nps_delta: number | null;       // topic NPS minus overall NPS
  impact_score: number;
  sentiment_score: number | null;
  effort_score: number | null;
  trending: 'up' | 'down' | 'stable' | 'new' | null;
  positive_pct: number | null;
  negative_pct: number | null;
  direction: 'positive' | 'negative' | 'neutral';
}

// ── Copilot ───────────────────────────────────────────────────────────────────

export interface CopilotChange {
  question_id?:  string;
  what_changed?: string;
  action?:       string;  // "added" | "removed" | "edited"
}

// ── Breakpoint ────────────────────────────────────────────────────────────────

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';
