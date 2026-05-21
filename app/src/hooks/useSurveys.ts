import { useState, useEffect, useCallback } from 'react';
import type { Survey } from '../types';
import { useApi } from './useApi';

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
    } catch (err) {
      setSurveys([]);
      setError(err instanceof Error ? err.message : 'Failed to load surveys');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const createSurvey = useCallback(async (data: Partial<Survey>): Promise<Survey> => {
    const result = await api.createSurvey(data);
    await load();
    return result.survey;
  }, [api, load]);

  const updateSurvey = useCallback(async (id: string, data: Partial<Survey>): Promise<void> => {
    setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, ...data, updated_at: new Date().toISOString() } : s)));
    try { await api.updateSurvey(id, data); } catch { /* optimistic — keep UI state even if API fails */ }
  }, [api]);

  const deleteSurvey = useCallback(async (id: string): Promise<void> => {
    setSurveys((prev) => prev.filter((s) => s.id !== id));
    try { await api.deleteSurvey(id); } catch { /* optimistic — UI removal is safe even if API call fails */ }
  }, [api]);

  const publishSurvey = useCallback(async (id: string, settings?: Parameters<typeof api.publishSurvey>[1]): Promise<{ publishToken: string; publishedAt?: string }> => {
    const result = await api.publishSurvey(id, settings);
    setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'active' as const } : s)));
    return result;
  }, [api]);

  return { surveys, loading, error, reload: load, createSurvey, updateSurvey, deleteSurvey, publishSurvey };
}
