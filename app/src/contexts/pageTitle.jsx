import { createContext, useContext, useState, useEffect } from 'react';

const Ctx = createContext(null);

export function PageTitleProvider({ children }) {
  const [meta, setMeta] = useState({ title: '', subtitle: '' });
  return <Ctx.Provider value={[meta, setMeta]}>{children}</Ctx.Provider>;
}

export function useSetPageTitle(title, subtitle = '') {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (ctx) ctx[1]({ title, subtitle });
  }, [title, subtitle]);
}

export function usePageTitle() {
  const ctx = useContext(Ctx);
  return ctx ? ctx[0] : { title: '', subtitle: '' };
}
