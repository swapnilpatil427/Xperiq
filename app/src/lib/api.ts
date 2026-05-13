import type {
  ListSurveysParams, ListSurveysResult, Survey, SurveyResponse,
  Template, Workflow, Insight, OrgProfile, Question,
} from '../types';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/experient-prod/us-central1/api';

export type GetToken = () => Promise<string | null>;

async function request<T = unknown>(
  method: string,
  path: string,
  body: unknown,
  getToken: GetToken | null,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (getToken) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function createApiClient(getToken: GetToken) {
  return {
    // Surveys
    listSurveys: (params: ListSurveysParams = {}) => {
      const qs = new URLSearchParams();
      if (params.q)                      qs.set('q',              params.q);
      if (params.status?.length)         qs.set('status',         params.status.join(','));
      if (params.survey_type_id?.length) qs.set('survey_type_id', params.survey_type_id.join(','));
      if (params.sort_by)                qs.set('sort_by',        params.sort_by);
      if (params.sort_order)             qs.set('sort_order',     params.sort_order);
      if (params.page)                   qs.set('page',           String(params.page));
      if (params.limit)                  qs.set('limit',          String(params.limit));
      const query = qs.toString() ? `?${qs}` : '';
      return request<ListSurveysResult>('GET', `/api/surveys${query}`, null, getToken);
    },
    getSurvey: (id: string) =>
      request<{ survey: Survey }>('GET', `/api/surveys/${id}`, null, getToken),
    createSurvey: (data: Partial<Survey>) =>
      request<{ survey: Survey }>('POST', '/api/surveys', data, getToken),
    updateSurvey: (id: string, data: Partial<Survey>) =>
      request<{ success: boolean }>('PUT', `/api/surveys/${id}`, data, getToken),
    deleteSurvey: (id: string) =>
      request<{ success: boolean }>('DELETE', `/api/surveys/${id}`, null, getToken),
    publishSurvey: (id: string) =>
      request<{ publishToken: string; publishedAt: string }>('POST', `/api/surveys/${id}/publish`, {}, getToken),

    // Responses
    submitResponse: (surveyId: string, data: { answers: unknown[]; publishToken: string }) =>
      request<{ success: boolean; id: string }>('POST', `/api/surveys/${surveyId}/responses`, data, null),
    getResponses: (surveyId: string) =>
      request<{ responses: SurveyResponse[]; total: number }>('GET', `/api/surveys/${surveyId}/responses`, null, getToken),
    getInsights: (surveyId: string) =>
      request<{ insights: Insight }>('GET', `/api/surveys/${surveyId}/insights`, null, getToken),

    // AI
    generateSurvey: (intent: string, surveyTypeId?: string) =>
      request<{ questions: Question[] }>('POST', '/api/ai/generate-survey', { intent, surveyTypeId }, getToken),
    analyzeInsights: (surveyId: string) =>
      request<{ insights: Insight }>('POST', '/api/ai/analyze-insights', { surveyId }, getToken),
    refineSurvey: (questions: Question[], message: string, context: Record<string, unknown>) =>
      request<{ questions: Question[]; explanation?: string }>('POST', '/api/ai/refine-survey', { questions, message, context }, getToken),

    // Templates
    listTemplates: () =>
      request<{ templates: Template[] }>('GET', '/api/templates', null, getToken),
    getTemplate: (id: string) =>
      request<{ template: Template }>('GET', `/api/templates/${id}`, null, getToken),
    createTemplate: (data: Partial<Template>) =>
      request<{ template: Template }>('POST', '/api/templates', data, getToken),
    updateTemplate: (id: string, data: Partial<Template>) =>
      request<{ success: boolean }>('PUT', `/api/templates/${id}`, data, getToken),
    deleteTemplate: (id: string) =>
      request<{ success: boolean }>('DELETE', `/api/templates/${id}`, null, getToken),
    cloneTemplate: (id: string) =>
      request<{ template: Template }>('POST', `/api/templates/${id}/clone`, {}, getToken),

    // Org profile
    getOrgProfile: () =>
      request<{ profile: OrgProfile | null }>('GET', '/api/org-profile', null, getToken),
    updateOrgProfile: (data: Partial<OrgProfile>) =>
      request<{ profile: OrgProfile }>('PUT', '/api/org-profile', data, getToken),

    // Workflows
    listWorkflows: () =>
      request<{ workflows: Workflow[] }>('GET', '/api/workflows', null, getToken),
    createWorkflow: (data: Partial<Workflow>) =>
      request<{ workflow: Workflow }>('POST', '/api/workflows', data, getToken),
    updateWorkflow: (id: string, data: Partial<Workflow>) =>
      request<{ success: boolean }>('PUT', `/api/workflows/${id}`, data, getToken),
    deleteWorkflow: (id: string) =>
      request<{ success: boolean }>('DELETE', `/api/workflows/${id}`, null, getToken),
    toggleWorkflow: (id: string) =>
      request<{ status: string }>('POST', `/api/workflows/${id}/toggle`, {}, getToken),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
