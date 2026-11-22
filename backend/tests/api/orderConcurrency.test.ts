import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Prisma } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';

/**
 * I4 award concurrency: real parallel requests, real row locks held by a
 * second transaction, and a deterministic race injected right after award's
 * pre-transaction read.
 */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const ASHA = 'seed-user-buyer-asha';
const BRACKETS = 'seed-job-alu-brackets';
const PRECISION = 'seed-ws-precision-works';
const MUMBAI = 'seed-ws-mumbai-metalcraft';
const TALEGAON = 'seed-ws-talegaon-tooling';
const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;
const VALID = { totalPrice: '12500.50', estimatedDays: 14 };

let tokenFor: (userId: string) => Promise<string>;

// File-scoped spy delegating to the real method unless a race is injected.
const realQuoteFind = prisma.quote.findUnique.bind(prisma.quote);
const quoteFindSpy = vi
  .spyOn(prisma.quote, 'findUnique')
  .mockImplementation(realQuoteFind as unknown as typeof prisma.quote.findUnique);

/** Runs `write` right after the next pre-transaction quote read (award's or an edit's). */
function afterNextQuoteRead(write: () => Promise<unknown>) {
  quoteFindSpy.mockImplementationOnce((async (args: Parameters<typeof realQuoteFind>[0]) => {
    const snapshot = await realQuoteFind(args);
    await write();
    return snapshot;
  }) as unknown as typeof prisma.quote.findUnique);
}

/** Holds a lock via `lock`, waits for release(), runs `write`, then commits. */
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

async function invitation(workshopId: string, accept = true) {
  const inv = await request(app).post(`/api/jobs/${BRACKETS}/invitations`).set(auth(await tokenFor(ASHA))).send({ workshopId });
  expect(inv.status).toBe(201);
  const id: string = inv.body.data.invitation.id;
  if (accept) {
    const res = await request(app)
      .post(`/api/invitations/${id}/respond`)
      .set(auth(await tokenFor(owner(workshopId))))
      .send({ response: 'ACCEPTED' });
    expect(res.status).toBe(200);
  }
  return id;
}
const submit = async (invitationId: string, workshopId: string, body: Record<string, unknown> = VALID) =>
  request(app).post(`/api/quotes/invitations/${invitationId}`).set(auth(await tokenFor(owner(workshopId)))).send(body);
async function submittedQuote(workshopId: string) {
  const res = await submit(await invitation(workshopId), workshopId);
  expect(res.status).toBe(201);
  return res.body.data.quote as { id: string; invitationId: string };
}
const award = async (quoteId: string) =>
  request(app).post(`/api/orders/award/${quoteId}`).set(auth(await tokenFor(ASHA)));
const edit = async (quoteId: string, workshopId: string, body: Record<string, unknown>) =>
  request(app).patch(`/api/quotes/${quoteId}`).set(auth(await tokenFor(owner(workshopId)))).send(body);
const cancelJob = async () =>
  request(app).put(`/api/jobs/${BRACKETS}`).set(auth(await tokenFor(ASHA))).send({ status: 'CANCELLED' });
const respond = async (invitationId: string, workshopId: string, response: 'ACCEPTED' | 'DECLINED') =>
  request(app).post(`/api/invitations/${invitationId}/respond`).set(auth(await tokenFor(owner(workshopId)))).send({ response });

/** Invariants after any race: at most one order, consistent with the job and quotes. */
async function expectConsistent() {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
  const orders = await prisma.order.findMany({ where: { jobId: BRACKETS }, include: { quote: true } });
  const accepted = await prisma.quote.findMany({ where: { jobId: BRACKETS, status: 'ACCEPTED' } });
  expect(orders.length).toBeLessThanOrEqual(1);
  if (orders.length === 1) {
    expect(job.status).toBe('AWARDED');
    expect(accepted.map((q) => q.id)).toEqual([orders[0].quoteId]);
    expect(orders[0].agreedPrice.toFixed(2)).toBe(orders[0].quote.totalPrice.toFixed(2));
    expect(await prisma.quote.count({ where: { jobId: BRACKETS, status: 'SUBMITTED' } })).toBe(0);
  } else {
    expect(job.status).not.toBe('AWARDED');
    expect(accepted).toHaveLength(0);
  }
  return { job, order: orders[0] };
}

async function freshSession() {
  tokenFor = await seededSession();
  for (const id of [ASHA, owner(PRECISION), owner(MUMBAI), owner(TALEGAON)]) await tokenFor(id);
}

beforeEach(freshSession);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('award concurrency', () => {
  it('two simultaneous awards of different quotes create exactly one order', async () => {
    const a = await submittedQuote(PRECISION);
    const b = await submittedQuote(MUMBAI);
    const [ra, rb] = await Promise.all([award(a.id), award(b.id)]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.message).toBe('This job has already been awarded to another quote');
    const { order } = await expectConsistent();
    expect(order.quoteId).toBe(ra.status === 201 ? a.id : b.id);
  });

  it('simultaneous repeats of the same award create one order and return it to every caller', async () => {
    const q = await submittedQuote(PRECISION);
    const results = await Promise.all([award(q.id), award(q.id), award(q.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(results.map((r) => r.body.data.order.id)).size).toBe(1);
    expect(results.filter((r) => r.body.data.created)).toHaveLength(1);
    expect(await prisma.order.count()).toBe(1);
    await expectConsistent();
  });

  it('an edit committed right after award read the quote is the price that gets awarded', async () => {
    const q = await submittedQuote(PRECISION);
    // Award's pre-read sees 12500.50; a real edit commits before award takes any lock.
    afterNextQuoteRead(async () => {
      const res = await edit(q.id, PRECISION, { totalPrice: '9876.54' });
      expect(res.status).toBe(200);
    });
    const res = await award(q.id);
    expect(res.status).toBe(201);
    expect(res.body.data.order.agreedPrice).toBe('9876.54');
    expect((await expectConsistent()).order.agreedPrice.toFixed(2)).toBe('9876.54');
  });

  it('an award waiting behind an in-flight quote edit uses the newly committed price', async () => {
    const q = await submittedQuote(PRECISION);
    // Stand-in for an in-flight edit: holds the job FOR SHARE and the quote FOR UPDATE (as I2 does).
    const editor = holdLock(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Job" WHERE "id" = ${BRACKETS} FOR SHARE`;
        await tx.$queryRaw`SELECT 1 FROM "Quote" WHERE "id" = ${q.id} FOR UPDATE`;
      },
      (tx) => tx.quote.update({ where: { id: q.id }, data: { totalPrice: '7777.77' } }),
    );
    await editor.locked;
    const pending = Promise.resolve(award(q.id));
    await untilBlockedOnLock();
    editor.release();
    await editor.done;
    const res = await pending;
    expect(res.status).toBe(201);
    expect(res.body.data.order.agreedPrice).toBe('7777.77');
    await expectConsistent();
  });

  it('an edit waiting behind an in-flight award gets 409 and the awarded price stands', async () => {
    const q = await submittedQuote(PRECISION);
    // Stand-in for an in-flight award holding the job lock exclusively.
    const awarding = holdLock(
      (tx) => tx.$queryRaw`SELECT 1 FROM "Job" WHERE "id" = ${BRACKETS} FOR UPDATE`,
      async (tx) => {
        await tx.job.update({ where: { id: BRACKETS }, data: { status: 'AWARDED' } });
        await tx.quote.update({ where: { id: q.id }, data: { status: 'ACCEPTED' } });
      },
    );
    await awarding.locked;
    const pending = Promise.resolve(edit(q.id, PRECISION, { totalPrice: '1.00' }));
    await untilBlockedOnLock();
    awarding.release();
    await awarding.done;
    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This job is no longer accepting quotes (status AWARDED)');
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q.id } })).totalPrice.toFixed(2)).toBe('12500.50');
  });

  it('parallel award and edit: the order price always equals the final quote price', async () => {
    for (let round = 0; round < 3; round += 1) {
      if (round > 0) await freshSession();
      const q = await submittedQuote(PRECISION);
      const [ra, re] = await Promise.all([award(q.id), edit(q.id, PRECISION, { totalPrice: '4321.00' })]);
      expect(ra.status).toBe(201);
      expect([200, 409]).toContain(re.status);
      const { order } = await expectConsistent();
      expect(order.agreedPrice.toFixed(2)).toBe(re.status === 200 ? '4321.00' : '12500.50');
    }
  });

  it('parallel award and a competing submission: the new quote is refused or rejected, never left SUBMITTED', async () => {
    for (let round = 0; round < 3; round += 1) {
      if (round > 0) await freshSession();
      const q = await submittedQuote(PRECISION);
      const mumbaiInvitation = await invitation(MUMBAI);
      const [ra, rs] = await Promise.all([award(q.id), submit(mumbaiInvitation, MUMBAI)]);
      expect(ra.status).toBe(201);
      expect([201, 409]).toContain(rs.status);
      if (rs.status === 201) {
        expect((await prisma.quote.findUniqueOrThrow({ where: { id: rs.body.data.quote.id } })).status).toBe('REJECTED');
      }
      await expectConsistent();
    }
  });

  it('award racing a job cancellation: exactly one wins and the end state is consistent', async () => {
    for (let round = 0; round < 3; round += 1) {
      if (round > 0) await freshSession();
      const q = await submittedQuote(PRECISION);
      const [ra, rc] = await Promise.all([award(q.id), cancelJob()]);
      const okCount = [ra.status === 201, rc.status === 200].filter(Boolean).length;
      expect(okCount).toBe(1);
      const { job } = await expectConsistent();
      const quote = await prisma.quote.findUniqueOrThrow({ where: { id: q.id } });
      if (ra.status === 201) {
        expect(job.status).toBe('AWARDED');
        expect(quote.status).toBe('ACCEPTED');
        expect(rc.status).toBe(409);
      } else {
        expect(ra.status).toBe(409);
        expect(job.status).toBe('CANCELLED');
        expect(quote.status).toBe('CANCELLED');
        expect(await prisma.order.count()).toBe(0);
      }
    }
  });

  it("award waits for an in-flight invitation response and does not rewrite it as DECLINED", async () => {
    const q = await submittedQuote(PRECISION);
    const talegaon = await invitation(TALEGAON, false); // INVITED
    // Stand-in for respondToInvitation's write in flight on TALEGAON's invitation row.
    const responding = holdLock(
      (tx) => tx.$queryRaw`SELECT 1 FROM "JobInvitation" WHERE "id" = ${talegaon} FOR UPDATE`,
      (tx) => tx.jobInvitation.update({ where: { id: talegaon }, data: { status: 'ACCEPTED', respondedAt: new Date() } }),
    );
    await responding.locked;
    const pending = Promise.resolve(award(q.id));
    await untilBlockedOnLock(); // award's expiry step waits on that invitation row
    responding.release();
    await responding.done;
    const res = await pending;
    expect(res.status).toBe(201);
    // The workshop's own ACCEPTED answer is kept (M8: ACCEPTED is kept on award).
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id: talegaon } })).status).toBe('ACCEPTED');
    expect(await prisma.jobInvitation.count({ where: { status: 'DECLINED' } })).toBe(0);
    await expectConsistent();
  });

  it('parallel award and invitation responses: no invitation is ever marked DECLINED by the award', async () => {
    for (let round = 0; round < 3; round += 1) {
      if (round > 0) await freshSession();
      const q = await submittedQuote(PRECISION);
      const talegaon = await invitation(TALEGAON, false);
      const [ra, rr] = await Promise.all([award(q.id), respond(talegaon, TALEGAON, 'ACCEPTED')]);
      expect(ra.status).toBe(201);
      expect([200, 409]).toContain(rr.status);
      const status = (await prisma.jobInvitation.findUniqueOrThrow({ where: { id: talegaon } })).status;
      expect(status).toBe(rr.status === 200 ? 'ACCEPTED' : 'EXPIRED');
      expect(await prisma.jobInvitation.count({ where: { status: 'DECLINED' } })).toBe(0);
      await expectConsistent();
    }
  });

  it('award racing a new invitation for the same job completes without deadlock', async () => {
    const q = await submittedQuote(PRECISION);
    const [ra, ri] = await Promise.all([
      award(q.id),
      request(app).post(`/api/jobs/${BRACKETS}/invitations`).set(auth(await tokenFor(ASHA))).send({ workshopId: TALEGAON }),
    ]);
    expect(ra.status).toBe(201);
    expect([201, 409]).toContain(ri.status);
    if (ri.status === 201) {
      // Committed before the award: the award then expired it (outstanding INVITED on an awarded job).
      expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id: ri.body.data.invitation.id } })).status).toBe('EXPIRED');
    }
    await expectConsistent();
  });
});
