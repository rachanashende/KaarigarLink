import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prisma } from '../helpers/db';
import { SEED_TEST_PASSWORD, seededSession } from '../helpers/seedSession';

/**
 * Development-only demo login. The suite runs with NODE_ENV=test (demo login off); the
 * "enabled" cases switch the parsed config to development + ENABLE_DEMO_LOGIN=true.
 */
const original = { NODE_ENV: env.NODE_ENV, demoLoginEnabled: env.demoLoginEnabled };
function configure(NODE_ENV: 'development' | 'test' | 'production', demoLoginEnabled: boolean) {
  Object.assign(env, { NODE_ENV, demoLoginEnabled });
}
const demo = (body: unknown, headers: Record<string, string> = {}) => request(app).post('/api/auth/demo-login').set(headers).send(body as object);

const EXPECTED = {
  BUYER: { id: 'seed-user-buyer-asha', email: 'asha.rao@kaarigarlink.test' },
  WORKSHOP: { id: 'seed-user-ws-precision-works', email: 'precision-works@kaarigarlink.test' },
  INSPECTOR: { id: 'seed-user-inspector', email: 'priya.inspector@kaarigarlink.test' },
  ADMIN: { id: 'seed-user-admin', email: 'admin@kaarigarlink.test' },
} as const;

beforeEach(async () => {
  await seededSession();
});
afterEach(() => {
  configure(original.NODE_ENV, original.demoLoginEnabled);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('availability', () => {
  it('is off by default (test environment): 404 with a clear message, for any body', async () => {
    for (const body of [{ role: 'BUYER' }, {}, { email: 'admin@kaarigarlink.test' }]) {
      const res = await demo(body);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, message: 'Demo login is disabled on this server' });
    }
  });
  it('is unavailable in development when ENABLE_DEMO_LOGIN is absent or false', async () => {
    configure('development', false);
    expect((await demo({ role: 'ADMIN' })).status).toBe(404);
  });
  it('is unavailable in production even if the flag were somehow set', async () => {
    configure('production', true);
    const res = await demo({ role: 'ADMIN' });
    expect(res.status).toBe(404);
    expect(res.body.data).toBeUndefined();
  });
});

describe('enabled (development + ENABLE_DEMO_LOGIN=true)', () => {
  beforeEach(() => configure('development', true));

  it.each(Object.keys(EXPECTED) as (keyof typeof EXPECTED)[])('%s: signs in the seeded account with a normal token, same shape as login', async (role) => {
    const res = await demo({ role });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(['token', 'user']);
    expect(res.body.data.user).toMatchObject({ id: EXPECTED[role].id, email: EXPECTED[role].email, role });
    expect(res.body.data.user.passwordHash).toBeUndefined();

    // A normal JWT signed with the server secret, carrying the current token version.
    const claims = jwt.verify(res.body.data.token, env.JWT_SECRET) as { sub: string; role: string; tv: number; exp: number };
    expect(claims).toMatchObject({ sub: EXPECTED[role].id, role, tv: 0 });
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    const me = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + res.body.data.token);
    expect(me.status).toBe(200);
    expect(me.body.data.user.id).toBe(EXPECTED[role].id);

    // Same response shape as ordinary login for that account.
    const normal = await request(app).post('/api/auth/login').send({ email: EXPECTED[role].email, password: SEED_TEST_PASSWORD });
    expect(normal.body.data.user).toEqual(res.body.data.user);
  });

  it('normal authorization still applies to demo tokens', async () => {
    const buyer = (await demo({ role: 'BUYER' })).body.data.token;
    const admin = (await demo({ role: 'ADMIN' })).body.data.token;
    expect((await request(app).get('/api/audit').set('Authorization', 'Bearer ' + buyer)).status).toBe(403);
    expect((await request(app).get('/api/audit').set('Authorization', 'Bearer ' + admin)).status).toBe(200);
  });

  it('accepts only an allowlisted role: no arbitrary users, emails or extra fields', async () => {
    for (const body of [{}, { role: 'SUPERADMIN' }, { role: 'admin' }, { role: '' }, { role: ['ADMIN'] }, { email: 'admin@kaarigarlink.test' },
      { role: 'BUYER', email: 'admin@kaarigarlink.test' }, { role: 'BUYER', userId: 'seed-user-admin' }]) {
      const res = await demo(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.data).toBeUndefined();
    }
  });

  it('rejects requests that do not come from this machine', async () => {
    expect((await demo({ role: 'ADMIN' }, { Host: 'evil.example' })).status).toBe(403);
    expect((await demo({ role: 'ADMIN' }, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await demo({ role: 'ADMIN' }, { Origin: 'http://localhost:5173' })).status).toBe(200);
  });

  it('never creates or repairs accounts: an altered seed account is a 404', async () => {
    const before = await prisma.user.count();
    await prisma.user.update({ where: { id: 'seed-user-inspector' }, data: { email: 'moved@kaarigarlink.test' } });
    const res = await demo({ role: 'INSPECTOR' });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not seeded/);
    expect(await prisma.user.count()).toBe(before);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: 'seed-user-inspector' } })).email).toBe('moved@kaarigarlink.test');
  });

  it('issues tokens at the current version, so a password change still ends earlier demo sessions', async () => {
    const first = (await demo({ role: 'BUYER' })).body.data.token as string;
    const changed = await request(app).patch('/api/auth/me/password').set('Authorization', 'Bearer ' + first).send({ currentPassword: SEED_TEST_PASSWORD, newPassword: 'Changed-Passw0rd' });
    expect(changed.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + first)).status).toBe(401);
    const again = (await demo({ role: 'BUYER' })).body.data.token as string;
    expect((jwt.decode(again) as { tv: number }).tv).toBe(1);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + again)).status).toBe(200);
  });

  it('is audited without secrets', async () => {
    const res = await demo({ role: 'WORKSHOP' });
    const events = await prisma.auditEvent.findMany({ where: { action: 'DEMO_LOGIN' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: EXPECTED.WORKSHOP.id, entityId: EXPECTED.WORKSHOP.id });
    expect(JSON.stringify(events)).not.toContain(res.body.data.token);
  });
});
