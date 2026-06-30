import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from './useApi';
import { invalidate, useInvalidation } from '../lib/dataBus';
import type { PrismJob, PrismJobStatus } from '../types/prism';

// Job statuses where polling should continue (the server is still working).
const ACTIVE_STATUSES: PrismJobStatus[] = ['queued', 'running'];
const POLL_INTERVAL_MS = 2500;

/**
 * Loads a single Prism job and polls GET /api/prism/jobs/:id while it is active
 * (queued | running). Stops polling on a terminal/awaiting status. Subscribes to
 * the DataBus so external mutations refresh the job.
 */
export function usePrismJob(jobId: string | undefined) {
  const api = useApi();
  const [job, setJob] = useState<PrismJob | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (): Promise<PrismJob | null> => {
    if (!jobId) return null;
    try {
      const { job } = await api.getPrismJob(jobId);
      setJob(job);
      setError(null);
      return job;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [api, jobId]);

  // Initial load + polling loop driven by the latest job status.
  useEffect(() => {
    let cancelled = false;
    function clearTimer() {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
    async function tick() {
      const next = await load();
      if (cancelled) return;
      if (next && ACTIVE_STATUSES.includes(next.status)) {
        timerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }
    setLoading(true);
    tick();
    return () => { cancelled = true; clearTimer(); };
  }, [load]);

  useInvalidation('prism', () => { load(); });

  // ── Mutations — optimistic where useful, always invalidate so the home gallery
  //    and jobs list refresh. ──────────────────────────────────────────────────
  const refresh = useCallback(async () => { await load(); invalidate('prism'); }, [load]);

  const pause = useCallback(async () => {
    if (!jobId) return;
    try { const { job } = await api.pausePrismJob(jobId); setJob(job); } finally { invalidate('prism'); }
  }, [api, jobId]);

  const resume = useCallback(async () => {
    if (!jobId) return;
    try { const { job } = await api.resumePrismJob(jobId); setJob(job); } finally { invalidate('prism'); }
    load();
  }, [api, jobId, load]);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    try { const { job } = await api.cancelPrismJob(jobId); setJob(job); } finally { invalidate('prism'); }
  }, [api, jobId]);

  return { job, loading, error, reload: load, refresh, pause, resume, cancel };
}
