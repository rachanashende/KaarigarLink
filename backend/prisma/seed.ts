/**
 * Seed entry point: `npm run db:seed` (runs via prisma.config.ts -> tsx).
 *
 * Requires SEED_DEFAULT_PASSWORD in backend/.env (never committed). Every seed
 * account logs in with that password. Safe to re-run: seed-owned records are
 * reset to the dataset, and real data is never touched. See docs/SEED_DATA.md.
 */
import { prisma } from '../src/utils/prisma';
import { ALL_USERS } from './seed/data';
import { assertSeedAllowed, runSeed, SeedConflictError, validateSeedPassword } from './seed/seeder';

async function main() {
  assertSeedAllowed(process.env);
  const password = validateSeedPassword(process.env.SEED_DEFAULT_PASSWORD);

  await runSeed(prisma, { password, log: (m) => console.log(m) });

  console.log('\nSeed accounts (password = SEED_DEFAULT_PASSWORD from your .env):');
  console.table(ALL_USERS.map((u) => ({ role: u.role, name: u.name, email: u.email })));
}

main()
  .catch((err) => {
    console.error(err instanceof SeedConflictError ? `Seed aborted: ${err.message}` : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
