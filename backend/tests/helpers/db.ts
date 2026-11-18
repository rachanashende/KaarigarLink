import { prisma } from '../../src/utils/prisma';

/** Empties every application table (keeps migration history). Test DB only. */
export async function resetDatabase() {
  if (process.env.NODE_ENV !== 'test') throw new Error('resetDatabase() is only allowed in tests');

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export { prisma };
