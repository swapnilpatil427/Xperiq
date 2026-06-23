import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import type { AlertEvent, AlertRule } from '../lib/api';

export function useAlerts() {
  const api = useApi();
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ events }, { rules }] = await Promise.all([
        api.listAlertEvents({ status: 'active' }),
        api.listAlertRules(),
      ]);
      setEvents(events);
      setRules(rules);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts');
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const act = useCallback(async (id: string, action: 'acknowledge' | 'resolve' | 'snooze', hours = 24) => {
    if (action === 'acknowledge') await api.acknowledgeAlert(id);
    else if (action === 'resolve') await api.resolveAlert(id);
    else await api.snoozeAlert(id, hours);
    // Active list drops the event once it leaves 'active'.
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, [api]);

  const createRule = useCallback(async (data: Parameters<ReturnType<typeof useApi>['createAlertRule']>[0]) => {
    await api.createAlertRule(data);
    await load();
  }, [api, load]);

  const deleteRule = useCallback(async (id: string) => {
    await api.deleteAlertRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, [api]);

  return { events, rules, loading, error, reload: load, act, createRule, deleteRule };
}
