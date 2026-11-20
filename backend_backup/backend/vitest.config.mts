import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';

// API tests run against a SEPARATE database defined in .env.test.
const testEnv = loadEnv({ path: '.env.test', quiet: true }).parsed ?? {};

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { ...testEnv, NODE_ENV: 'test' },
    globalSetup: ['tests/helpers/globalSetup.ts'],
    // API tests share one database, so run test files one at a time.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
