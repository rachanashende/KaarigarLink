import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import {
  ASHA,
  BRACKETS,
  INSPECTOR,
  PRECISION,
  SHAFTS,
  api,
  awardedOrder,
  completedOrder,
  inspect,
  owner,
  startedOrder,
  type TokenFor,
} from '../helpers/orderFlow';

/**
 * I5 concurrency: real parallel requests, and requests held behind a row lock
 * taken by a second transaction (same lock order the services use).
 */
let tokenFor: TokenFor;
const WS = owner(PRECISION);

beforeEach(async () => {
  tokenFor = await seededSession();
  for (const id of [ASHA, WS, INSPECTOR]) await tokenFor(id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function holdLock(lock: (tx: Prisma.TransactionClient) => Promise<unknown>, write: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let markLocked!: () => void;
  const locked = new Promise<void>((r) => (markLocked = r));
  const done = prisma.$transaction(
    async (tx) => {
      await lock(tx);
      markLocked();
      await gate;
      await write(tx);
    },
    { timeout: 20_000 },
  );
  return { locked, release, done };
}

async function untilBlockedOnLock() {
  for (let i = 0; i < 100; i += 1) {
    const [row] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (Number(row.n) > 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('request never blocked on the row lock');
}

const lockOrderLikeServices = (orderId: string) => async (tx: Prisma.TransactionClient) => {
  await tx.$queryRaw`SELECT 1 FROM "Job" WHERE "id" = ${BRACKETS} FOR SHARE`;
  await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
};
const complete = (orderId: string) => api(tokenFor, ASHA, 'post', `/orders/${orderId}/complete`);
const pay = (orderId: string, amount: string) => api(tokenFor, ASHA, 'post', `/orders/${orderId}/payments`, { amount });
const statuses = (rs: { status: number }[]) => rs.map((r) => r.status).sort();

describe('payments', () => {
  it('parallel creations never exceed agreedPrice (5 x 3000 against 12500.50 -> 4 accepted)', async () => {
    const orderId = await awardedOrder(tokenFor);
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => pay(orderId, '3000')));
    expect(statuses(results)).toEqual([201, 201, 201, 201, 409]);
    const agg = await prisma.payment.aggregate({ where: { orderId }, _sum: { amount: true } });
    expect(agg._sum.amount?.toFixed(2)).toBe('12000.00');
  });

  it('parallel simulations of one payment: exactly one changes it; the outcome is never flipped', async () => {
    const orderId = await awardedOrder(tokenFor);
    const id = (await pay(orderId, '100')).body.data.payment.id;
    const outcomes = ['SUCCEEDED', 'FAILED', 'SUCCEEDED', 'FAILED', 'SUCCEEDED'];
    const results = await Promise.all(outcomes.map((outcome) => api(tokenFor, ASHA, 'post', `/payments/${id}/simulate`, { outcome })));
    const changed = results.filter((r) => r.status === 200 && r.body.data.changed);
    expect(changed).toHaveLength(1);
    const final = (await prisma.payment.findUniqueOrThrow({ where: { id } })).status;
    expect(final).toBe(changed[0].body.data.payment.status);
    for (const [i, r] of results.entries()) {
      if (outcomes[i] === final) expect(r.status).toBe(200);
      else expect(r.status).toBe(409);
    }
  });

  it('a payment waiting behind an in-flight order cancellation is rejected', async () => {
    const orderId = await awardedOrder(tokenFor);
    const held = holdLock(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Job" WHERE "id" = ${BRACKETS} FOR UPDATE`;
        await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      },
      async (tx) => {
        await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancellationReason: 'held' } });
        await tx.job.update({ where: { id: BRACKETS }, data: { status: 'CANCELLED' } });
      },
    );
    await held.locked;
    const pending = Promise.resolve(pay(orderId, '100'));
    await untilBlockedOnLock();
    held.release();
    await held.done;
    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Cannot add a payment to an order that is CANCELLED');
    expect(await prisma.payment.count()).toBe(0);
  });
});

describe('ratings', () => {
  it('parallel duplicate submissions: one 201, the rest 409; the aggregate moves once', async () => {
    const orderId = await completedOrder(tokenFor);
    const before = await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } });
    const results = await Promise.all([5, 4, 3, 2].map((score) => api(tokenFor, ASHA, 'post', `/orders/${orderId}/rating`, { score })));
    expect(statuses(results)).toEqual([201, 409, 409, 409]);
    const after = await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } });
    expect(after.ratingCount).toBe(before.ratingCount + 1);
    const winner = results.find((r) => r.status === 201)!.body.data.rating.score;
    expect(after.rating).toBeCloseTo((before.rating * before.ratingCount + winner) / (before.ratingCount + 1), 10);
  });

  it('parallel ratings of two orders of the same workshop are both counted', async () => {
    const a = await completedOrder(tokenFor, BRACKETS);
    const b = await completedOrder(tokenFor, SHAFTS);
    const before = await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } });
    const results = await Promise.all([
      api(tokenFor, ASHA, 'post', `/orders/${a}/rating`, { score: 5 }),
      api(tokenFor, ASHA, 'post', `/orders/${b}/rating`, { score: 1 }),
    ]);
    expect(statuses(results)).toEqual([201, 201]);
    const after = await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } });
    expect(after.ratingCount).toBe(before.ratingCount + 2);
    expect(after.rating).toBeCloseTo((before.rating * before.ratingCount + 6) / (before.ratingCount + 2), 10);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });
});

describe('inspections and completion', () => {
  it('a completion waiting behind an in-flight FAILED inspection sees it and is refused', async () => {
    const orderId = await startedOrder(tokenFor);
    await inspect(tokenFor, orderId, 'PASSED');
    const held = holdLock(lockOrderLikeServices(orderId), (tx) =>
      tx.inspection.create({ data: { orderId, inspectorId: INSPECTOR, status: 'FAILED', inspectedAt: new Date(Date.now() + 1000) } }),
    );
    await held.locked;
    const pending = Promise.resolve(complete(orderId));
    await untilBlockedOnLock();
    held.release();
    await held.done;
    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('The latest quality inspection is FAILED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('IN_PROGRESS');
  });

  it('an inspection waiting behind an in-flight completion is refused (order no longer IN_PROGRESS)', async () => {
    const orderId = await startedOrder(tokenFor);
    await inspect(tokenFor, orderId, 'PASSED');
    const held = holdLock(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Job" WHERE "id" = ${BRACKETS} FOR UPDATE`;
        await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      },
      async (tx) => {
        await tx.order.update({ where: { id: orderId }, data: { status: 'COMPLETED', actualCompletionDate: new Date() } });
        await tx.job.update({ where: { id: BRACKETS }, data: { status: 'COMPLETED' } });
      },
    );
    await held.locked;
    const pending = Promise.resolve(inspect(tokenFor, orderId, 'FAILED', 'late'));
    await untilBlockedOnLock();
    held.release();
    await held.done;
    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Only IN_PROGRESS orders can be inspected (this order is COMPLETED)');
    expect(await prisma.inspection.count({ where: { orderId } })).toBe(1);
  });

  it('FAILED inspection racing completion (parallel, 3 rounds): never COMPLETED with a later non-PASSED inspection', async () => {
    for (let round = 0; round < 3; round += 1) {
      tokenFor = await seededSession();
      const orderId = await startedOrder(tokenFor);
      await inspect(tokenFor, orderId, 'PASSED');
      const [ri, rc] = await Promise.all([inspect(tokenFor, orderId, 'FAILED', 'race'), complete(orderId)]);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      if (rc.status === 200) {
        expect(order.status).toBe('COMPLETED');
        expect(ri.status).toBe(409);
      } else {
        expect(rc.status).toBe(409);
        expect(ri.status).toBe(201);
        expect(order.status).toBe('IN_PROGRESS');
      }
    }
  });
});

describe('milestones', () => {
  it('parallel creations with the same sequence: one 201, the rest 409', async () => {
    const orderId = await awardedOrder(tokenFor);
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => api(tokenFor, WS, 'post', `/orders/${orderId}/milestones`, { title: `Try ${n}`, sequence: 1 })),
    );
    expect(statuses(results)).toEqual([201, 409, 409, 409]);
    expect(await prisma.milestone.count({ where: { orderId } })).toBe(1);
  });

  it('parallel starts of one milestone: exactly one changes it', async () => {
    const orderId = await startedOrder(tokenFor);
    const id = (await api(tokenFor, WS, 'post', `/orders/${orderId}/milestones`, { title: 'M', sequence: 1 })).body.data.milestone.id;
    const results = await Promise.all([1, 2, 3].map(() => api(tokenFor, WS, 'post', `/milestones/${id}/start`)));
    expect(statuses(results)).toEqual([200, 200, 200]);
    expect(results.filter((r) => r.body.data.changed)).toHaveLength(1);
  });

  it('approval racing completion (parallel): completion always succeeds; approval only if it ran first', async () => {
    const orderId = await startedOrder(tokenFor);
    const id = (await api(tokenFor, WS, 'post', `/orders/${orderId}/milestones`, { title: 'M', sequence: 1 })).body.data.milestone.id;
    await api(tokenFor, WS, 'post', `/milestones/${id}/start`);
    await api(tokenFor, WS, 'post', `/milestones/${id}/complete`);
    await inspect(tokenFor, orderId, 'PASSED');
    const [ra, rc] = await Promise.all([api(tokenFor, ASHA, 'post', `/milestones/${id}/approve`), complete(orderId)]);
    expect(rc.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('COMPLETED');
    const milestone = (await prisma.milestone.findUniqueOrThrow({ where: { id } })).status;
    if (ra.status === 200) expect(milestone).toBe('APPROVED');
    else {
      expect(ra.status).toBe(409);
      expect(ra.body.message).toBe('Milestones can only be approved while the order is IN_PROGRESS (it is COMPLETED)');
      expect(milestone).toBe('COMPLETED');
    }
  });
});
