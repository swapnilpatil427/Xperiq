import { useState, useEffect, useCallback } from 'react';
import type { Insight } from '../types';
import { useApi } from './useApi';

const MOCK_INSIGHTS: Insight = {
  nps_score: 74,
  summary: 'Users experience friction primarily during onboarding. Navigation clarity and documentation gaps are top themes.',
  topics: [
    { name: 'Interface Efficiency', sentiment: 'positive', volume: 342, phrases: ['clean design', 'fast loading', 'intuitive'] },
    { name: 'Revenue Value Gap',    sentiment: 'neutral',  volume: 204, phrases: ['pricing unclear', 'feature parity'] },
    { name: 'Onboarding Velocity',  sentiment: 'negative', volume: 892, phrases: ['too many steps', 'email loop', 'confusing nav'] },
    { name: 'Support Resonance',    sentiment: 'positive', volume: 215, phrases: ['responsive', 'helpful team'] },
  ],
  sentiment_breakdown: { positive: 28, neutral: 31, negative: 41 },
  top_phrases: ['"Too many steps to create project"', '"Confusing interface navigation"', '"Email verification loop"'],
};

export function useInsights(surveyId?: string) {
  const [insights,   setInsights]   = useState<Insight | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const api = useApi();

  const load = useCallback(async () => {
    if (!surveyId) { setInsights(MOCK_INSIGHTS); setLoading(false); return; }
    setLoading(true);
    try {
      const { insights } = await api.getInsights(surveyId);
      setInsights(insights);
    } catch {
      setInsights(MOCK_INSIGHTS);
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
      setInsights(result.insights);
    } finally {
      setGenerating(false);
    }
  }, [surveyId, api]);

  return { insights, loading, generating, regenerate };
}
