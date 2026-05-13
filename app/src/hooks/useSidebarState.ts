import { useState, useCallback } from 'react';

const KEY = 'sidenav_expanded';

export function useSidebarState() {
  const [isExpanded, setIsExpanded] = useState(() => {
    try { return localStorage.getItem(KEY) !== 'false'; }
    catch { return true; }
  });

  const toggle = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem(KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const setExpanded = useCallback((val: boolean) => {
    setIsExpanded(val);
    try { localStorage.setItem(KEY, String(val)); } catch {}
  }, []);

  return { isExpanded, toggle, setExpanded };
}
