import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { SurveyScope } from '../components/SurveyScopePicker';

export interface CrystalCtx {
  window?: 'all_time' | '30d' | '7d';
  focused_topic?: string;
}

interface CrystalPanelContextValue {
  isOpen: boolean;
  initialQuery: string;
  crystalCtx: CrystalCtx;
  scope: SurveyScope;
  openCrystal: (query?: string, ctx?: CrystalCtx) => void;
  closeCrystal: () => void;
  toggleCrystal: () => void;
  setScope: (scope: SurveyScope) => void;
  setCrystalCtx: (ctx: CrystalCtx) => void;
}

const CrystalPanelContext = createContext<CrystalPanelContextValue>({
  isOpen: false,
  initialQuery: '',
  crystalCtx: {},
  scope: 'all',
  openCrystal: () => {},
  closeCrystal: () => {},
  toggleCrystal: () => {},
  setScope: () => {},
  setCrystalCtx: () => {},
});

export function CrystalPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const [scope, setScope] = useState<SurveyScope>('all');
  const [crystalCtx, setCrystalCtx] = useState<CrystalCtx>({});

  const openCrystal = useCallback((query = '', ctx?: CrystalCtx) => {
    setInitialQuery(query);
    if (ctx) setCrystalCtx(ctx);
    setIsOpen(true);
  }, []);

  const closeCrystal = useCallback(() => setIsOpen(false), []);

  const toggleCrystal = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <CrystalPanelContext.Provider
      value={{ isOpen, initialQuery, crystalCtx, scope, openCrystal, closeCrystal, toggleCrystal, setScope, setCrystalCtx }}
    >
      {children}
    </CrystalPanelContext.Provider>
  );
}

export function useCrystalPanel() {
  return useContext(CrystalPanelContext);
}
