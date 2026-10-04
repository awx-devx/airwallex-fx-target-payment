import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: path.resolve(import.meta.dirname, 'tests/env'),
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    hookTimeout: 180_000,
    testTimeout: 30_000,
    teardownTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
