import { initSentry } from './lib/sentry';
initSentry(); // must be first — catches errors thrown during later imports

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AppAuthProvider } from './lib/auth.tsx';
import { loadBrandTheme } from './lib/brandTheme';
import { resolveClerkPublishableKey } from './lib/clerkConfig';

// Restore persisted brand theme before first render so there's no flash
loadBrandTheme();

const CLERK_KEY = resolveClerkPublishableKey();

if (!CLERK_KEY && !import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
  console.warn('[Experient] No VITE_CLERK_PUBLISHABLE_KEY — running in dev mode. All routes accessible as dev-user/dev-org. Set VITE_CLERK_PUBLISHABLE_KEY for real auth.');
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      {CLERK_KEY ? (
        <ClerkProvider publishableKey={CLERK_KEY}>
          <AppAuthProvider hasClerk={true}>
            <App />
          </AppAuthProvider>
        </ClerkProvider>
      ) : (
        <AppAuthProvider hasClerk={false}>
          <App />
        </AppAuthProvider>
      )}
    </BrowserRouter>
  </StrictMode>
);
