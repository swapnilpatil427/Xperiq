import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import type { DepartmentNode } from '../lib/api';

export function useDepartments() {
  const api = useApi();
  const [tree, setTree] = useState<DepartmentNode[]>([]);
  const [flat, setFlat] = useState<DepartmentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { tree, flat } = await api.listDepartments();
      setTree(tree);
      setFlat(flat);
      setError(null);
    } catch (err) {
      setTree([]); setFlat([]);
      setError(err instanceof Error ? err.message : 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const createDepartment = useCallback(async (data: {
    name: string; description?: string | null; parentDepartmentId?: string | null;
  }) => {
    await api.createDepartment(data);
    await load();
  }, [api, load]);

  const deleteDepartment = useCallback(async (id: string) => {
    await api.deleteDepartment(id);
    await load();
  }, [api, load]);

  return { tree, flat, loading, error, reload: load, createDepartment, deleteDepartment };
}
