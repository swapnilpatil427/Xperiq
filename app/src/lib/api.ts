import axios from 'axios';
import type {
  ListSurveysParams, ListSurveysResult, Survey, SurveyResponse,
  Template, Workflow, Insight, OrgProfile, Question, Org, OrgMember,
  CopilotChange,
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
  status:           'running' | 'completed' | 'failed' | 'waiting_approval';
  stream_events:    StreamEvent[];
  qc_score?:        number;
  compliance_risk?: string;
  questions?:       Question[];
  recommendations:  Recommendation[];
  credit_summary:   Record<string, unknown>;
  error?:           string;
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
  questions:     Question[];
  explanation:   string;
  response_type: 'edit' | 'answer';
  changes:       CopilotChange[];
  suggestions:   string[];
}

export interface QuestionsResult {
  questions: Question[];
  message:   string;
  changes:   Record<string, unknown>[];
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

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/experient-prod/us-central1/api';

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
    publishSurvey: async (id: string) => {
      const res = await http.post<{ publishToken: string; publishedAt: string }>(`/api/surveys/${id}/publish`, {});
      return res.data;
    },

    // Responses
    submitResponse: async (surveyId: string, data: { answers: unknown[]; publishToken: string }) => {
      const publicHttp = axios.create({ baseURL: BASE });
      const res = await publicHttp.post<{ success: boolean; id: string }>(`/api/surveys/${surveyId}/responses`, data);
      return res.data;
    },
    getResponses: async (surveyId: string) => {
      const res = await http.get<{ responses: SurveyResponse[]; total: number }>(`/api/surveys/${surveyId}/responses`);
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
