import { createContext, useContext, useState, useEffect } from 'react';
import type React from 'react';

interface PageMeta {
  title: string;
  subtitle: string;
}

type PageTitleContextValue = [PageMeta, React.Dispatch<React.SetStateAction<PageMeta>>];

const Ctx = createContext<PageTitleContextValue | null>(null);

interface PageTitleProviderProps {
  children: React.ReactNode;
}

export function PageTitleProvider({ children }: PageTitleProviderProps) {
  const [meta, setMeta] = useState<PageMeta>({ title: '', subtitle: '' });
  return <Ctx.Provider value={[meta, setMeta]}>{children}</Ctx.Provider>;
}

export function useSetPageTitle(title: string, subtitle = '') {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (ctx) ctx[1]({ title, subtitle });
  }, [title, subtitle]);
}

export function usePageTitle(): PageMeta {
  const ctx = useContext(Ctx);
  return ctx ? ctx[0] : { title: '', subtitle: '' };
}
