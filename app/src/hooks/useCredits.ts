import { useState, useEffect, useCallback } from 'react';
import { useApi } from './useApi';
import type { CreditBalance, CreditConfig } from '../lib/api';
import { useInvalidation } from '../lib/dataBus';

/**
 * Live credit balance + config. Drives the TopBar credits chip, the Billing page, and
 * pre-action cost hints. Refetches whenever the 'credits' DataBus resource is invalidated
 * (after a spend-cap change, grant, plan change, or a metered AI action).
 */
export function useCredits() {
  const api = useApi();
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [config,  setConfig]  = useState<CreditConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([api.getCredits(), api.getCreditConfig()]);
      setBalance(b);
      setConfig(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load credits');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void reload(); }, [reload]);
  useInvalidation('credits', reload);

  return { balance, config, loading, error, reload };
}

export default useCredits;
