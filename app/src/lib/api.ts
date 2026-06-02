import axios from 'axios';
import type {
  ListSurveysParams, ListSurveysResult, Survey, SurveyResponse,
  Template, Workflow, Insight, OrgProfile, Question, Org, OrgMember,
  CopilotChange, AgenticInsight, InsightRunStatus, SurveyTopic, TopicDriver,
  TopicTheme, TopicDetail, TopicVerbatim,
} from '../types';

// ── Copilot types ──────────────────────────────────────────────────────────────
export interface OrgContext {
  industry?: string;
  size?: string;
  use_case?: string;
  target_audience?: string;
  prior_survey_count?: number;
  brand_description?: string;
  region?: string;
}

export interface RunStatus {
  run_id:           string;
  thread_id:        string;
  status:           'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_approval';
  stream_events:    StreamEvent[];
  qc_score?:        number;
  compliance_risk?: string;
  questions?:       Question[];
  recommendations:  Recommendation[];
  credit_summary:   Record<string, unknown>;
  error?:           string;
  error_log?:       string[];
  validation_warnings: string[];
}

export interface StreamEvent {
  event:     string;
  agent:     string;
  data:      Record<string, unknown>;
  timestamp: string;
}

export interface Recommendation {
  action:     string;
  label:      string;
  reason:     string;
  priority:   'high' | 'medium' | 'low';
  cta:        string;
  confidence: number;
}

export interface CopilotRefineResult {
  questions:       Question[];
  explanation:     string;
  response_type:   'edit' | 'answer';
  changes:         CopilotChange[];
  suggestions:     string[];
  recommendations?: Recommendation[];
}

export interface QuestionsResult {
  questions:       Question[];
  message:         string;
  changes:         Record<string, unknown>[];
  recommendations?: Recommendation[];
}

export interface Notification {
  id:         string;
  type:       string;
  title:      string;
  body:       string;
  payload:    Record<string, unknown>;
  run_id?:    string;
  read:       boolean;
  created_at: string;
}

// ── Time-series types ──────────────────────────────────────────────────────────

export interface MetricSnapshot {
  captured_at:          string;
  response_count:       number | null;
  nps:                  number | null;
  nps_ci_low:           number | null;
  nps_ci_high:          number | null;
  nps_n:                number | null;
  promoter_pct:         number | null;
  detractor_pct:        number | null;
  passive_pct:          number | null;
  csat:                 number | null;
  completion_rate:      number | null;
  effort_score:         number | null;
  response_velocity_7d: number | null;
  anomaly_flag:         boolean;
}

export interface OrgMetricSnapshot {
  captured_at:          string;
  active_survey_count:  number | null;
  total_responses:      number | null;
  avg_nps:              number | null;
  avg_csat:             number | null;
  avg_completion_rate:  number | null;
  top_urgent_topic:     string | null;
  top_driver_topic:     string | null;
}

export interface TopicWindow {
  window_start:         string;
  window_end:           string;
  response_count:       number;
  avg_sentiment_score:  number | null;
  avg_nps:              number | null;
  health_label:         string | null;
  net_sentiment:        number | null;
  nps_impact:           number | null;
  urgency_score:        number | null;
  velocity_pct:         number | null;
  promoter_pct:         number | null;
  detractor_pct:        number | null;
  emotion_distribution: Record<string, number> | null;
}

export interface TopicTrend {
  topic_id:   string;
  topic_name: string;
  windows:    TopicWindow[];
}

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type GetToken = () => Promise<string | null>;

function createAxiosInstance(getToken: GetToken) {
  const instance = axios.create({ baseURL: BASE });

  instance.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      const message =
        error.response?.data?.error ||
        error.response?.statusText ||
        `HTTP ${error.response?.status}` ||
        error.message;
      return Promise.reject(new Error(message));
    }
  );

  return instance;
}

export function createApiClient(getToken: GetToken) {
  const http = createAxiosInstance(getToken);

  return {
    // Surveys
    listSurveys: async (params: ListSurveysParams = {}) => {
      const qs = new URLSearchParams();
      if (params.q)                      qs.set('q',              params.q);
      if (params.status?.length)         qs.set('status',         params.status.join(','));
      if (params.survey_type_id?.length) qs.set('survey_type_id', params.survey_type_id.join(','));
      if (params.sort_by)                qs.set('sort_by',        params.sort_by);
      if (params.sort_order)             qs.set('sort_order',     params.sort_order);
      if (params.page)                   qs.set('page',           String(params.page));
      if (params.limit)                  qs.set('limit',          String(params.limit));
      const query = qs.toString() ? `?${qs}` : '';
      const res = await http.get<ListSurveysResult>(`/api/surveys${query}`);
      return res.data;
    },
    getSurvey: async (id: string) => {
      const res = await http.get<{ survey: Survey }>(`/api/surveys/${id}`);
      return res.data;
    },
    createSurvey: async (data: Partial<Survey>) => {
      const res = await http.post<{ survey: Survey }>('/api/surveys', data);
      return res.data;
    },
    updateSurvey: async (id: string, data: Partial<Survey>) => {
      const res = await http.put<{ success: boolean }>(`/api/surveys/${id}`, data);
      return res.data;
    },
    deleteSurvey: async (id: string) => {
      const res = await http.delete<{ success: boolean }>(`/api/surveys/${id}`);
      return res.data;
    },
    publishSurvey: async (id: string, settings?: {
      maxResponses?: number | null;
      autoCloseAt?: string | null;
      allowMultipleResponses?: boolean;
      passwordProtected?: boolean;
      password?: string;
    }) => {
      const res = await http.post<{
        publishToken: string;
        publishedAt: string;
        maxResponses?: number | null;
        autoCloseAt?: string | null;
        allowMultipleResponses?: boolean;
        passwordProtected?: boolean;
      }>(`/api/surveys/${id}/publish`, settings ?? {});
      return res.data;
    },

    updateLaunchSettings: async (id: string, settings: {
      maxResponses?: number | null;
      autoCloseAt?: string | null;
      allowMultipleResponses?: boolean;
      passwordProtected?: boolean;
      password?: string;
    }) => {
      const res = await http.patch<{
        maxResponses?: number | null;
        autoCloseAt?: string | null;
        allowMultipleResponses?: boolean;
        passwordProtected?: boolean;
      }>(`/api/surveys/${id}/launch-settings`, settings);
      return res.data;
    },

    verifyPassword: async (token: string, password: string) => {
      const publicHttp = axios.create({ baseURL: BASE });
      const res = await publicHttp.post<{ valid: boolean }>(
        `/api/public/surveys/${token}/verify-password`,
        { password },
      );
      return res.data;
    },

    generateSampleResponses: async (surveyId: string, opts: {
      count?: number;
      personaMix?: 'realistic' | 'critical' | 'positive' | 'mixed';
    }) => {
      const res = await http.post<{ count: number; message: string }>(
        `/api/surveys/${surveyId}/generate-sample-responses`,
        opts,
      );
      return res.data;
    },

    // Responses
    submitResponse: async (surveyId: string, data: { answers: unknown[]; publishToken: string }) => {
      const publicHttp = axios.create({ baseURL: BASE });
      const res = await publicHttp.post<{ success: boolean; id: string }>(`/api/surveys/${surveyId}/responses`, data);
      return res.data;
    },
    getResponses: async (surveyId: string, params: {
      limit?: number; offset?: number; search?: string;
      sentiment?: string; emotion?: string;
      nps_min?: number; nps_max?: number;
      date_from?: string; date_to?: string;
    } = {}) => {
      const res = await http.get<{
        responses: SurveyResponse[];
        total: number; limit: number; offset: number; hasMore: boolean;
      }>(`/api/surveys/${surveyId}/responses`, { params });
      return res.data;
    },
    getInsights: async (surveyId: string) => {
      const res = await http.get<{ insights: Insight }>(`/api/surveys/${surveyId}/insights`);
      return res.data;
    },

    // AI (legacy direct endpoints)
    generateSurvey: async (intent: string, surveyTypeId?: string) => {
      const res = await http.post<{ questions: Question[] }>('/api/ai/generate-survey', { intent, surveyTypeId });
      return res.data;
    },
    analyzeInsights: async (surveyId: string) => {
      const res = await http.post<{ insights: Insight }>('/api/ai/analyze-insights', { surveyId });
      return res.data;
    },
    refineSurvey: async (questions: Question[], message: string, context: Record<string, unknown>) => {
      const res = await http.post<{ questions: Question[]; explanation?: string }>('/api/ai/refine-survey', { questions, message, context });
      return res.data;
    },

    // ── Copilot Orchestration ──────────────────────────────────────────────────

    /** Start a survey creation run. Returns run_id immediately — poll for results. */
    startRun: async (params: {
      intent: string;
      surveyTypeId?: string;
      sessionId?: string;
      orgContext?: OrgContext;
    }) => {
      const res = await http.post<{ run_id: string; thread_id: string; status: string }>(
        '/api/copilot/orchestrate',
        params,
      );
      return res.data;
    },

    /** Poll a run for status, questions, QC score, recommendations. */
    getRunStatus: async (runId: string): Promise<RunStatus> => {
      const res = await http.get<RunStatus>(`/api/copilot/runs/${runId}/status`);
      return res.data;
    },

    /** Cancel a running orchestration. Interrupts the in-process task and marks DB as cancelled.
     *  Idempotent — safe to call on already-terminal runs. */
    cancelRun: async (runId: string): Promise<{ run_id: string; status: string; task_cancelled: boolean }> => {
      const res = await http.post<{ run_id: string; status: string; task_cancelled: boolean }>(
        `/api/copilot/runs/${runId}/cancel`,
        {},
      );
      return res.data;
    },

    // ── Copilot Chat Edits ─────────────────────────────────────────────────────

    /** Apply a natural-language edit to survey questions ("add skip logic to q3"). */
    copilotRefine: async (runId: string, params: {
      message: string;
      questions: Question[];
      orgContext?: OrgContext;
      surveyTypeId?: string;
      intent?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }): Promise<CopilotRefineResult> => {
      const res = await http.post<CopilotRefineResult>(
        `/api/copilot/runs/${runId}/refine`,
        params,
      );
      return res.data;
    },

    /** Add conditional skip/display logic to the survey questions. */
    addSkipLogic: async (runId: string, request: string, orgContext?: OrgContext): Promise<QuestionsResult> => {
      const res = await http.post<QuestionsResult>(
        `/api/copilot/runs/${runId}/skip-logic`,
        { request, orgContext: orgContext ?? {} },
      );
      return res.data;
    },

    // ── Question CRUD ──────────────────────────────────────────────────────────

    addQuestion: async (runId: string, type?: string, afterId?: string): Promise<QuestionsResult> => {
      const res = await http.post<QuestionsResult>(
        `/api/copilot/runs/${runId}/questions`,
        { type: type ?? 'open_text', afterId },
      );
      return res.data;
    },

    removeQuestion: async (runId: string, qId: string): Promise<QuestionsResult> => {
      const res = await http.delete<QuestionsResult>(
        `/api/copilot/runs/${runId}/questions/${qId}`,
      );
      return res.data;
    },

    patchQuestion: async (runId: string, qId: string, fields: Partial<Question>): Promise<QuestionsResult> => {
      const res = await http.patch<QuestionsResult>(
        `/api/copilot/runs/${runId}/questions/${qId}`,
        { fields },
      );
      return res.data;
    },

    reorderQuestions: async (runId: string, order: string[]): Promise<QuestionsResult> => {
      const res = await http.post<QuestionsResult>(
        `/api/copilot/runs/${runId}/reorder`,
        { order },
      );
      return res.data;
    },

    /** Execute a recommendation action (e.g. "add_skip_logic", "refine_question"). */
    applyRecommendation: async (runId: string, actionId: string, params?: {
      parameters?: Record<string, unknown>;
      orgContext?: OrgContext;
      surveyTypeId?: string;
      intent?: string;
    }): Promise<QuestionsResult> => {
      const res = await http.post<QuestionsResult>(
        `/api/copilot/runs/${runId}/apply-recommendation/${actionId}`,
        params ?? {},
      );
      return res.data;
    },

    // ── Notifications ──────────────────────────────────────────────────────────

    getNotifications: async (): Promise<Notification[]> => {
      const res = await http.get<Notification[]>('/api/copilot/notifications');
      return res.data;
    },

    getUnreadCount: async (): Promise<number> => {
      const res = await http.get<{ count: number }>('/api/copilot/notifications/unread-count');
      return res.data.count;
    },

    markNotificationRead: async (id: string): Promise<void> => {
      await http.post(`/api/copilot/notifications/${id}/read`, {});
    },

    markAllNotificationsRead: async (): Promise<void> => {
      await http.post('/api/copilot/notifications/read-all', {});
    },

    getAgentRegistry: async () => {
      const res = await http.get<unknown[]>('/api/copilot/agents/registry');
      return res.data;
    },

    // Templates
    listTemplates: async () => {
      const res = await http.get<{ templates: Template[] }>('/api/templates');
      return res.data;
    },
    getTemplate: async (id: string) => {
      const res = await http.get<{ template: Template }>(`/api/templates/${id}`);
      return res.data;
    },
    createTemplate: async (data: Partial<Template>) => {
      const res = await http.post<{ template: Template }>('/api/templates', data);
      return res.data;
    },
    updateTemplate: async (id: string, data: Partial<Template>) => {
      const res = await http.put<{ success: boolean }>(`/api/templates/${id}`, data);
      return res.data;
    },
    deleteTemplate: async (id: string) => {
      const res = await http.delete<{ success: boolean }>(`/api/templates/${id}`);
      return res.data;
    },
    cloneTemplate: async (id: string) => {
      const res = await http.post<{ template: Template }>(`/api/templates/${id}/clone`, {});
      return res.data;
    },

    // Org profile (legacy)
    getOrgProfile: async () => {
      const res = await http.get<{ profile: OrgProfile | null }>('/api/org-profile');
      return res.data;
    },
    updateOrgProfile: async (data: Partial<OrgProfile>) => {
      const res = await http.put<{ profile: OrgProfile }>('/api/org-profile', data);
      return res.data;
    },

    // Org (Sprint 1)
    getOrg: async () => {
      const res = await http.get<{ org: Org }>('/api/orgs/me');
      return res.data;
    },
    updateOrg: async (data: { name?: string; logoUrl?: string }) => {
      const res = await http.put<{ org: Org }>('/api/orgs/me', data);
      return res.data;
    },
    uploadLogo: async (file: File) => {
      const form = new FormData();
      form.append('logo', file);
      const res = await http.post<{ logoUrl: string }>('/api/orgs/me/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },

    // Members (Sprint 1)
    getMembers: async () => {
      const res = await http.get<{ members: OrgMember[]; total: number }>('/api/orgs/me/members');
      return res.data;
    },
    inviteMember: async (email: string, role?: string) => {
      const res = await http.post<{ success: boolean; invitation?: { id: string; emailAddress: string; status: string } }>('/api/orgs/me/invitations', { email, role });
      return res.data;
    },
    removeMember: async (userId: string) => {
      const res = await http.delete<{ success: boolean }>(`/api/orgs/me/members/${userId}`);
      return res.data;
    },
    updateMemberRole: async (userId: string, role: string) => {
      const res = await http.put<{ success: boolean }>(`/api/orgs/me/members/${userId}/role`, { role });
      return res.data;
    },

    // Workflows
    listWorkflows: async () => {
      const res = await http.get<{ workflows: Workflow[] }>('/api/workflows');
      return res.data;
    },
    createWorkflow: async (data: Partial<Workflow>) => {
      const res = await http.post<{ workflow: Workflow }>('/api/workflows', data);
      return res.data;
    },
    updateWorkflow: async (id: string, data: Partial<Workflow>) => {
      const res = await http.put<{ success: boolean }>(`/api/workflows/${id}`, data);
      return res.data;
    },
    deleteWorkflow: async (id: string) => {
      const res = await http.delete<{ success: boolean }>(`/api/workflows/${id}`);
      return res.data;
    },
    toggleWorkflow: async (id: string) => {
      const res = await http.post<{ status: string }>(`/api/workflows/${id}/toggle`, {});
      return res.data;
    },

    // ── Survey Insights (v2 — agentic) ────────────────────────────────────────

    listInsights: async (surveyId: string, opts: { timeWindow?: string } = {}): Promise<{
      insights:        AgenticInsight[];
      run_status?:     string | null;
      survey?:         { id: string; title: string; response_count: number };
      crystal_opening?: string | null;
      pipeline_active?: boolean;
      survey_status?:  string;
    }> => {
      const params = new URLSearchParams();
      if (opts.timeWindow && opts.timeWindow !== 'all_time') params.set('time_window', opts.timeWindow);
      const qs = params.toString();
      const url = `/api/insights/${surveyId}/list${qs ? '?' + qs : ''}`;
      const res = await http.get(url);
      return res.data;
    },

    triggerInsightGeneration: async (surveyId: string): Promise<{ run_id: string; status: string }> => {
      const res = await http.post<{ run_id: string; status: string }>(`/api/insights/${surveyId}/generate`, {});
      return res.data;
    },

    getInsightRunStatus: async (surveyId: string): Promise<{ run_id: string; status: string; stream_events: unknown[] }> => {
      const res = await http.get<{ run_id: string; status: string; stream_events: unknown[] }>(`/api/insights/${surveyId}/run-status`);
      return res.data;
    },

    updateInsightFeedback: async (insightId: string, feedback: { thumbs?: 'up' | 'down' | null; pinned?: boolean; dismissed?: boolean }): Promise<void> => {
      await http.post(`/api/insights/${insightId}/feedback`, feedback);
    },

    askInsights: async (surveyId: string, question: string): Promise<{ answer: string; citations: AgenticInsight[] }> => {
      const res = await http.post<{ answer: string; citations: AgenticInsight[] }>(`/api/insights/${surveyId}/ask`, { question });
      return res.data;
    },

    listTopics: async (
      surveyId: string,
      window = 'all_time',
      sort: 'volume' | 'urgency' = 'volume',
    ): Promise<{ topics: SurveyTopic[]; run_status: string | null; window: string }> => {
      const res = await http.get<{ topics: SurveyTopic[]; run_status: string | null; window: string }>(
        `/api/insights/${surveyId}/topics?window=${window}&sort=${sort}`,
      );
      // Postgres NUMERIC columns arrive as strings from the pg driver.
      // Coerce to numbers here so .toFixed() calls in components never crash.
      const coerce = (v: unknown) => (v == null ? null : Number(v));
      const topics = (res.data.topics ?? []).map(t => ({
        ...t,
        sentiment_score:    coerce(t.sentiment_score),
        effort_score:       coerce(t.effort_score),
        urgency_score:      coerce(t.urgency_score),
        nps_avg:            coerce(t.nps_avg),
        positive_pct:       coerce(t.positive_pct),
        negative_pct:       coerce(t.negative_pct),
        neutral_pct:        coerce(t.neutral_pct),
        volume_delta_pct:   coerce(t.volume_delta_pct),
        nps_correlation:    coerce(t.nps_correlation),
        net_sentiment:      coerce(t.net_sentiment),
        nps_impact:         coerce(t.nps_impact),
        promoter_pct:       coerce(t.promoter_pct),
        detractor_pct:      coerce(t.detractor_pct),
        passive_pct:        coerce(t.passive_pct),
        avg_csat:           coerce(t.avg_csat),
        csat_impact:        coerce(t.csat_impact),
        avg_effort_score:   coerce(t.avg_effort_score),
        driver_score:       coerce(t.driver_score),
        velocity_pct:       coerce(t.velocity_pct),
        // Hierarchy fields — pass parent_topic_id as-is (UUID string or null)
        parent_topic_id:    t.parent_topic_id ?? null,
        hierarchy_level:    t.hierarchy_level != null ? Number(t.hierarchy_level) : null,
        sub_topic_count:    t.sub_topic_count != null ? Number(t.sub_topic_count) : 0,
      }));
      return { ...res.data, topics };
    },

    getTopicDrivers: async (surveyId: string, window = 'all_time'): Promise<{
      drivers: TopicDriver[];
      overall_nps: number | null;
      total_topics: number;
      window: string;
    }> => {
      const res = await http.get(`/api/insights/${surveyId}/drivers?window=${window}`);
      const coerce = (v: unknown) => (v == null ? null : Number(v));
      const drivers = ((res.data as any).drivers ?? []).map((d: TopicDriver) => ({
        ...d,
        volume:          d.volume != null ? Number(d.volume) : 0,
        nps_delta:       coerce(d.nps_delta),
        impact_score:    coerce(d.impact_score) ?? 0,
        sentiment_score: coerce(d.sentiment_score),
        effort_score:    coerce(d.effort_score),
        positive_pct:    coerce(d.positive_pct),
        negative_pct:    coerce(d.negative_pct),
        topic_avg_nps:   coerce(d.topic_avg_nps),
      }));
      const overall = (res.data as any).overall_nps;
      return {
        ...(res.data as any),
        drivers,
        overall_nps: overall != null ? Number(overall) : null,
      };
    },

    getTopicQuotes: async (surveyId: string, topicId: string): Promise<{
      topic_id: string;
      topic_name: string;
      quotes: Array<{
        response_id: string;
        texts: string[];
        nps_score: number | null;
        submitted_at: string;
      }>;
    }> => {
      const res = await http.get(`/api/insights/${surveyId}/topics/${topicId}/quotes`);
      return res.data as {
        topic_id: string;
        topic_name: string;
        quotes: Array<{ response_id: string; texts: string[]; nps_score: number | null; submitted_at: string }>;
      };
    },

    crystalChat: async (
      surveyId: string,
      message: string,
      ctx?: { window?: string; focused_topic?: string },
    ): Promise<{
      answer: string;
      suggestions: string[];
      insight_refs: string[];
      thread_key: string;
    }> => {
      const res = await http.post<{
        answer: string;
        suggestions: string[];
        insight_refs: string[];
        thread_key: string;
      }>(`/api/insights/${surveyId}/crystal`, { message, ...ctx });
      return res.data;
    },

    getCrystalHistory: async (surveyId: string): Promise<{
      messages: Array<{ role: string; content: string; created_at: string }>;
      updated_at: string | null;
    }> => {
      const res = await http.get<{
        messages: Array<{ role: string; content: string; created_at: string }>;
        updated_at: string | null;
      }>(`/api/insights/${surveyId}/crystal/history`);
      return res.data;
    },

    clearCrystalHistory: async (surveyId: string): Promise<void> => {
      await http.delete(`/api/insights/${surveyId}/crystal/history`);
    },

    // ── Topics deep-dive ──────────────────────────────────────────────────────

    getTopicHierarchy: async (
      surveyId: string,
      window = 'all_time',
    ): Promise<{ themes: TopicTheme[]; total_topics: number; window: string }> => {
      const res = await http.get<{ themes: TopicTheme[]; total_topics: number; window: string }>(
        `/api/insights/${surveyId}/topics/hierarchy?window=${window}`,
      );
      // Postgres NUMERIC columns arrive as strings — coerce topic fields in every theme.
      const coerce = (v: unknown) => (v == null ? null : Number(v));
      const coerceTopic = (t: SurveyTopic): SurveyTopic => ({
        ...t,
        sentiment_score:   coerce(t.sentiment_score),
        effort_score:      coerce(t.effort_score),
        urgency_score:     coerce(t.urgency_score),
        nps_avg:           coerce(t.nps_avg),
        positive_pct:      coerce(t.positive_pct),
        negative_pct:      coerce(t.negative_pct),
        volume_delta_pct:  coerce(t.volume_delta_pct),
        nps_impact:        coerce(t.nps_impact),
        net_sentiment:     coerce(t.net_sentiment),
        driver_score:      coerce(t.driver_score),
        avg_csat:          coerce(t.avg_csat),
        csat_impact:       coerce(t.csat_impact),
        avg_effort_score:  coerce(t.avg_effort_score),
        velocity_pct:      coerce(t.velocity_pct),
        promoter_pct:      coerce(t.promoter_pct),
        detractor_pct:     coerce(t.detractor_pct),
        passive_pct:       coerce(t.passive_pct),
        subtopics:         t.subtopics?.map(coerceTopic),
      } as SurveyTopic);
      const themes = (res.data.themes ?? []).map((theme) => ({
        ...theme,
        topics: (theme.topics ?? []).map(coerceTopic),
      }));
      return { ...res.data, themes };
    },

    getTopicDetail: async (
      surveyId: string,
      topicId: string,
      window = 'all_time',
    ): Promise<{ topic: SurveyTopic; detail: TopicDetail; window: string }> => {
      const res = await http.get<{ topic: SurveyTopic; detail: TopicDetail; window: string }>(
        `/api/insights/${surveyId}/topics/${topicId}/detail?window=${window}`,
      );
      const coerce = (v: unknown) => (v == null ? null : Number(v));
      const coerceTopic = (t: SurveyTopic): SurveyTopic => ({
        ...t,
        sentiment_score:  coerce(t.sentiment_score),
        effort_score:     coerce(t.effort_score),
        urgency_score:    coerce(t.urgency_score),
        nps_avg:          coerce(t.nps_avg),
        positive_pct:     coerce(t.positive_pct),
        negative_pct:     coerce(t.negative_pct),
        volume_delta_pct: coerce(t.volume_delta_pct),
        nps_impact:       coerce(t.nps_impact),
        net_sentiment:    coerce(t.net_sentiment),
        driver_score:     coerce(t.driver_score),
        avg_csat:         coerce(t.avg_csat),
        csat_impact:      coerce(t.csat_impact),
        avg_effort_score: coerce(t.avg_effort_score),
        velocity_pct:     coerce(t.velocity_pct),
        promoter_pct:     coerce(t.promoter_pct),
        detractor_pct:    coerce(t.detractor_pct),
        passive_pct:      coerce(t.passive_pct),
      } as SurveyTopic);
      const raw = res.data;
      return {
        ...raw,
        topic:  raw.topic  ? coerceTopic(raw.topic)  : raw.topic,
        detail: raw.detail ? {
          ...raw.detail,
          subtopics: (raw.detail.subtopics ?? []).map(coerceTopic),
        } : raw.detail,
      };
    },

    getTopicVerbatims: async (
      surveyId: string,
      topicId: string,
      opts: { limit?: number; offset?: number; sentiment?: string; nps_bucket?: string; window?: string } = {},
    ): Promise<{ verbatims: TopicVerbatim[]; total: number; has_more: boolean; limit: number; offset: number }> => {
      const params = new URLSearchParams();
      if (opts.limit)      params.set('limit',      String(opts.limit));
      if (opts.offset)     params.set('offset',     String(opts.offset));
      if (opts.sentiment)  params.set('sentiment',  opts.sentiment);
      if (opts.nps_bucket) params.set('nps_bucket', opts.nps_bucket);
      if (opts.window && opts.window !== 'all_time') params.set('window', opts.window);
      const qs = params.toString();
      const res = await http.get<{ verbatims: TopicVerbatim[]; total: number; has_more: boolean; limit: number; offset: number }>(
        `/api/insights/${surveyId}/topics/${topicId}/verbatims${qs ? '?' + qs : ''}`,
      );
      return res.data;
    },

    renameTopic: async (surveyId: string, topicId: string, name: string): Promise<{ success: boolean; name: string }> => {
      const res = await http.patch<{ success: boolean; name: string }>(
        `/api/insights/${surveyId}/topics/${topicId}`,
        { name },
      );
      return res.data;
    },

    // ── Analytics ──────────────────────────────────────────────────────────────

    getSurveyAnalytics: async (surveyId: string): Promise<{
      total_responses:  number;
      avg_nps:          number | null;
      completion_rate:  number;
      nps_distribution: { promoters: number; passives: number; detractors: number };
      responses_by_day: Array<{ day: string; count: number }>;
    }> => {
      const res = await http.get(`/api/surveys/${surveyId}/analytics`);
      return res.data;
    },

    getOrgAnalytics: async (): Promise<{
      total_surveys:    number;
      active_surveys:   number;
      total_responses:  number;
      avg_nps:          number | null;
      responses_by_day: Array<{ day: string; count: number }>;
      top_surveys:      Array<{ id: string; title: string; response_count: number }>;
    }> => {
      const res = await http.get('/api/orgs/me/analytics');
      return res.data;
    },

    getExperienceOverview: async (): Promise<{
      surveys: Array<{
        id: string; title: string; status: string;
        response_count: number; nps_score: number | null;
        csat_score: number | null; metrics_at: string | null;
      }>;
      portfolio_metrics: {
        nps_score: number | null; csat_score: number | null;
        response_count: number; survey_count: number; captured_at: string;
      } | null;
      active_survey_count: number;
    }> => {
      const res = await http.get('/api/experience/org/overview');
      return res.data;
    },

    // ── Time-series metric history ────────────────────────────────────────────

    getSurveyMetricHistory: async (
      surveyId: string,
      days = 90,
    ): Promise<{ history: MetricSnapshot[]; days: number; survey_id: string }> => {
      const res = await http.get<{ history: MetricSnapshot[]; days: number; survey_id: string }>(
        `/api/insights/${surveyId}/metric-history?days=${days}`,
      );
      return res.data;
    },

    getTopicTrends: async (
      surveyId: string,
      opts: { topicId?: string; weeks?: number } = {},
    ): Promise<{ topics: TopicTrend[]; weeks: number; survey_id: string }> => {
      const params = new URLSearchParams();
      if (opts.weeks)   params.set('weeks',   String(opts.weeks));
      if (opts.topicId) params.set('topicId', opts.topicId);
      const qs = params.toString();
      const res = await http.get<{ topics: TopicTrend[]; weeks: number; survey_id: string }>(
        `/api/insights/${surveyId}/topic-trends${qs ? '?' + qs : ''}`,
      );
      return res.data;
    },

    getOrgMetricHistory: async (
      days = 90,
    ): Promise<{ history: OrgMetricSnapshot[]; days: number; org_id: string }> => {
      const res = await http.get<{ history: OrgMetricSnapshot[]; days: number; org_id: string }>(
        `/api/insights/org/metric-history?days=${days}`,
      );
      return res.data;
    },
  };
}

// Re-export for consumers that import InsightRunStatus from api.ts
export type { InsightRunStatus };

export type ApiClient = ReturnType<typeof createApiClient>;
