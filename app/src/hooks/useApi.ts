import { useMemo } from 'react';
import { useAppAuth } from '../lib/auth';
import { createApiClient } from '../lib/api';
import type { ApiClient } from '../lib/api';

export function useApi(): ApiClient {
  const { getToken } = useAppAuth();
  return useMemo(() => createApiClient(getToken), [getToken]);
}

export { useApi as default };
