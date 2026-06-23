import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import type { UserGroup, GroupType, DynamicRuleSet } from '../lib/api';

export function useGroups() {
  const api = useApi();
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { groups } = await api.listGroups();
      setGroups(groups);
      setError(null);
    } catch (err) {
      setGroups([]);
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const createGroup = useCallback(async (data: {
    name: string; description?: string | null; groupType: GroupType; dynamicRules?: DynamicRuleSet;
  }) => {
    const { group } = await api.createGroup(data);
    await load();
    return group;
  }, [api, load]);

  const deleteGroup = useCallback(async (id: string) => {
    await api.deleteGroup(id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, [api]);

  return { groups, loading, error, reload: load, createGroup, deleteGroup };
}
