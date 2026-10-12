import { defineConfig } from '@playwright/test';

const port = 4399;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // Tests share one server and table, so they run one at a time.
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1280, height: 800 } },
  // Each run plays on a fresh copy of the example project.
  webServer: {
    command: 'tsx e2e/serve.ts',
    url: `http://127.0.0.1:${port}/api/health`,
    env: { E2E_PORT: String(port) },
    reuseExistingServer: false,
  },
});
