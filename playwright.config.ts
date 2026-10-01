import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/visual',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
    viewport: { width: 1920, height: 900 },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
