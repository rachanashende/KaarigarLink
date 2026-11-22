import { defineConfig, devices } from '@playwright/test';

/**
 * Live-mode browser journeys (M13). These drive the real frontend against a
 * running backend and PostgreSQL, so they WRITE data: point them only at a
 * disposable, freshly seeded database — never the development database.
 *
 * Required environment:
 *   E2E_API_URL       backend API base URL, e.g. http://127.0.0.1:4100/api
 *   E2E_PASSWORD      the SEED_DEFAULT_PASSWORD the database was seeded with
 * Optional:
 *   E2E_WEB_PORT      port for the live-mode Vite server (default 5174)
 *   E2E_BROWSER_CHANNEL  e.g. "chrome" to use an installed browser instead of
 *                        Playwright's bundled Chromium
 *
 * The backend must allow the frontend origin (default http://127.0.0.1:5174) in CORS_ORIGINS. See docs/testing.md.
 */
const apiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:4100/api';
const channel = process.env.E2E_BROWSER_CHANNEL;
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174);
const webUrl = 'http://127.0.0.1:' + webPort;

export default defineConfig({
  testDir: './e2e/live',
  testMatch: '**/*.live.spec.ts',
  // The journeys build on each other's records: one worker, in order.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL: webUrl, trace: 'retain-on-failure' },
  projects: [{ name: 'live', use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) } }],
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port ' + webPort + ' --strictPort',
    url: webUrl,
    reuseExistingServer: !process.env.CI,
    env: { VITE_SERVICE_MODE: 'live', VITE_API_BASE_URL: apiUrl },
  },
});
