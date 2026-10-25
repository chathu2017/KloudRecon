/**
 * End-to-end journeys against the full local stack (decision 0040).
 *
 * Needs the API and worker running with Demo Mode data (`.\scripts\dev.ps1` after `seed-dev` and
 * `seed-demo`); the Vite dev server is started here when it is not already running.
 * Run: `npm run e2e` (Chromium: `npx playwright install chromium` once).
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: false,
  workers: 1,
  // one retry: the Vite dev server can stall under load; retried tests are reported as flaky
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { outputFolder: 'e2e/.report', open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: [/mobile\.spec/, /capture\//] },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
    // design-review screenshots (docs/ui), run explicitly: UI_CAPTURE=... --project=capture
    ...(process.env.UI_CAPTURE
      ? [{ name: 'capture', use: { ...devices['Desktop Chrome'] }, testMatch: /capture\/.*\.spec/ }]
      : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 120_000, stdout: 'ignore' },
});
