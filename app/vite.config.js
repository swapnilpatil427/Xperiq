import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'vendor-three';
          if (id.includes('node_modules/firebase')) return 'vendor-firebase';
          if (id.includes('@clerk/react')) return 'vendor-clerk';
          if (id.includes('recharts')) return 'vendor-charts';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('react-router-dom')) return 'vendor-react';
        },
      },
    },
  },
});
