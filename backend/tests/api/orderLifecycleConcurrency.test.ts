import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Prisma } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';

/**
 * I4b concurrency: real parallel requests, real row locks held by a second
 * transaction, and deterministic races injected after a service's pre-read.
 */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const ASHA = 'seed-user-buyer-asha';
const BRACKETS = 'seed-job-alu-brackets';
const SHAFTS = 'seed-job-stainless-shafts'; // eligible: precision only
const PRECISION = 'seed-ws-precision-works';
const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;
const VALID = { totalPrice: '12500.50', estimatedDays: 14 };

let tokenFor: (userId: string) => Promise<string>;

// File-scoped spies delegating to the real methods unless a race is injected.
const realWorkshopFind = prisma.workshop.findUnique.bind(prisma.workshop);
const workshopFindSpy = vi
  .spyOn(prisma.workshop, 'findUnique')
  .mockImplementation(realWorkshopFind as unknown as typeof prisma.workshop.findUnique);
const realWorkshopFindMany = prisma.workshop.findMany.bind(prisma.workshop);
const workshopFindManySpy = vi
  .spyOn(prisma.workshop, 'findMany')
  .mockImplementation(realWorkshopFindMany as unknown as typeof prisma.workshop.findMany);

/** Runs `write` right after the next prisma.workshop.findUnique (the profile edit's pre-read). */
function afterNextWorkshopRead(write: () => Promise<unknown>) {
  workshopFindSpy.mockImplementationOnce((async (args: Parameters<typeof realWorkshopFind>[0]) => {
    const snapshot = await realWorkshopFind(args);
    await write();
    return snapshot;
  }) as unknown as typeof prisma.workshop.findUnique);
}

/** Runs `write` right after matching has loaded the workshops (the invite's snapshot). */
function afterNextMatchingRead(write: () => Promise<unknown>) {
  workshopFindManySpy.mockImplementationOnce((async (args: Parameters<typeof realWorkshopFindMany>[0]) => {
    const snapshot = await realWorkshopFindMany(args);
    await write();
    return snapshot;
  }) as unknown as typeof prisma.workshop.findMany);
}

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

async function awardedOrder() {
  const inv = await request(app).post(`/api/jobs/${BRACKETS}/invitations`).set(auth(await tokenFor(ASHA))).send({ workshopId: PRECISION });
  const invitationId: string = inv.body.data.invitation.id;
  const ws = await tokenFor(owner(PRECISION));
  await request(app).post(`/api/invitations/${invitationId}/respond`).set(auth(ws)).send({ response: 'ACCEPTED' });
  const q = await request(app).post(`/api/quotes/invitations/${invitationId}`).set(auth(ws)).send(VALID);
  const res = await request(app).post(`/api/orders/award/${q.body.data.quote.id}`).set(auth(await tokenFor(ASHA)));
  expect(res.status).toBe(201);
  return res.body.data.order.id as string;
}

const act = async (orderId: string, action: 'start' | 'complete' | 'cancel') => {
  const as = action === 'start' ? owner(PRECISION) : ASHA;
  const req = request(app).post(`/api/orders/${orderId}/${action}`).set(auth(await tokenFor(as)));
  return action === 'cancel' ? req.send({ reason: 'Buyer changed plans' }) : req;
};
/** I5: completion needs a PASSED inspection first. */
const passQc = async (orderId: string) => {
  // B1: the inspector must be assigned (idempotent: 201 first time, 200 after).
  const assigned = await request(app)
    .put(`/api/orders/${orderId}/inspector`)
    .set(auth(await tokenFor('seed-user-admin')))
    .send({ inspectorId: 'seed-user-inspector' });
  expect([200, 201]).toContain(assigned.status);
  const res = await request(app)
    .post(`/api/orders/${orderId}/inspections`)
    .set(auth(await tokenFor('seed-user-inspector')))
    .send({ status: 'PASSED' });
  expect(res.status).toBe(201);
};
const completedCount = async () => (await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } })).totalCompletedJobs;

/** Order and job always agree after any race. */
async function expectInSync(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const job = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
  const expectedJob = { CONFIRMED: 'AWARDED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' }[order.status];
  expect(job.status).toBe(expectedJob);
  return order;
}

async function freshSession() {
  tokenFor = await seededSession();
  for (const id of [ASHA, owner(PRECISION)]) await tokenFor(id);
}

beforeEach(freshSession);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('order lifecycle concurrency', () => {
  it('parallel completions: exactly one changes the order and the count goes up once', async () => {
    const orderId = await awardedOrder();
    await act(orderId, 'start');
    await passQc(orderId);
    const before = await completedCount();
    const results = await Promise.all([1, 2, 3, 4].map(() => act(orderId, 'complete')));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(results.filter((r) => r.body.data.changed)).toHaveLength(1);
    expect(await completedCount()).toBe(before + 1);
    expect((await expectInSync(orderId)).status).toBe('COMPLETED');
  });

  it('parallel starts: one changes it, the others get changed:false', async () => {
    const orderId = await awardedOrder();
    const results = await Promise.all([1, 2, 3].map(() => act(orderId, 'start')));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.filter((r) => r.body.data.changed)).toHaveLength(1);
    expect((await expectInSync(orderId)).status).toBe('IN_PROGRESS');
  });

  it('a start waiting behind an in-flight cancellation is rejected (409)', async () => {
    const orderId = await awardedOrder();
    const cancelling = holdLock(
      (tx) => tx.$queryRaw`SELECT 1 FROM "Job" WHERE "id" = ${BRACKETS} FOR UPDATE`,
      async (tx) => {
        await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancellationReason: 'held' } });
        await tx.job.update({ where: { id: BRACKETS }, data: { status: 'CANCELLED' } });
      },
    );
    await cancelling.locked;
    const pending = Promise.resolve(act(orderId, 'start'));
    await untilBlockedOnLock();
    cancelling.release();
    await cancelling.done;
    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Cannot start an order that is CANCELLED');
    expect((await expectInSync(orderId)).status).toBe('CANCELLED');
  });

  it('start racing cancellation (parallel): the end state is always CANCELLED and consistent', async () => {
    for (let round = 0; round < 3; round += 1) {
      if (round > 0) await freshSession();
      const orderId = await awardedOrder();
      const [rs, rc] = await Promise.all([act(orderId, 'start'), act(orderId, 'cancel')]);
      expect(rc.status).toBe(200);
      expect(rc.body.data.changed).toBe(true);
      expect([200, 409]).toContain(rs.status); // started first (then cancelled) or refused
      expect((await expectInSync(orderId)).status).toBe('CANCELLED');
    }
  });

  it('a completion waiting behind an in-flight cancellation is rejected and does not count', async () => {
    const orderId = await awardedOrder();
    await act(orderId, 'start');
    await passQc(orderId);
    const before = await completedCount();
    const cancelling = holdLock(
      (tx) => tx.$queryRaw`SELECT 1 FROM "Job" WHERE "id" = ${BRACKETS} FOR UPDATE`,
      async (tx) => {
        await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancellationReason: 'held' } });
        await tx.job.update({ where: { id: BRACKETS }, data: { status: 'CANCELLED' } });
      },
    );
    await cancelling.locked;
    const pending = Promise.resolve(act(orderId, 'complete'));
    await untilBlockedOnLock();
    cancelling.release();
    await cancelling.done;
    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Cannot complete an order that is CANCELLED');
    expect(await completedCount()).toBe(before);
  });

  it('complete racing cancellation (parallel): exactly one wins; the count matches the outcome', async () => {
    for (let round = 0; round < 3; round += 1) {
      if (round > 0) await freshSession();
      const orderId = await awardedOrder();
      await act(orderId, 'start');
      await passQc(orderId);
      const before = await completedCount();
      const [rd, rc] = await Promise.all([act(orderId, 'complete'), act(orderId, 'cancel')]);
      expect([rd.status, rc.status].sort()).toEqual([200, 409]);
      const order = await expectInSync(orderId);
      if (rd.status === 200) {
        expect(order.status).toBe('COMPLETED');
        expect(await completedCount()).toBe(before + 1);
        expect(rc.body.message).toBe('Cannot cancel an order that is COMPLETED');
      } else {
        expect(order.status).toBe('CANCELLED');
        expect(await completedCount()).toBe(before);
        expect(rd.body.message).toBe('Cannot complete an order that is CANCELLED');
      }
    }
  });

  it('a profile edit that read the workshop before a completion still succeeds (no version bump)', async () => {
    const orderId = await awardedOrder();
    await act(orderId, 'start');
    await passQc(orderId);
    const before = await completedCount();
    // The edit's pre-read happens, then a real completion commits, then the edit writes.
    afterNextWorkshopRead(async () => {
      expect((await act(orderId, 'complete')).status).toBe(200);
    });
    const res = await request(app)
      .put(`/api/workshops/${PRECISION}`)
      .set(auth(await tokenFor(owner(PRECISION))))
      .send({ description: 'Edited while an order completed' });
    expect(res.status).toBe(200);
    const ws = await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } });
    expect(ws.description).toBe('Edited while an order completed');
    expect(ws.totalCompletedJobs).toBe(before + 1);
  });

  it('a completion waits for an in-flight profile edit holding the workshop row, then both apply', async () => {
    const orderId = await awardedOrder();
    await act(orderId, 'start');
    await passQc(orderId);
    const before = await completedCount();
    const editing = holdLock(
      (tx) => tx.$queryRaw`SELECT 1 FROM "Workshop" WHERE "id" = ${PRECISION} FOR UPDATE`,
      (tx) => tx.workshop.update({ where: { id: PRECISION }, data: { description: 'Held edit' } }),
    );
    await editing.locked;
    const pending = Promise.resolve(act(orderId, 'complete'));
    await untilBlockedOnLock(); // the increment (taken last) waits on the workshop row
    editing.release();
    await editing.done;
    const res = await pending;
    expect(res.status).toBe(200);
    const ws = await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } });
    expect(ws.totalCompletedJobs).toBe(before + 1);
    expect(ws.description).toBe('Held edit');
  });

  it('an invite of the same workshop whose matching ran before a completion still succeeds', async () => {
    const orderId = await awardedOrder();
    await act(orderId, 'start');
    await passQc(orderId);
    // The invite's matching snapshot is taken, then a real completion commits; the invite's
    // re-check of the workshop version must not see a change.
    afterNextMatchingRead(async () => {
      expect((await act(orderId, 'complete')).status).toBe(200);
    });
    const res = await request(app).post(`/api/jobs/${SHAFTS}/invitations`).set(auth(await tokenFor(ASHA))).send({ workshopId: PRECISION });
    expect(res.status).toBe(201);
  });

  it('completion, a profile edit and an invite of the same workshop in parallel: no deadlock, no conflict', async () => {
    const orderId = await awardedOrder();
    await act(orderId, 'start');
    await passQc(orderId);
    const before = await completedCount();
    const [rd, re, ri] = await Promise.all([
      act(orderId, 'complete'),
      request(app).put(`/api/workshops/${PRECISION}`).set(auth(await tokenFor(owner(PRECISION)))).send({ description: 'Parallel edit' }),
      request(app).post(`/api/jobs/${SHAFTS}/invitations`).set(auth(await tokenFor(ASHA))).send({ workshopId: PRECISION }),
    ]);
    expect(rd.status).toBe(200);
    expect(re.status).toBe(200);
    // The invite can only lose to the profile edit (a real profile change), never to the completion.
    expect([201, 409]).toContain(ri.status);
    expect(await completedCount()).toBe(before + 1);
  });
});
