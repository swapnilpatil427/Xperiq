import { useState, useEffect, useCallback } from 'react';
import type { Insight } from '../types';
import { useApi } from './useApi';

export type PageState = 'collecting' | 'generating' | 'ready' | 'stale' | 'error';

const MIN_RESPONSES_FOR_INSIGHTS = 10;
// If this many new responses have arrived since the last pipeline run, insights are stale
const STALE_RESPONSE_THRESHOLD   = 20;

export function computePageState(
  insights: Insight | null,
  generating: boolean,
  responseCount: number,
): PageState {
  if (generating) return 'generating';
  if (!insights) {
    return responseCount < MIN_RESPONSES_FOR_INSIGHTS ? 'collecting' : 'stale';
  }
  const insightCount = insights.response_count ?? 0;
  if (responseCount - insightCount >= STALE_RESPONSE_THRESHOLD) return 'stale';
  return 'ready';
}

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
