import { useState, useEffect, useCallback } from 'react';
import type { Survey } from '../types';
import { useApi } from './useApi';

const MOCK: Survey[] = [
  { id: 's1', org_id: '', title: 'Q2 Product Experience Survey',    status: 'active', questions: [], response_count: 1284, nps_score: 74,  created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 's2', org_id: '', title: 'Post-Support CSAT Pulse',          status: 'active', questions: [], response_count: 2190, nps_score: 88,  created_at: new Date().toISOString(), updated_at: new Date(Date.now() - 10800000).toISOString() },
  { id: 's3', org_id: '', title: 'Pricing & Value Perception Study', status: 'active', questions: [], response_count: 456,  nps_score: 42,  created_at: new Date().toISOString(), updated_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 's4', org_id: '', title: 'Onboarding Friction Audit',        status: 'draft',  questions: [], response_count: 0,    nps_score: null, created_at: new Date().toISOString(), updated_at: new Date(Date.now() - 432000000).toISOString() },
];

export function useSurveys() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);
  const api = useApi();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { surveys } = await api.listSurveys();
      setSurveys(surveys);
      setError(null);
    } catch {
      setSurveys(MOCK);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const createSurvey = useCallback(async (data: Partial<Survey>): Promise<Survey> => {
    try {
      const result = await api.createSurvey(data);
      await load();
      return result.survey;
    } catch {
      const mock: Survey = { id: `s${Date.now()}`, org_id: '', questions: [], status: 'draft', response_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...data } as Survey;
      setSurveys((prev) => [mock, ...prev]);
      return mock;
    }
  }, [api, load]);

  const updateSurvey = useCallback(async (id: string, data: Partial<Survey>): Promise<void> => {
    setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, ...data, updated_at: new Date().toISOString() } : s)));
    try { await api.updateSurvey(id, data); } catch { /* optimistic */ }
  }, [api]);

  const deleteSurvey = useCallback(async (id: string): Promise<void> => {
    setSurveys((prev) => prev.filter((s) => s.id !== id));
    try { await api.deleteSurvey(id); } catch { /* optimistic */ }
  }, [api]);

  const publishSurvey = useCallback(async (id: string): Promise<{ publishToken: string; publishedAt?: string }> => {
    try {
      const result = await api.publishSurvey(id);
      setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'active' as const } : s)));
      return result;
    } catch {
      const token = `mock-${id}`;
      setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'active' as const, publish_token: token } : s)));
      return { publishToken: token };
    }
  }, [api]);

  return { surveys, loading, error, reload: load, createSurvey, updateSurvey, deleteSurvey, publishSurvey };
}
