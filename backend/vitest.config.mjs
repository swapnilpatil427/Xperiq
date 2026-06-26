import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    include: ['src/__tests__/**/*.test.js'],
    // Register tsx CJS hook before each test file so createRequire() can load .ts source files.
    setupFiles: ['./src/test/setup.cjs'],
  },
});
