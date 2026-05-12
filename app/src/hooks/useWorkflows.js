import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useAppAuth } from '../lib/auth.jsx';
import { getDb, isConfigured } from '../lib/firebase';
import { useApi } from './useApi';

const MOCK_WORKFLOWS = [
  {
    id: 'w1',
    name: 'Critical Alert',
    condition: { field: 'sentiment', operator: '<', value: 'Negative' },
    action: { type: 'email', config: { to: 'support@company.com' } },
    status: 'active',
    triggerCount: 48,
    badge: 'Critical Alert',
    badgeColor: '#b41340',
    iconName: 'bolt',
  },
  {
    id: 'w2',
    name: 'Feature Request Tagging',
    condition: { field: 'topic', operator: '=', value: 'Feature Request' },
    action: { type: 'tag', config: { tag: 'beta-cohort' } },
    status: 'active',
    triggerCount: 156,
    badge: 'Engagement Engine',
    badgeColor: '#8329c8',
    iconName: 'auto_awesome',
  },
  {
    id: 'w3',
    name: 'Retention Watch',
    condition: { field: 'nps', operator: '<', value: '6' },
    action: { type: 'notify', config: { team: 'customer-success' } },
    status: 'paused',
    triggerCount: 12,
    badge: 'Retention Watch',
    badgeColor: '#d97706',
    iconName: 'warning',
  },
];

export function useWorkflows() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const api = useApi();
  const { userId, orgId } = useAppAuth();
  const effectiveOrgId = orgId || userId;

  useEffect(() => {
    if (!effectiveOrgId) return;

    if (!isConfigured()) {
      setWorkflows(MOCK_WORKFLOWS);
      setLoading(false);
      return;
    }

    const db = getDb();
    const q = query(
      collection(db, 'orgs', effectiveOrgId, 'workflows'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setWorkflows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [effectiveOrgId]);

  const createWorkflow = useCallback(
    async (data) => {
      if (!isConfigured()) {
        const mock = { id: `w${Date.now()}`, ...data, status: 'active', triggerCount: 0 };
        setWorkflows((prev) => [mock, ...prev]);
        return mock;
      }
      return api.createWorkflow(data);
    },
    [api]
  );

  const toggleWorkflow = useCallback(
    async (id) => {
      if (!isConfigured()) {
        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === id ? { ...w, status: w.status === 'active' ? 'paused' : 'active' } : w
          )
        );
        return;
      }
      await api.toggleWorkflow(id);
    },
    [api]
  );

  const deleteWorkflow = useCallback(
    async (id) => {
      if (!isConfigured()) {
        setWorkflows((prev) => prev.filter((w) => w.id !== id));
        return;
      }
      await api.deleteWorkflow(id);
    },
    [api]
  );

  return { workflows, loading, createWorkflow, toggleWorkflow, deleteWorkflow };
}
