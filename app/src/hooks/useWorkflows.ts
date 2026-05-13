import { useState, useEffect, useCallback } from 'react';
import type { Workflow } from '../types';
import { useApi } from './useApi';

const MOCK_WORKFLOWS: Workflow[] = [
  { id: 'w1', name: 'Critical Alert',         condition: { field:'sentiment',operator:'=',value:'Negative' }, action: { type:'email',  config:{ to:'support@company.com' } },  status: 'active', trigger_count: 48  },
  { id: 'w2', name: 'Feature Request Tagger', condition: { field:'topic',   operator:'=',value:'Feature Request' }, action: { type:'tag',    config:{ tag:'feature-request' } },  status: 'active', trigger_count: 156 },
  { id: 'w3', name: 'Retention Watch',        condition: { field:'nps',     operator:'<',value:'6' },           action: { type:'notify', config:{ team:'customer-success' } }, status: 'paused', trigger_count: 12  },
];

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading,   setLoading]   = useState<boolean>(true);
  const api = useApi();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { workflows } = await api.listWorkflows();
      setWorkflows(workflows);
    } catch {
      setWorkflows(MOCK_WORKFLOWS);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const createWorkflow = useCallback(async (data: Partial<Workflow>): Promise<Workflow> => {
    try {
      const result = await api.createWorkflow(data);
      setWorkflows((prev) => [result.workflow, ...prev]);
      return result.workflow;
    } catch {
      const mock: Workflow = { id: `w${Date.now()}`, name: '', condition: {}, action: {}, status: 'active', trigger_count: 0, ...data } as Workflow;
      setWorkflows((prev) => [mock, ...prev]);
      return mock;
    }
  }, [api]);

  const toggleWorkflow = useCallback(async (id: string): Promise<void> => {
    setWorkflows((prev) =>
      prev.map((w) => w.id === id ? { ...w, status: (w.status === 'active' ? 'paused' : 'active') as Workflow['status'] } : w)
    );
    try { await api.toggleWorkflow(id); } catch { /* optimistic */ }
  }, [api]);

  const deleteWorkflow = useCallback(async (id: string): Promise<void> => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    try { await api.deleteWorkflow(id); } catch { /* optimistic */ }
  }, [api]);

  return { workflows, loading, createWorkflow, toggleWorkflow, deleteWorkflow };
}
