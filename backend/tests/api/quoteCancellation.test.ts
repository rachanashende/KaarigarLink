import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Prisma } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';

/**
 * I3: cancelling a job cancels its SUBMITTED quotes in the same transaction
 * that cancels the job and expires its invitations.
 */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const ASHA = 'seed-user-buyer-asha'; // owns BRACKETS and SHAFTS
const BRACKETS = 'seed-job-alu-brackets'; // eligible: precision, mumbai, talegaon
const SHAFTS = 'seed-job-stainless-shafts'; // eligible: precision only
const PRECISION = 'seed-ws-precision-works';
const MUMBAI = 'seed-ws-mumbai-metalcraft';
const TALEGAON = 'seed-ws-talegaon-tooling';
const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;
const VALID = { totalPrice: '12500.50', estimatedDays: 14 };

let tokenFor: (userId: string) => Promise<string>;

async function acceptedInvitation(workshopId: string, jobId = BRACKETS) {
  const inv = await request(app)
    .post(`/api/jobs/${jobId}/invitations`)
    .set(auth(await tokenFor(ASHA)))
    .send({ workshopId });
  expect(inv.status).toBe(201);
  const id: string = inv.body.data.invitation.id;
  const res = await request(app)
    .post(`/api/invitations/${id}/respond`)
    .set(auth(await tokenFor(owner(workshopId))))
    .send({ response: 'ACCEPTED' });
  expect(res.status).toBe(200);
  return id;
}

const submit = async (invitationId: string, workshopId: string) =>
  request(app).post(`/api/quotes/invitations/${invitationId}`).set(auth(await tokenFor(owner(workshopId)))).send(VALID);

async function submittedQuote(workshopId: string, jobId = BRACKETS) {
  const res = await submit(await acceptedInvitation(workshopId, jobId), workshopId);
  expect(res.status).toBe(201);
  return res.body.data.quote as { id: string; invitationId: string };
}

const cancelJob = async (jobId = BRACKETS) =>
  request(app).put(`/api/jobs/${jobId}`).set(auth(await tokenFor(ASHA))).send({ status: 'CANCELLED' });
const quoteStatus = async (id: string) => (await prisma.quote.findUniqueOrThrow({ where: { id } })).status;

/** Invariant: no SUBMITTED quote may exist on a cancelled job. */
const submittedOnCancelledJobs = () =>
  prisma.quote.count({ where: { status: 'SUBMITTED', job: { is: { status: 'CANCELLED' } } } });

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

beforeEach(async () => {
  tokenFor = await seededSession();
  for (const id of [ASHA, owner(PRECISION), owner(MUMBAI), owner(TALEGAON)]) await tokenFor(id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('cancelling a job with quotes', () => {
  it('cancels every SUBMITTED quote, expires the invitations and cancels the job together', async () => {
    const a = await submittedQuote(PRECISION);
    const b = await submittedQuote(MUMBAI);
    const res = await cancelJob();
    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('CANCELLED');
    expect(await quoteStatus(a.id)).toBe('CANCELLED');
    expect(await quoteStatus(b.id)).toBe('CANCELLED');
    const invitations = await prisma.jobInvitation.findMany({ where: { jobId: BRACKETS } });
    expect(invitations.map((i) => i.status)).toEqual(['EXPIRED', 'EXPIRED']);
    expect(await submittedOnCancelledJobs()).toBe(0);
  });

  it('leaves quotes in every other status unchanged', async () => {
    const quotes = [
      await submittedQuote(PRECISION),
      await submittedQuote(MUMBAI),
      await submittedQuote(TALEGAON),
    ];
    // States that cannot normally coexist with a cancellable job, set directly to test the filter.
    const preset = ['WITHDRAWN', 'REJECTED', 'ACCEPTED'] as const;
    for (const [i, status] of preset.entries()) {
      await prisma.quote.update({ where: { id: quotes[i].id }, data: { status } });
    }
    const extra = await prisma.quote.findUniqueOrThrow({ where: { id: quotes[0].id } });
    expect((await cancelJob()).status).toBe(200);
    for (const [i, status] of preset.entries()) expect(await quoteStatus(quotes[i].id)).toBe(status);
    // Untouched rows are really untouched (not rewritten with the same status).
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quotes[0].id } })).updatedAt).toEqual(extra.updatedAt);
  });

  it("does not touch another job's quotes", async () => {
    const mine = await submittedQuote(PRECISION, BRACKETS);
    const other = await submittedQuote(PRECISION, SHAFTS);
    expect((await cancelJob(BRACKETS)).status).toBe(200);
    expect(await quoteStatus(mine.id)).toBe('CANCELLED');
    expect(await quoteStatus(other.id)).toBe('SUBMITTED');
    expect((await prisma.job.findUniqueOrThrow({ where: { id: SHAFTS } })).status).toBe('MATCHED');
  });

  it('a job without quotes cancels exactly as before (M5)', async () => {
    const res = await cancelJob();
    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('CANCELLED');
    expect(await prisma.quote.count()).toBe(0);
  });

  it('is atomic: if cancelling the quotes fails, the job and invitations are not changed', async () => {
    const quote = await submittedQuote(PRECISION);
    const before = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
    // Inject a real failure into the cancellation's own quote UPDATE (test database only).
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION i3_fail_quote_cancel() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected failure'; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER i3_fail_quote_cancel BEFORE UPDATE ON "Quote"
      FOR EACH ROW WHEN (NEW.status = 'CANCELLED') EXECUTE FUNCTION i3_fail_quote_cancel()`);
    try {
      const res = await cancelJob();
      expect(res.status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS i3_fail_quote_cancel ON "Quote"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS i3_fail_quote_cancel()');
    }
    const after = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
    expect(after.status).toBe('MATCHED');
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id: quote.invitationId } })).status).toBe('ACCEPTED');
    expect(await quoteStatus(quote.id)).toBe('SUBMITTED');
    // Without the injected failure the same cancellation then succeeds.
    expect((await cancelJob()).status).toBe(200);
    expect(await quoteStatus(quote.id)).toBe('CANCELLED');
  });
});

describe('a cancelled quote is final', () => {
  it('cannot be edited', async () => {
    const quote = await submittedQuote(PRECISION);
    await cancelJob();
    const res = await request(app)
      .patch(`/api/quotes/${quote.id}`)
      .set(auth(await tokenFor(owner(PRECISION))))
      .send({ totalPrice: '1.00' });
    expect(res.status).toBe(409);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).totalPrice.toFixed(2)).toBe('12500.50');
  });

  it('cannot be awarded (409), and no order is created', async () => {
    const quote = await submittedQuote(PRECISION);
    await cancelJob();
    const res = await request(app).post(`/api/orders/award/${quote.id}`).set(auth(await tokenFor(ASHA)));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This job cannot be awarded (status CANCELLED)');
    expect(await prisma.order.count()).toBe(0);
    expect(await quoteStatus(quote.id)).toBe('CANCELLED');
  });

  it('shows as CANCELLED to the buyer and to the workshop', async () => {
    await submittedQuote(PRECISION);
    await cancelJob();
    const buyer = await request(app).get(`/api/quotes/jobs/${BRACKETS}`).set(auth(await tokenFor(ASHA)));
    expect(buyer.body.data.quotes.map((q: { status: string }) => q.status)).toEqual(['CANCELLED']);
    const mine = await request(app).get('/api/quotes/mine').set(auth(await tokenFor(owner(PRECISION))));
    expect(mine.body.data.quotes.map((q: { status: string }) => q.status)).toEqual(['CANCELLED']);
  });

  it('a new quote cannot be submitted on the cancelled job', async () => {
    const invitationId = await acceptedInvitation(PRECISION);
    await cancelJob();
    const res = await submit(invitationId, PRECISION);
    expect(res.status).toBe(409);
    expect(await prisma.quote.count()).toBe(0);
  });
});

describe('cancellation concurrency', () => {
  it('a quote committed while the cancellation waits on the job lock is cancelled too', async () => {
    const invitationId = await acceptedInvitation(PRECISION);
    // Stand-in for an in-flight quote submission: it holds the job FOR SHARE (as quote
    // writes do) and inserts a SUBMITTED quote, committing only after the cancel is waiting.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let markLocked!: () => void;
    const locked = new Promise<void>((r) => (markLocked = r));
    const submission = prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.$queryRaw`SELECT 1 FROM "Job" WHERE "id" = ${BRACKETS} FOR SHARE`;
        await tx.quote.create({
          data: { invitationId, jobId: BRACKETS, workshopId: PRECISION, totalPrice: '100.00', estimatedDays: 3 },
        });
        markLocked();
        await gate;
      },
      { timeout: 20_000 },
    );
    await locked;
    const cancelling = Promise.resolve(cancelJob());
    await untilBlockedOnLock();
    release();
    await submission;
    const res = await cancelling;
    expect(res.status).toBe(200);
    expect(await prisma.quote.findUniqueOrThrow({ where: { invitationId } })).toMatchObject({ status: 'CANCELLED' });
    expect(await submittedOnCancelledJobs()).toBe(0);
  });

  it('parallel submission and cancellation never leave a SUBMITTED quote on a cancelled job', async () => {
    for (let round = 0; round < 3; round += 1) {
      if (round > 0) {
        tokenFor = await seededSession();
        for (const id of [ASHA, owner(PRECISION)]) await tokenFor(id);
      }
      const invitationId = await acceptedInvitation(PRECISION);
      const [sub, cancel] = await Promise.all([submit(invitationId, PRECISION), cancelJob()]);
      expect(cancel.status).toBe(200);
      expect([201, 409]).toContain(sub.status);
      const quote = await prisma.quote.findUnique({ where: { invitationId } });
      if (sub.status === 201) expect(quote?.status).toBe('CANCELLED');
      else expect(quote).toBeNull();
      expect(await submittedOnCancelledJobs()).toBe(0);
    }
  });

  it('cancellation racing several quote writes completes without deadlock', async () => {
    const edited = await submittedQuote(PRECISION);
    const mumbaiInvitation = await acceptedInvitation(MUMBAI);
    const results = await Promise.all([
      request(app).patch(`/api/quotes/${edited.id}`).set(auth(await tokenFor(owner(PRECISION)))).send({ totalPrice: '2.00' }),
      submit(mumbaiInvitation, MUMBAI),
      cancelJob(),
    ]);
    expect(results[2].status).toBe(200);
    expect([200, 409]).toContain(results[0].status);
    expect([201, 409]).toContain(results[1].status);
    expect(await quoteStatus(edited.id)).toBe('CANCELLED');
    expect(await submittedOnCancelledJobs()).toBe(0);
  });
});
