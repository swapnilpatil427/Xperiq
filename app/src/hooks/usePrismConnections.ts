import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import { useInvalidation } from '../lib/dataBus';
import type { PrismConnection, PrismJob } from '../types/prism';

/**
 * Loads Prism connections + recent jobs (REST + local state). Subscribes to the
 * DataBus so a Crystal-driven or wizard-driven import refreshes the home gallery.
 */
export function usePrismConnections() {
  const api = useApi();
  const [connections, setConnections] = useState<PrismConnection[]>([]);
  const [jobs, setJobs] = useState<PrismJob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [connRes, jobRes] = await Promise.all([
        api.listPrismConnections(),
        api.listPrismJobs(),
      ]);
      setConnections(connRes.connections ?? []);
      setJobs(jobRes.jobs ?? []);
      setError(null);
    } catch (err) {
      // Tolerate the Prism service not being up yet — show an empty gallery.
      setConnections([]);
      setJobs([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);
  useInvalidation('prism', load);

  const deleteConnection = useCallback(async (id: string): Promise<void> => {
    setConnections((prev) => prev.filter((c) => c.id !== id));
    try { await api.deletePrismConnection(id); } catch { load(); }
  }, [api, load]);

  return { connections, jobs, loading, error, reload: load, deleteConnection };
}
