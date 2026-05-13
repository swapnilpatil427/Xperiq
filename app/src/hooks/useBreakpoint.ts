import { useState, useEffect } from 'react';
import type { Breakpoint } from '../types';

function getBreakpoint(w: number): Breakpoint {
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => getBreakpoint(window.innerWidth));
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setBp(getBreakpoint(e.contentRect.width)));
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);
  return bp;
}
