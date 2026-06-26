// Admin Crystal API — skill browser, brand signals, DLQ, capability gaps.
// Consumed via createAdminApiClient(getToken), mirroring the pattern in api.ts.

import axios from 'axios';
import type { GetToken } from './api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SkillSource = 'global' | 'brand';
export type SkillHealth = 'healthy' | 'attention' | 'failing';

export interface SkillListItem {
  name:           string;
  version:        string;
  source:         SkillSource;
  queries_30d:    number;
  avg_eval_score: number;
  neg_rate:       number;
  p50_ms:         number;
  health:         SkillHealth;
}

export interface QualityTrendPoint {
  date:           string;
  avg_eval_score: number;
  query_count:    number;
}

export interface TopQuery {
  query:          string;
  eval_score:     number;
  occurred_at:    string;
}

export interface EvalCriterionResult {
  name:           string;
  score:          number;
  method:         'structural' | 'llm_judge' | 'regex';
}

export interface SkillVariant {
  variant:        string;
  rollout_pct:    number;
  pass_rate:      number;
  neg_rate:       number;
  created_at:     string;
  is_current:     boolean;
}

export interface SkillDetail {
  name:           string;
  version:        string;
  source:         SkillSource;
  model:          string;
  health:         SkillHealth;
  avg_eval_score: number;
  neg_rate:       number;
  p50_ms:         number;
  queries_30d:    number;
  quality_trend:  QualityTrendPoint[];
  top_queries:    TopQuery[];
  eval_criteria:  EvalCriterionResult[];
}

export interface SkillExample {
  id:             string;
  input:          string;
  output_snippet: string;
  eval_score:     number;
  org_id_hash:    string;
  created_at:     string;
}

export interface SkillExamplesResponse {
  examples:       SkillExample[];
  total:          number;
  limit:          number;
  offset:         number;
}

export interface SkillVariantsResponse {
  variants:       SkillVariant[];
}

export interface GraduationResult {
  success:        boolean;
  rolled_back_from: string;
  new_current:    string;
}

// ── Brand signals ─────────────────────────────────────────────────────────────

export type SignalType   = 'feature_request' | 'bug' | 'complaint';
export type SignalStatus = 'open' | 'in_progress' | 'resolved';
export type SignalSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SignalFilters {
  type?:   SignalType;
  status?: SignalStatus;
  limit?:  number;
  offset?: number;
}

export interface BrandSignal {
  id:          string;
  brand_id:    string;
  title:       string;
  type:        SignalType;
  severity:    SignalSeverity;
  vote_count:  number;
  status:      SignalStatus;
  created_at:  string;
}

export interface BrandSignalsResponse {
  signals:     BrandSignal[];
  total:       number;
}

export interface SignalsSummary {
  open:        number;
  in_progress: number;
  resolved:    number;
  total:       number;
}

export interface BrandQualityMetrics {
  brand_id:       string;
  avg_eval_score: number;
  neg_rate:       number;
  total_queries:  number;
  healthy_skills: number;
  flagged_skills: number;
  failing_skills: number;
}

// ── DLQ ──────────────────────────────────────────────────────────────────────

export interface DlqEntry {
  id:          string;
  survey_id:   string;
  org_id:      string;
  tier:        string;
  payload:     Record<string, unknown>;
  error:       string;
  failed_at:   string;
  retry_count: number;
}

// ── Capability gaps ───────────────────────────────────────────────────────────

export interface CapabilityGap {
  id:                string;
  query_pattern:     string;
  count:             number;
  best_match_skill:  string | null;
  best_match_score:  number | null;
  first_seen:        string;
  last_seen:         string;
}

// ── Client factory ────────────────────────────────────────────────────────────

function createAxiosInstance(getToken: GetToken) {
  const instance = axios.create({ baseURL: BASE });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance.interceptors.request.use(async (config: any) => {
    const token = await getToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  });
  instance.interceptors.response.use(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res: any) => res,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any) => {
      const message =
        err.response?.data?.error ||
        err.response?.statusText ||
        `HTTP ${err.response?.status}` ||
        err.message;
      return Promise.reject(new Error(message));
    },
  );
  return instance;
}

export function createAdminApiClient(getToken: GetToken) {
  const http = createAxiosInstance(getToken);

  return {
    // ── Skill admin ─────────────────────────────────────────────────────────

    getAdminSkills: async (params?: {
      brand_id?: string;
      source?: 'global' | 'brand' | 'all';
      health?: 'healthy' | 'attention' | 'failing' | 'all';
    }): Promise<SkillListItem[]> => {
      const qs = new URLSearchParams();
      if (params?.brand_id) qs.set('brand_id', params.brand_id);
      if (params?.source)   qs.set('source', params.source);
      if (params?.health)   qs.set('health', params.health);
      const res = await http.get<SkillListItem[]>(
        `/api/admin/skills${qs.toString() ? `?${qs}` : ''}`,
      );
      return res.data;
    },

    getAdminSkill: async (name: string, brand_id?: string): Promise<SkillDetail> => {
      const qs = brand_id ? `?brand_id=${encodeURIComponent(brand_id)}` : '';
      const res = await http.get<SkillDetail>(`/api/admin/skills/${encodeURIComponent(name)}${qs}`);
      return res.data;
    },

    getAdminSkillExamples: async (
      name: string,
      limit = 20,
      offset = 0,
    ): Promise<SkillExamplesResponse> => {
      const res = await http.get<SkillExamplesResponse>(
        `/api/admin/skills/${encodeURIComponent(name)}/examples?limit=${limit}&offset=${offset}&sort=eval_score_desc`,
      );
      return res.data;
    },

    deleteAdminSkillExamples: async (name: string, ids: string[]): Promise<void> => {
      await http.delete(`/api/admin/skills/${encodeURIComponent(name)}/examples`, {
        data: { ids },
      });
    },

    getAdminSkillVariants: async (name: string): Promise<SkillVariantsResponse> => {
      const res = await http.get<SkillVariantsResponse>(
        `/api/admin/skills/${encodeURIComponent(name)}/variants`,
      );
      return res.data;
    },

    graduateSkillVariant: async (name: string, variant: string): Promise<GraduationResult> => {
      const res = await http.post<GraduationResult>(
        `/api/admin/skills/${encodeURIComponent(name)}/variants/${encodeURIComponent(variant)}/graduate`,
        {},
      );
      return res.data;
    },

    rollbackSkillVariant: async (name: string, variant: string): Promise<void> => {
      await http.post(
        `/api/admin/skills/${encodeURIComponent(name)}/variants/${encodeURIComponent(variant)}/rollback`,
        {},
      );
    },

    // ── Brand signals ────────────────────────────────────────────────────────

    getBrandSignals: async (
      brandId: string,
      params?: SignalFilters,
    ): Promise<BrandSignalsResponse> => {
      const qs = new URLSearchParams();
      if (params?.type)             qs.set('type', params.type);
      if (params?.status)           qs.set('status', params.status);
      if (params?.limit != null)    qs.set('limit', String(params.limit));
      if (params?.offset != null)   qs.set('offset', String(params.offset));
      const res = await http.get<BrandSignalsResponse>(
        `/api/admin/brands/${encodeURIComponent(brandId)}/signals${qs.toString() ? `?${qs}` : ''}`,
      );
      return res.data;
    },

    getBrandSignalsSummary: async (brandId: string): Promise<SignalsSummary> => {
      const res = await http.get<SignalsSummary>(
        `/api/admin/brands/${encodeURIComponent(brandId)}/signals/summary`,
      );
      return res.data;
    },

    updateSignalStatus: async (
      brandId: string,
      signalId: string,
      status: SignalStatus,
    ): Promise<void> => {
      await http.patch(
        `/api/admin/brands/${encodeURIComponent(brandId)}/signals/${encodeURIComponent(signalId)}`,
        { status },
      );
    },

    getBrandCrystalQuality: async (brandId: string): Promise<BrandQualityMetrics> => {
      const res = await http.get<BrandQualityMetrics>(
        `/api/admin/brands/${encodeURIComponent(brandId)}/crystal/quality`,
      );
      return res.data;
    },

    // ── DLQ ─────────────────────────────────────────────────────────────────

    getDlqEntries: async (): Promise<DlqEntry[]> => {
      const res = await http.get<{ entries: DlqEntry[] }>('/api/admin/dlq');
      return res.data.entries;
    },

    replayDlq: async (): Promise<{ replayed: number }> => {
      const res = await http.post<{ replayed: number }>('/api/admin/dlq/replay', {});
      return res.data;
    },

    // ── Capability gaps ──────────────────────────────────────────────────────

    getCapabilityGaps: async (): Promise<CapabilityGap[]> => {
      const res = await http.get<{ gaps: CapabilityGap[] }>('/api/admin/crystal/gaps');
      return res.data.gaps;
    },
  };
}

export type AdminApiClient = ReturnType<typeof createAdminApiClient>;
