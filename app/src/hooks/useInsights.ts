import { useState, useEffect, useCallback } from 'react';
import type { Insight } from '../types';
import { useApi } from './useApi';

export function useInsights(surveyId?: string) {
  const [insights,   setInsights]   = useState<Insight | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const api = useApi();

  const load = useCallback(async () => {
    if (!surveyId) { setInsights(null); setLoading(false); return; }
    setLoading(true);
    try {
      const { insights } = await api.getInsights(surveyId);
      setInsights(insights ?? null);
    } catch {
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [surveyId, api]);

  useEffect(() => { load(); }, [load]);

  const regenerate = useCallback(async () => {
    if (!surveyId) return;
    setGenerating(true);
    try {
      const result = await api.analyzeInsights(surveyId);
      setInsights(result.insights ?? null);
    } finally {
      setGenerating(false);
    }
  }, [surveyId, api]);

  return { insights, loading, generating, regenerate };
}
