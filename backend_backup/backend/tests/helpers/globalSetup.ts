import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

/**
 * Runs once before all tests. If a test database is configured (.env.test),
 * apply migrations to it. Refuses to run if it points at the dev database,
 * because API tests TRUNCATE every table.
 */
export default function setup() {
  const root = path.resolve(__dirname, '..', '..');
  const testEnvPath = path.join(root, '.env.test');
  if (!fs.existsSync(testEnvPath)) {
    console.warn('\n[tests] .env.test not found - API tests will fail. Unit tests are unaffected.\n');
    return;
  }

  const testEnv = loadEnv({ path: testEnvPath, quiet: true, processEnv: {} }).parsed ?? {};
  const devEnv = fs.existsSync(path.join(root, '.env'))
    ? (loadEnv({ path: path.join(root, '.env'), quiet: true, processEnv: {} }).parsed ?? {})
    : {};

  if (!testEnv.DATABASE_URL) throw new Error('.env.test must define DATABASE_URL');
  if (devEnv.DATABASE_URL && devEnv.DATABASE_URL === testEnv.DATABASE_URL) {
    throw new Error('Refusing to run: .env.test DATABASE_URL is the same as .env (tests wipe data).');
  }

  execSync('npx prisma migrate deploy', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...testEnv },
  });
}
