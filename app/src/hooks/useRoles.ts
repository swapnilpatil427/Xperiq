import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import type { DirectoryRole, PermissionScope } from '../lib/api';

export function useRoles() {
  const api = useApi();
  const [roles, setRoles] = useState<DirectoryRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { roles } = await api.listRoles();
      setRoles(roles);
      setError(null);
    } catch (err) {
      setRoles([]);
      setError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const createRole = useCallback(async (data: {
    name: string; description?: string; permissions: Record<string, PermissionScope>;
    seatWeight?: number; color?: string;
  }) => {
    const { role } = await api.createRole(data);
    await load();
    return role;
  }, [api, load]);

  const deleteRole = useCallback(async (id: string) => {
    await api.deleteRole(id);
    setRoles((prev) => prev.filter((r) => r.id !== id));
  }, [api]);

  return { roles, loading, error, reload: load, createRole, deleteRole };
}
