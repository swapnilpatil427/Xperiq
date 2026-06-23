import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import type { DirectoryUser, ListUsersParams, UpdateUserPayload } from '../lib/api';

export function useUsers(initial: ListUsersParams = {}) {
  const api = useApi();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params: ListUsersParams = initial) => {
    setLoading(true);
    try {
      const res = await api.listUsers(params);
      setUsers(res.users);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setUsers([]);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => { load(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [load]);

  const updateUser = useCallback(async (userId: string, data: UpdateUserPayload) => {
    const { user } = await api.updateUser(userId, data);
    setUsers((prev) => prev.map((u) => (u.userId === userId ? user : u)));
    return user;
  }, [api]);

  const deleteUser = useCallback(async (userId: string) => {
    await api.deleteUser(userId);
    setUsers((prev) => prev.map((u) => (
      u.userId === userId ? { ...u, isActive: false, status: 'deactivated' as const } : u
    )));
  }, [api]);

  const inviteUser = useCallback(async (payload: { email: string; roleId?: string; jobTitle?: string; departmentId?: string }) => {
    const { user } = await api.inviteUser(payload);
    await load();
    return user;
  }, [api, load]);

  return { users, total, loading, error, reload: load, updateUser, deleteUser, inviteUser };
}
