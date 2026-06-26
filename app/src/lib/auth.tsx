import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import type { GetToken } from './api';

interface AppAuthContextValue {
  userId: string | null;
  orgId: string | null;
  getToken: GetToken;
  isSignedIn: boolean;
  isLoaded: boolean;
  signOut: () => Promise<void>;
}

const AppAuthContext = createContext<AppAuthContextValue>({
  userId: null,
  orgId: null,
  getToken: async () => null,
  isSignedIn: false,
  isLoaded: false,
  signOut: async () => {},
});

export function useAppAuth() {
  return useContext(AppAuthContext);
}

function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { userId, orgId, getToken, isSignedIn, isLoaded } = useAuth();
  const { signOut } = useClerk();
  // Pre-warm: call getToken() once after Clerk loads so the JWT is cached
  // before any page makes its first API call. Without this, the first batch
  // of requests (surveys, orgs/me, org-profile) fires before Clerk has fetched
  // the JWT from its servers, getToken() returns null, and the backend 401s.
  const [tokenWarmed, setTokenWarmed] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setTokenWarmed(true); return; }
    let active = true;
    (async () => {
      let token = await getToken();
      if (!token) token = await getToken({ skipCache: true });
      if (active) setTokenWarmed(true);
    })();
    return () => { active = false; };
  }, [isLoaded, isSignedIn, getToken]);

  return (
    <AppAuthContext.Provider
      value={{
        userId: userId ?? null,
        orgId: orgId ?? null,
        getToken,
        isSignedIn: isSignedIn ?? false,
        isLoaded: isLoaded && tokenWarmed,
        signOut,
      }}
    >
      {children}
    </AppAuthContext.Provider>
  );
}

export function AppAuthProvider({
  children,
  hasClerk,
}: {
  children: React.ReactNode;
  hasClerk: boolean;
}) {
  if (hasClerk) {
    return <ClerkAuthBridge>{children}</ClerkAuthBridge>;
  }
  return (
    <AppAuthContext.Provider
      value={{
        userId: 'demo-user',
        orgId: null,
        getToken: async () => null,
        isSignedIn: true,
        isLoaded: true,
        signOut: async () => {},
      }}
    >
      {children}
    </AppAuthContext.Provider>
  );
}
