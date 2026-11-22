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
  // Must match TEST_STORAGE_DIR in vitest.config.mts. Removed only after the run,
  // and only this exact folder; development uploads are never touched.
  const testUploads = path.join(root, 'storage', 'test-uploads');
  const teardown = () => fs.rmSync(testUploads, { recursive: true, force: true });
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
  if (devEnv.DATABASE_URL && sameDatabase(devEnv.DATABASE_URL, testEnv.DATABASE_URL)) {
    throw new Error('Refusing to run: .env.test DATABASE_URL is the same database as .env (tests wipe data).');
  }

  execSync('npx prisma migrate deploy', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...testEnv },
  });
  return teardown;
}

/**
 * Compares the database a URL points at, not its spelling: the same server port and
 * database name count as the same database even when written differently
 * (localhost vs 127.0.0.1, extra query parameters, different credentials).
 */
function sameDatabase(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const x = new URL(a);
    const y = new URL(b);
    const name = (u: URL) => decodeURIComponent(u.pathname.replace(/^\//, '')).toLowerCase();
    const port = (u: URL) => u.port || '5432';
    return name(x) === name(y) && port(x) === port(y);
  } catch {
    // Unparseable URL: be safe and refuse.
    return true;
  }
}
