import { useState, useEffect } from 'react';

function getBreakpoint(w) {
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

export function useBreakpoint() {
  const [bp, setBp] = useState(() => getBreakpoint(window.innerWidth));
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setBp(getBreakpoint(e.contentRect.width)));
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);
  return bp;
}
