import request from 'supertest';
import { app } from '../../src/app';
import { prisma, resetDatabase } from './db';
import { ALL_USERS } from '../../prisma/seed/data';
import { runSeed } from '../../prisma/seed/seeder';

export const SEED_TEST_PASSWORD = 'SeedTest-Passw0rd';

/** Resets the test DB, seeds it, and returns a token getter for any seed user id. */
export async function seededSession() {
  await resetDatabase();
  await runSeed(prisma, { password: SEED_TEST_PASSWORD });
  const tokens = new Map<string, string>();
  return async function tokenFor(userId: string): Promise<string> {
    const cached = tokens.get(userId);
    if (cached) return cached;
    const user = ALL_USERS.find((u) => u.id === userId);
    if (!user) throw new Error(`Unknown seed user ${userId}`);
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: SEED_TEST_PASSWORD });
    if (res.status !== 200) throw new Error(`Login failed for ${user.email}: ${res.status}`);
    tokens.set(userId, res.body.data.token);
    return res.body.data.token;
  };
}
