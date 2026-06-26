import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

function isValidClerkPublishableKey(key: string): boolean {
  const trimmed = key.trim();
  if (!/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(trimmed)) return false;
  try {
    const encoded = trimmed.replace(/^pk_(test|live)_/, '');
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return decoded.endsWith('$') && decoded.includes('.');
  } catch {
    return false;
  }
}

export default defineConfig(({ mode }) => {
  const appDir = __dirname;
  const repoRoot = path.resolve(__dirname, '..');
  const appEnv = loadEnv(mode, appDir, 'VITE_');
  const rootEnv = loadEnv(mode, repoRoot, '');

  // Monorepo root .env uses CLERK_PUBLISHABLE_KEY; Vite only auto-exposes VITE_* from app/.
  // Bridge so local dev works when backend has CLERK_SECRET_KEY but app/.env.local omits the key.
  const clerkPublishableKey =
    appEnv.VITE_CLERK_PUBLISHABLE_KEY || rootEnv.CLERK_PUBLISHABLE_KEY || '';
  const validClerkKey = clerkPublishableKey && isValidClerkPublishableKey(clerkPublishableKey)
    ? clerkPublishableKey
    : '';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    envDir: appDir,
    ...(validClerkKey
      ? { define: { 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(validClerkKey) } }
      : {}),
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three') || id.includes('@react-three')) return 'vendor-three';
            if (id.includes('node_modules/firebase')) return 'vendor-firebase';
            if (id.includes('@clerk/react')) return 'vendor-clerk';
            if (id.includes('recharts')) return 'vendor-charts';
            if (id.includes('framer-motion')) return 'vendor-motion';
            // Match these before the generic node_modules/react rule (substring would otherwise capture them).
            if (id.includes('reactflow') || id.includes('@reactflow')) return 'vendor-flow';
            if (id.includes('react-grid-layout') || id.includes('react-resizable')) return 'vendor-grid';
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('react-router-dom')) return 'vendor-react';
          },
        },
      },
    },
  };
});
