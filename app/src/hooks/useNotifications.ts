import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from './useApi';
import type { Notification } from '../lib/api';

const POLL_INTERVAL_MS = 30_000;

export function useNotifications() {
  const api = useApi();
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading,       setLoading]       = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await api.getUnreadCount();
      setUnreadCount(count);
    } catch {
      // silently ignore — bell badge is non-critical
    }
  }, [api]);

  // Load full notification list (called when sheet opens)
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getNotifications();
      setNotifications(list);
      setUnreadCount(0);
    } catch {
      // keep stale list
    } finally {
      setLoading(false);
    }
  }, [api]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    try { await api.markNotificationRead(id); } catch { /* ignore */ }
  }, [api]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try { await api.markAllNotificationsRead(); } catch { /* ignore */ }
  }, [api]);

  // Poll unread count in background
  useEffect(() => {
    fetchUnreadCount();
    pollRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchUnreadCount]);

  return { unreadCount, notifications, loading, loadNotifications, markRead, markAllRead };
}
