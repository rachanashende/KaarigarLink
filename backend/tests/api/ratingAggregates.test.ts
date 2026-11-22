import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import { ADMIN, ASHA, BRACKETS, PRECISION, api, owner, type TokenFor } from '../helpers/orderFlow';

/**
 * B4: workshop rating aggregates under concurrency. Many COMPLETED orders for one
 * workshop are built directly in the database (the seed has only two jobs that
 * this workshop can be awarded), then rated in parallel through the API.
 */
let tokenFor: TokenFor;

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function completedOrders(n: number) {
  const template = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const job = await prisma.job.create({
      data: {
        buyerId: ASHA,
        title: `B4 job ${i}`,
        material: template.material,
        manufacturingProcess: template.manufacturingProcess,
        quantity: template.quantity,
        deadline: template.deadline,
        status: 'COMPLETED',
      },
    });
    const invitation = await prisma.jobInvitation.create({
      data: { jobId: job.id, workshopId: PRECISION, status: 'ACCEPTED', matchScore: 90, scoreBreakdown: {}, matchReasons: [], rank: 1 },
    });
    const quote = await prisma.quote.create({
      data: { invitationId: invitation.id, jobId: job.id, workshopId: PRECISION, totalPrice: '100', estimatedDays: 5, status: 'ACCEPTED' },
    });
    const order = await prisma.order.create({
      data: { jobId: job.id, quoteId: quote.id, buyerId: ASHA, workshopId: PRECISION, agreedPrice: '100', status: 'COMPLETED' },
    });
    ids.push(order.id);
  }
  return ids;
}

const rate = (orderId: string, score: number) => api(tokenFor, ASHA, 'post', `/orders/${orderId}/rating`, { score });
const workshop = () => prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } });

describe('rating aggregates under concurrency', () => {
  it('8 parallel ratings of different orders: count +8 and the exact incremental average', async () => {
    const orders = await completedOrders(8);
    const scores = [5, 1, 4, 2, 3, 5, 5, 1];
    const before = await workshop();
    const results = await Promise.all(orders.map((id, i) => rate(id, scores[i])));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));

    const after = await workshop();
    const sum = scores.reduce((a, b) => a + b, 0);
    expect(after.ratingCount).toBe(before.ratingCount + 8);
    expect(after.rating).toBeCloseTo((before.rating * before.ratingCount + sum) / (before.ratingCount + 8), 9);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(await prisma.rating.count({ where: { workshopId: PRECISION } })).toBe(8);
  });

  it('parallel duplicates across several orders: exactly one rating per order, aggregate counts each once', async () => {
    const orders = await completedOrders(3);
    const before = await workshop();
    const results = await Promise.all(orders.flatMap((id) => [rate(id, 4), rate(id, 2), rate(id, 5)]));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    for (const r of results.filter((x) => x.status !== 201)) {
      expect(r.status).toBe(409);
      expect(r.body.message).toBe('This order has already been rated');
    }
    const ratings = await prisma.rating.findMany({ where: { orderId: { in: orders } } });
    expect(ratings).toHaveLength(3);
    const after = await workshop();
    expect(after.ratingCount).toBe(before.ratingCount + 3);
    const sum = ratings.reduce((a, r) => a + r.score, 0);
    expect(after.rating).toBeCloseTo((before.rating * before.ratingCount + sum) / (before.ratingCount + 3), 9);
  });

  it('a rating in parallel with a profile edit of the same workshop: both apply, no version conflict', async () => {
    const [orderId] = await completedOrders(1);
    const before = await workshop();
    const [rr, re] = await Promise.all([
      rate(orderId, 5),
      api(tokenFor, owner(PRECISION), 'put', `/workshops/${PRECISION}`, { description: 'Edited during a rating' }),
    ]);
    expect(rr.status).toBe(201);
    expect(re.status).toBe(200);
    const after = await workshop();
    expect(after.ratingCount).toBe(before.ratingCount + 1);
    expect(after.description).toBe('Edited during a rating');
  });

  it('a workshop with no prior ratings gets exactly the first score', async () => {
    const [orderId] = await completedOrders(1);
    await prisma.workshop.update({ where: { id: PRECISION }, data: { rating: 0, ratingCount: 0 } });
    expect((await rate(orderId, 3)).status).toBe(201);
    expect(await workshop()).toMatchObject({ rating: 3, ratingCount: 1 });
    // Only the buyer of the order can rate (ADMIN is not a buyer).
    expect((await api(tokenFor, ADMIN, 'post', `/orders/${orderId}/rating`, { score: 5 })).status).toBe(403);
  });
});
