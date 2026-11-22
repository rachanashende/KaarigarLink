import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  // Live-mode journeys need a backend and a seeded database: playwright.live.config.ts.
  testIgnore: '**/live/**',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The mock-mode suite: force mock mode even when a local .env selects live mode.
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, env: { VITE_SERVICE_MODE: 'mock' } },
});
