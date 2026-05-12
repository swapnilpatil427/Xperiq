import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useAppAuth } from '../lib/auth.jsx';
import { getDb, isConfigured } from '../lib/firebase';
import { useApi } from './useApi';

const MOCK_INSIGHTS = {
  npsScore: 74,
  summary:
    'Users experience friction primarily during onboarding. Navigation clarity and documentation gaps are top themes.',
  topics: [
    {
      name: 'Interface Efficiency',
      sentiment: 'positive',
      volume: 342,
      phrases: ['clean design', 'fast loading', 'intuitive'],
    },
    {
      name: 'Revenue Value Gap',
      sentiment: 'neutral',
      volume: 204,
      phrases: ['pricing unclear', 'feature parity'],
    },
    {
      name: 'Onboarding Velocity',
      sentiment: 'negative',
      volume: 892,
      phrases: ['too many steps', 'email loop', 'confusing nav'],
    },
    {
      name: 'Support Resonance',
      sentiment: 'positive',
      volume: 215,
      phrases: ['responsive', 'helpful team'],
    },
  ],
  sentimentBreakdown: { positive: 28, neutral: 31, negative: 41 },
  topPhrases: [
    '"Too many steps to create project"',
    '"Confusing interface navigation"',
    '"Email verification loop"',
  ],
};

export function useInsights(surveyId) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const api = useApi();
  const { userId, orgId } = useAppAuth();
  const effectiveOrgId = orgId || userId;

  useEffect(() => {
    if (!surveyId || !effectiveOrgId) {
      setInsights(MOCK_INSIGHTS);
      setLoading(false);
      return;
    }

    if (!isConfigured()) {
      setInsights(MOCK_INSIGHTS);
      setLoading(false);
      return;
    }

    const db = getDb();
    const q = query(
      collection(db, 'orgs', effectiveOrgId, 'surveys', surveyId, 'insights'),
      orderBy('generatedAt', 'desc'),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) setInsights({ id: snap.docs[0].id, ...snap.docs[0].data() });
      else setInsights(MOCK_INSIGHTS);
      setLoading(false);
    });

    return unsub;
  }, [surveyId, effectiveOrgId]);

  const regenerate = useCallback(async () => {
    if (!surveyId || !isConfigured()) return;
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
