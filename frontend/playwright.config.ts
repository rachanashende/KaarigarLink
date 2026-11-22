import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', workers: 1, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', workers: 1, use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175', timeout: 120000, reuseExistingServer: false,
  },
});
