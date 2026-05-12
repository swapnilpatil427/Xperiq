import { useMemo } from 'react';
import { useAppAuth } from '../lib/auth.jsx';
import { createApiClient } from '../lib/api';

export function useApi() {
  const { getToken } = useAppAuth();
  return useMemo(() => createApiClient(getToken), [getToken]);
}

export { useApi as default };
