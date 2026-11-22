import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';

// API tests run against a SEPARATE database defined in .env.test.
const testEnv = loadEnv({ path: '.env.test', quiet: true }).parsed ?? {};

// Uploads made by API tests go to a dedicated folder (never the development
// uploads folder). globalSetup removes this folder, and only this folder, afterwards.
export const TEST_STORAGE_DIR = 'storage/test-uploads';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { ...testEnv, FILE_STORAGE_DIR: TEST_STORAGE_DIR, NODE_ENV: 'test' },
    globalSetup: ['tests/helpers/globalSetup.ts'],
    // API tests share one database, so run test files one at a time.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
