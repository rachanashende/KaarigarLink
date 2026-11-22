import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import {
  ADMIN,
  ASHA,
  INSPECTOR,
  PRECISION,
  SHAFTS,
  VIKRAM,
  api,
  awardedOrder,
  completedOrder,
  owner,
  startedOrder,
  type TokenFor,
} from '../helpers/orderFlow';

let tokenFor: TokenFor;
const WS = owner(PRECISION);

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const rate = (orderId: string, body: unknown, as = ASHA) => api(tokenFor, as, 'post', `/orders/${orderId}/rating`, body);
const workshop = () => prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } });

describe('submit', () => {
  it('the buyer rates a COMPLETED order; the aggregate is updated incrementally; workshop version unchanged', async () => {
    const orderId = await completedOrder(tokenFor);
    const before = await workshop(); // seed: 4.8 over 25 ratings
    expect(before).toMatchObject({ rating: 4.8, ratingCount: 25 });

    const res = await rate(orderId, { score: 5, review: '  Great finish  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Rating submitted',
      data: { rating: { orderId, workshopId: PRECISION, buyerId: ASHA, score: 5, review: 'Great finish' }, workshop: { id: PRECISION, ratingCount: 26 } },
    });
    const after = await workshop();
    expect(after.ratingCount).toBe(26);
    expect(after.rating).toBeCloseTo(125 / 26, 10);
    expect(res.body.data.workshop.rating).toBeCloseTo(125 / 26, 10);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('a second rating of the same order is 409 and the aggregate is unchanged', async () => {
    const orderId = await completedOrder(tokenFor);
    expect((await rate(orderId, { score: 4 })).status).toBe(201);
    const before = await workshop();
    const res = await rate(orderId, { score: 1 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'This order has already been rated' });
    expect(await workshop()).toEqual(before);
    expect(await prisma.rating.count({ where: { orderId } })).toBe(1);
  });

  it.each(['CONFIRMED', 'IN_PROGRESS', 'CANCELLED'] as const)('a %s order cannot be rated (409)', async (status) => {
    const orderId = status === 'IN_PROGRESS' ? await startedOrder(tokenFor) : await awardedOrder(tokenFor);
    if (status === 'CANCELLED') await api(tokenFor, ASHA, 'post', `/orders/${orderId}/cancel`, { reason: 'Not needed' });
    const res = await rate(orderId, { score: 5 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Only COMPLETED orders can be rated (this order is ${status})`);
    expect(await prisma.rating.count()).toBe(0);
  });

  it('if the aggregate update fails, the rating is rolled back', async () => {
    const orderId = await completedOrder(tokenFor);
    const before = await workshop();
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION i5_fail_rating() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected failure'; END; $$ LANGUAGE plpgsql;`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER i5_fail_rating BEFORE UPDATE OF "ratingCount" ON "Workshop"
      FOR EACH ROW EXECUTE FUNCTION i5_fail_rating()`);
    try {
      expect((await rate(orderId, { score: 5 })).status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS i5_fail_rating ON "Workshop"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS i5_fail_rating()');
    }
    expect(await prisma.rating.count()).toBe(0);
    expect(await workshop()).toEqual(before);
    expect((await rate(orderId, { score: 5 })).status).toBe(201);
  });

  it.each([
    ['missing score', {}],
    ['score 0', { score: 0 }],
    ['score 6', { score: 6 }],
    ['fractional score', { score: 4.5 }],
    ['string score', { score: '5' }],
    ['review too long', { score: 5, review: 'x'.repeat(2001) }],
    ['unknown field', { score: 5, workshopId: 'other' }],
  ])('validation: %s -> 400', async (_name, body) => {
    const orderId = await completedOrder(tokenFor);
    expect((await rate(orderId, body)).status).toBe(400);
  });

  it('permissions: workshop/inspector/admin 403; another buyer 404; no token 401', async () => {
    const orderId = await completedOrder(tokenFor);
    for (const as of [WS, INSPECTOR, ADMIN]) expect((await rate(orderId, { score: 5 }, as)).status).toBe(403);
    const other = await rate(orderId, { score: 5 }, VIKRAM);
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Order not found');
    expect((await request(app).post(`/api/orders/${orderId}/rating`).send({ score: 5 })).status).toBe(401);
    expect(await prisma.rating.count()).toBe(0);
  });
});

describe('workshop rating history', () => {
  it('any authenticated user reads a workshop history, newest first, with the aggregate', async () => {
    const first = await completedOrder(tokenFor);
    await rate(first, { score: 5, review: 'first' });
    const second = await completedOrder(tokenFor, SHAFTS);
    await rate(second, { score: 3, review: 'second' });

    for (const as of [VIKRAM, WS, INSPECTOR]) {
      const res = await api(tokenFor, as, 'get', `/workshops/${PRECISION}/ratings`);
      expect(res.status).toBe(200);
      expect(res.body.data.workshop).toMatchObject({ id: PRECISION, ratingCount: 27 });
      expect(res.body.data.ratings.map((r: { review: string }) => r.review)).toEqual(['second', 'first']);
      expect(res.body.data.ratings[0]).toMatchObject({ orderId: second, score: 3, buyer: { id: ASHA } });
      expect(res.body.data.ratings[0].buyer.email).toBeUndefined();
    }
    expect((await workshop()).rating).toBeCloseTo((120 + 5 + 3) / 27, 10);
  });

  it('unknown workshop 404; no token 401', async () => {
    expect((await api(tokenFor, ASHA, 'get', '/workshops/no-such-ws/ratings')).status).toBe(404);
    expect((await request(app).get(`/api/workshops/${PRECISION}/ratings`)).status).toBe(401);
  });

  it('B5: the history is paginated (default limit 20, max 100); the response keeps workshop and ratings', async () => {
    const first = await completedOrder(tokenFor);
    await rate(first, { score: 5, review: 'first' });
    const second = await completedOrder(tokenFor, SHAFTS);
    await rate(second, { score: 3, review: 'second' });
    const all = await api(tokenFor, ASHA, 'get', `/workshops/${PRECISION}/ratings`);
    expect(all.body.data.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    const page2 = await api(tokenFor, ASHA, 'get', `/workshops/${PRECISION}/ratings?limit=1&page=2`);
    expect(page2.body.data.ratings.map((r: { review: string }) => r.review)).toEqual(['first']);
    expect(page2.body.data.workshop).toMatchObject({ id: PRECISION, ratingCount: 27 });
    for (const q of ['limit=0', 'limit=101', 'page=0', 'sort=score']) {
      expect((await api(tokenFor, ASHA, 'get', `/workshops/${PRECISION}/ratings?${q}`)).status).toBe(400);
    }
  });
});
