import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { signToken } from '../../src/utils/jwt';
import { prisma } from '../helpers/db';
import { SEED_TEST_PASSWORD, seededSession } from '../helpers/seedSession';
import { ADMIN, ASHA, VIKRAM, auth, type TokenFor } from '../helpers/orderFlow';

/**
 * M13: password changes invalidate earlier tokens by a per-user tokenVersion, not by
 * timestamp, so there is no one-second window (JWT iat has second precision).
 */
let tokenFor: TokenFor;
const ASHA_EMAIL = 'asha.rao@kaarigarlink.test';

beforeEach(async () => {
  tokenFor = await seededSession();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const me = (token: string) => request(app).get('/api/auth/me').set(auth(token));
const login = (password: string) => request(app).post('/api/auth/login').send({ email: ASHA_EMAIL, password });
const change = (token: string, currentPassword: string, newPassword: string) =>
  request(app).patch('/api/auth/me/password').set(auth(token)).send({ currentPassword, newPassword });
const claims = (token: string) => jwt.decode(token) as { iat: number; tv?: number };

describe('password change token invalidation', () => {
  it('a token issued in the same second as the change is rejected immediately; the new token works', async () => {
    // Freeze the clock so both tokens are guaranteed to share one iat second.
    const frozen = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(frozen);

    const before = (await login(SEED_TEST_PASSWORD)).body.data.token as string;
    expect((await me(before)).status).toBe(200);
    const res = await change(before, SEED_TEST_PASSWORD, 'NewPassw0rd!');
    expect(res.status).toBe(200);
    const after = res.body.data.token as string;

    expect(claims(after).iat).toBe(claims(before).iat); // same second
    expect(claims(after).tv).toBe((claims(before).tv ?? 0) + 1);
    expect((await me(before)).status).toBe(401);
    expect((await me(after)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ASHA } })).tokenVersion).toBe(1);
  });

  it('every earlier token is rejected, including one signed after the change with the old version', async () => {
    const first = await tokenFor(ASHA);
    const second = (await login(SEED_TEST_PASSWORD)).body.data.token as string;
    const res = await change(first, SEED_TEST_PASSWORD, 'NewPassw0rd!');
    expect(res.status).toBe(200);
    for (const old of [first, second]) {
      expect((await me(old)).status).toBe(401);
      expect((await request(app).get('/api/orders/mine').set(auth(old))).status).toBe(401);
    }
    // A later iat does not help a token that carries the old version.
    const forged = signToken({ sub: ASHA, email: ASHA_EMAIL, role: 'BUYER', tv: 0 });
    expect((await me(forged)).status).toBe(401);
    // Tokens without a version (issued before M13) count as version 0.
    const legacy = signToken({ sub: ASHA, email: ASHA_EMAIL, role: 'BUYER' });
    expect((await me(legacy)).status).toBe(401);
  });

  it('new logins carry the current version; a second change invalidates the first new token', async () => {
    const res = await change(await tokenFor(ASHA), SEED_TEST_PASSWORD, 'NewPassw0rd!');
    const fromChange = res.body.data.token as string;
    expect((await login(SEED_TEST_PASSWORD)).status).toBe(401);
    const fresh = await login('NewPassw0rd!');
    expect(fresh.status).toBe(200);
    expect(claims(fresh.body.data.token).tv).toBe(1);
    expect((await me(fresh.body.data.token)).status).toBe(200);

    const again = await change(fromChange, 'NewPassw0rd!', 'Another-Passw0rd');
    expect(again.status).toBe(200);
    expect(claims(again.body.data.token).tv).toBe(2);
    expect((await me(fromChange)).status).toBe(401);
    expect((await me(fresh.body.data.token)).status).toBe(401);
    expect((await me(again.body.data.token)).status).toBe(200);
  });

  it('a rejected change (wrong current password) does not invalidate any token', async () => {
    const token = await tokenFor(ASHA);
    expect((await change(token, 'wrong-password', 'NewPassw0rd!')).status).toBe(400);
    expect((await me(token)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ASHA } })).tokenVersion).toBe(0);
  });

  it('only the changing user is affected; role authorization is unchanged', async () => {
    const vikram = await tokenFor(VIKRAM);
    const admin = await tokenFor(ADMIN);
    const res = await change(await tokenFor(ASHA), SEED_TEST_PASSWORD, 'NewPassw0rd!');
    const asha = res.body.data.token as string;
    expect((await me(vikram)).status).toBe(200);
    expect((await request(app).get('/api/audit').set(auth(admin))).status).toBe(200);
    expect((await request(app).get('/api/audit').set(auth(asha))).status).toBe(403); // still a BUYER
    expect((await request(app).get('/api/orders/mine').set(auth(asha))).status).toBe(200);
  });

  it('tokens issued before M13 (no version) stay valid for users who never changed their password', async () => {
    const legacy = jwt.sign({ sub: VIKRAM, email: 'vikram.mehta@kaarigarlink.test', role: 'BUYER' }, env.JWT_SECRET, { expiresIn: '1h' });
    expect((await me(legacy)).status).toBe(200);
  });
});
