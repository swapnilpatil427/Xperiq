import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useAppAuth } from '../lib/auth.jsx';
import { getDb, isConfigured } from '../lib/firebase';
import { useApi } from './useApi';

// Mock data for when Firebase is not configured
const MOCK = [
  {
    id: 's1',
    title: 'Q2 Product Experience Survey',
    status: 'active',
    responseCount: 1284,
    npsScore: 74,
    updatedAt: new Date().toISOString(),
    topics: ['Onboarding', 'Performance'],
    sentiment: 'positive',
  },
  {
    id: 's2',
    title: 'Pricing & Value Perception Study',
    status: 'active',
    responseCount: 456,
    npsScore: 42,
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    topics: ['Pricing', 'ROI'],
    sentiment: 'neutral',
  },
  {
    id: 's3',
    title: 'Post-Support CSAT Pulse',
    status: 'active',
    responseCount: 2190,
    npsScore: 88,
    updatedAt: new Date(Date.now() - 10800000).toISOString(),
    topics: ['Support Quality'],
    sentiment: 'positive',
  },
  {
    id: 's4',
    title: 'Enterprise Onboarding Friction Audit',
    status: 'draft',
    responseCount: 0,
    npsScore: null,
    updatedAt: new Date(Date.now() - 432000000).toISOString(),
    topics: ['Onboarding'],
    sentiment: null,
  },
];

export function useSurveys() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const api = useApi();
  const { userId, orgId } = useAppAuth();
  const effectiveOrgId = orgId || userId;

  useEffect(() => {
    if (!effectiveOrgId) return;

    if (!isConfigured()) {
      setSurveys(MOCK);
      setLoading(false);
      return;
    }

    // Real-time Firestore subscription
    const db = getDb();
    const q = query(
      collection(db, 'orgs', effectiveOrgId, 'surveys'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setSurveys(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            createdAt: d.data().createdAt?.toDate?.()?.toISOString(),
            updatedAt: d.data().updatedAt?.toDate?.()?.toISOString(),
          }))
        );
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsub;
  }, [effectiveOrgId]);

  const createSurvey = useCallback(
    async (data) => {
      if (!isConfigured()) {
        const mock = {
          id: `s${Date.now()}`,
          ...data,
          status: 'draft',
          responseCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setSurveys((prev) => [mock, ...prev]);
        return mock;
      }
      return api.createSurvey(data);
    },
    [api]
  );

  const updateSurvey = useCallback(
    async (id, data) => {
      if (!isConfigured()) {
        setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
        return;
      }
      return api.updateSurvey(id, data);
    },
    [api]
  );

  const deleteSurvey = useCallback(
    async (id) => {
      if (!isConfigured()) {
        setSurveys((prev) => prev.filter((s) => s.id !== id));
        return;
      }
      await api.deleteSurvey(id);
    },
    [api]
  );

  const publishSurvey = useCallback(
    async (id) => {
      if (!isConfigured()) {
        const token = `mock-token-${id}`;
        setSurveys((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: 'active', publishToken: token } : s))
        );
        return { publishToken: token };
      }
      return api.publishSurvey(id);
    },
    [api]
  );

  return { surveys, loading, error, createSurvey, updateSurvey, deleteSurvey, publishSurvey };
}
