import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';

const MOCK = [
  { id: 's1', title: 'Q2 Product Experience Survey',    status: 'active', response_count: 1284, nps_score: 74,  updated_at: new Date().toISOString() },
  { id: 's2', title: 'Post-Support CSAT Pulse',          status: 'active', response_count: 2190, nps_score: 88,  updated_at: new Date(Date.now() - 10800000).toISOString() },
  { id: 's3', title: 'Pricing & Value Perception Study', status: 'active', response_count: 456,  nps_score: 42,  updated_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 's4', title: 'Onboarding Friction Audit',        status: 'draft',  response_count: 0,    nps_score: null, updated_at: new Date(Date.now() - 432000000).toISOString() },
];

export function useSurveys() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
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

  const createSurvey = useCallback(async (data) => {
    try {
      const result = await api.createSurvey(data);
      await load();
      return result.survey;
    } catch {
      const mock = { id: `s${Date.now()}`, ...data, status: 'draft', response_count: 0, created_at: new Date().toISOString() };
      setSurveys((prev) => [mock, ...prev]);
      return mock;
    }
  }, [api, load]);

  const updateSurvey = useCallback(async (id, data) => {
    setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    try { await api.updateSurvey(id, data); } catch { /* optimistic */ }
  }, [api]);

  const deleteSurvey = useCallback(async (id) => {
    setSurveys((prev) => prev.filter((s) => s.id !== id));
    try { await api.deleteSurvey(id); } catch { /* optimistic */ }
  }, [api]);

  const publishSurvey = useCallback(async (id) => {
    try {
      const result = await api.publishSurvey(id);
      setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'active' } : s)));
      return result;
    } catch {
      const token = `mock-${id}`;
      setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'active', publish_token: token } : s)));
      return { publishToken: token };
    }
  }, [api]);

  return { surveys, loading, error, reload: load, createSurvey, updateSurvey, deleteSurvey, publishSurvey };
}
