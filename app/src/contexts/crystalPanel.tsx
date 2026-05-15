import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { SurveyScope } from '../components/SurveyScopePicker';

interface CrystalPanelContextValue {
  isOpen: boolean;
  initialQuery: string;
  scope: SurveyScope;
  openCrystal: (query?: string) => void;
  closeCrystal: () => void;
  toggleCrystal: () => void;
  setScope: (scope: SurveyScope) => void;
}

const CrystalPanelContext = createContext<CrystalPanelContextValue>({
  isOpen: false,
  initialQuery: '',
  scope: 'all',
  openCrystal: () => {},
  closeCrystal: () => {},
  toggleCrystal: () => {},
  setScope: () => {},
});

export function CrystalPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const [scope, setScope] = useState<SurveyScope>('all');

  const openCrystal = useCallback((query = '') => {
    setInitialQuery(query);
    setIsOpen(true);
  }, []);

  const closeCrystal = useCallback(() => setIsOpen(false), []);

  const toggleCrystal = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <CrystalPanelContext.Provider
      value={{ isOpen, initialQuery, scope, openCrystal, closeCrystal, toggleCrystal, setScope }}
    >
      {children}
    </CrystalPanelContext.Provider>
  );
}

export function useCrystalPanel() {
  return useContext(CrystalPanelContext);
}
