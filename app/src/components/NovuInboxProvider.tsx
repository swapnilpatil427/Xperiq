import { useState, useEffect } from 'react';
import { Inbox } from '@novu/react';
import { useApi } from '../hooks/useApi';

interface Props { userId: string; orgId: string; }

export function NovuInboxProvider({ userId, orgId }: Props) {
  const appId = import.meta.env.VITE_NOVU_APP_ID;
  const api = useApi();
  const [subscriberHash, setSubscriberHash] = useState<string | undefined>(undefined);

  // orgId is available for future use (e.g. tenant-scoped subscriber HMAC)
  void orgId;

  useEffect(() => {
    if (!appId || !userId) return;
    (api as unknown as { get: (url: string) => Promise<{ data: { hash: string } }> })
      .get('/api/crystal-novu/subscriber-hash')
      .then((res) => setSubscriberHash(res.data.hash))
      .catch(() => {}); // non-fatal — falls back to unhashed mode
  }, [userId, appId, api]);

  if (!appId || !userId) return null;

  return (
    <Inbox
      applicationIdentifier={appId}
      subscriberId={userId}
      subscriberHash={subscriberHash}
      appearance={{
        variables: {
          colorPrimary: '#2a4bd9',
          colorForeground: '#1a1a2e',
        },
      }}
    />
  );
}
