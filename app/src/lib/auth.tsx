import { createContext, useContext } from 'react';
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
  return (
    <AppAuthContext.Provider
      value={{
        userId: userId ?? null,
        orgId: orgId ?? null,
        getToken,
        isSignedIn: isSignedIn ?? false,
        isLoaded: isLoaded ?? false,
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
