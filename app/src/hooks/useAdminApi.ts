import { useMemo } from 'react';
import { useAppAuth } from '../lib/auth';
import { createAdminApiClient } from '../lib/adminApi';
import type { AdminApiClient } from '../lib/adminApi';

export function useAdminApi(): AdminApiClient {
  const { getToken } = useAppAuth();
  return useMemo(() => createAdminApiClient(getToken), [getToken]);
}

export { useAdminApi as default };
