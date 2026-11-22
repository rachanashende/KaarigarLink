import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Prisma } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';

/**
 * I2 concurrency: real parallel requests, real row locks held by a second
 * transaction (standing in for an in-flight award / cancellation), and a
 * deterministic race injected right after the service's pre-transaction read.
 */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const ASHA = 'seed-user-buyer-asha';
const BRACKETS = 'seed-job-alu-brackets';
const PRECISION = 'seed-ws-precision-works';
const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;
const VALID = { totalPrice: '12500.50', estimatedDays: 14 };

let tokenFor: (userId: string) => Promise<string>;

// File-scoped spy delegating to the real method unless a race is injected
// (restoring a Prisma delegate method would leave it undefined).
const realQuoteFind = prisma.quote.findUnique.bind(prisma.quote);
const quoteFindSpy = vi
  .spyOn(prisma.quote, 'findUnique')
  .mockImplementation(realQuoteFind as unknown as typeof prisma.quote.findUnique);

/** Runs `write` right after updateQuote's pre-transaction read of the quote. */
function afterNextQuoteRead(write: () => Promise<unknown>) {
  quoteFindSpy.mockImplementationOnce((async (args: Parameters<typeof realQuoteFind>[0]) => {
    const snapshot = await realQuoteFind(args);
    await write();
    return snapshot;
  }) as unknown as typeof prisma.quote.findUnique);
}

/**
 * Opens a transaction that locks the job row FOR UPDATE (what cancellation and
 * award do first), keeps it until release(), then runs `write` and commits.
 */
function holdJobLock(write: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let markLocked!: () => void;
  const locked = new Promise<void>((r) => (markLocked = r));
  const done = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Job" WHERE "id" = ${BRACKETS} FOR UPDATE`;
      markLocked();
      await gate;
      await write(tx);
    },
    { timeout: 20_000 },
  );
  return { locked, release, done };
}

/** Resolves once some backend session is waiting on a row lock in this database. */
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

const start = <T>(req: PromiseLike<T>) => Promise.resolve(req);

async function acceptedInvitation() {
  const inv = await request(app)
    .post(`/api/jobs/${BRACKETS}/invitations`)
    .set(auth(await tokenFor(ASHA)))
    .send({ workshopId: PRECISION });
  expect(inv.status).toBe(201);
  const id: string = inv.body.data.invitation.id;
  const res = await request(app)
    .post(`/api/invitations/${id}/respond`)
    .set(auth(await tokenFor(owner(PRECISION))))
    .send({ response: 'ACCEPTED' });
  expect(res.status).toBe(200);
  return id;
}

const submit = async (invitationId: string, body: Record<string, unknown> = VALID) =>
  request(app).post(`/api/quotes/invitations/${invitationId}`).set(auth(await tokenFor(owner(PRECISION)))).send(body);
const edit = async (quoteId: string, body: Record<string, unknown>) =>
  request(app).patch(`/api/quotes/${quoteId}`).set(auth(await tokenFor(owner(PRECISION)))).send(body);
const cancelJob = async () =>
  request(app).put(`/api/jobs/${BRACKETS}`).set(auth(await tokenFor(ASHA))).send({ status: 'CANCELLED' });

/** What a cancellation writes (M5): job CANCELLED, INVITED/ACCEPTED invitations EXPIRED. */
async function cancelInTx(tx: Prisma.TransactionClient) {
  await tx.job.update({ where: { id: BRACKETS }, data: { status: 'CANCELLED' } });
  await tx.jobInvitation.updateMany({
    where: { jobId: BRACKETS, status: { in: ['INVITED', 'ACCEPTED'] } },
    data: { status: 'EXPIRED' },
  });
}

beforeEach(async () => {
  tokenFor = await seededSession();
  // Log in before any race so logins don't interleave with the injected writes.
  for (const id of [ASHA, owner(PRECISION)]) await tokenFor(id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('quote concurrency', () => {
  it('parallel submissions for one invitation create exactly one quote', async () => {
    const id = await acceptedInvitation();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => submit(id, { ...VALID, totalPrice: `${100 + i}.00` })),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(r.body).toEqual({ success: false, message: 'A quote already exists for this invitation; update it instead' });
    }
    const rows = await prisma.quote.findMany({ where: { invitationId: id } });
    expect(rows).toHaveLength(1);
    const winner = results.find((r) => r.status === 201)!;
    expect(rows[0].totalPrice.toFixed(2)).toBe(winner.body.data.quote.totalPrice);
  });

  it('a submission waits for an in-flight cancellation, then is rejected', async () => {
    const id = await acceptedInvitation();
    const holder = holdJobLock(cancelInTx);
    await holder.locked;
    const pending = start(submit(id));
    await untilBlockedOnLock();
    holder.release();
    await holder.done;
    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This job is no longer accepting quotes (status CANCELLED)');
    expect(await prisma.quote.count({ where: { jobId: BRACKETS } })).toBe(0);
  });

  it('an edit waits for an in-flight award, then is rejected and changes nothing', async () => {
    const id = await acceptedInvitation();
    const quote = (await submit(id)).body.data.quote;
    const holder = holdJobLock(async (tx) => {
      await tx.job.update({ where: { id: BRACKETS }, data: { status: 'AWARDED' } });
      await tx.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } });
    });
    await holder.locked;
    const pending = start(edit(quote.id, { totalPrice: '1.00' }));
    await untilBlockedOnLock();
    holder.release();
    await holder.done;
    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This job is no longer accepting quotes (status AWARDED)');
    const row = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(row.totalPrice.toFixed(2)).toBe('12500.50');
    expect(row.status).toBe('ACCEPTED');
  });

  it('an edit waits for an in-flight invitation closure, then is rejected', async () => {
    const id = await acceptedInvitation();
    const quote = (await submit(id)).body.data.quote;
    // A transition that keeps the job open but closes this invitation under the job lock.
    const holder = holdJobLock((tx) => tx.jobInvitation.update({ where: { id }, data: { status: 'EXPIRED' } }));
    await holder.locked;
    const pending = start(edit(quote.id, { totalPrice: '1.00' }));
    await untilBlockedOnLock();
    holder.release();
    await holder.done;
    const res = await pending;
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The invitation has expired; quotes are not allowed');
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).totalPrice.toFixed(2)).toBe('12500.50');
  });

  it('a cancellation issued while an edit holds the job lock waits for it (no deadlock)', async () => {
    const id = await acceptedInvitation();
    const quote = (await submit(id)).body.data.quote;
    const [editRes, cancelRes] = await Promise.all([edit(quote.id, { totalPrice: '999.00' }), cancelJob()]);
    expect(cancelRes.status).toBe(200);
    // Either the edit committed first (200) or saw the cancellation (409) - never both half-done.
    expect([200, 409]).toContain(editRes.status);
    const row = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(row.totalPrice.toFixed(2)).toBe(editRes.status === 200 ? '999.00' : '12500.50');
    expect((await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } })).status).toBe('CANCELLED');
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
  });

  it('parallel edits of one quote are serialised; the final row equals one of them', async () => {
    const id = await acceptedInvitation();
    const quote = (await submit(id)).body.data.quote;
    const results = await Promise.all(['100.00', '200.00', '300.00'].map((p) => edit(quote.id, { totalPrice: p })));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const row = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(['100.00', '200.00', '300.00']).toContain(row.totalPrice.toFixed(2));
    const versions = results.map((r) => new Date(r.body.data.quote.updatedAt).getTime());
    expect(new Set(versions).size).toBe(3); // each edit advanced the version
  });

  it('an edit based on a stale read (job cancelled right after it) is rejected', async () => {
    const id = await acceptedInvitation();
    const quote = (await submit(id)).body.data.quote;
    afterNextQuoteRead(() => prisma.$transaction(cancelInTx));
    const res = await edit(quote.id, { totalPrice: '1.00' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This job is no longer accepting quotes (status CANCELLED)');
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).totalPrice.toFixed(2)).toBe('12500.50');
  });

  it('an edit based on a stale read (quote accepted right after it) is rejected', async () => {
    const id = await acceptedInvitation();
    const quote = (await submit(id)).body.data.quote;
    afterNextQuoteRead(() => prisma.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } }));
    const res = await edit(quote.id, { totalPrice: '1.00' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Only SUBMITTED quotes can be edited (this quote is ACCEPTED)');
  });
});
