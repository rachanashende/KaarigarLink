import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { registerUser } from '../helpers/auth';
import { seededSession, SEED_TEST_PASSWORD } from '../helpers/seedSession';
import { JOBS } from '../../prisma/seed/data';
import { runSeed, SeedConflictError } from '../../prisma/seed/seeder';

/**
 * I3 seed safety: reseeding clears seed-job quotes before their invitations,
 * preserves everything outside the seed-owned scope, and refuses (changing
 * nothing) when orders exist on seed jobs or seed workshops.
 */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const ASHA = 'seed-user-buyer-asha';
const BRACKETS = 'seed-job-alu-brackets';
const PRECISION = 'seed-ws-precision-works';
const MUMBAI = 'seed-ws-mumbai-metalcraft';
const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;
const SEED_JOB_IDS = JOBS.map((j) => j.id);
const VALID = { totalPrice: '12500.50', estimatedDays: 14 };

let tokenFor: (userId: string) => Promise<string>;

const TABLES = [
  'User', 'Workshop', 'Machine', 'Capability', 'WorkshopCapacity', 'Job', 'JobRequirement',
  'JobInvitation', 'Quote', 'Order', 'Milestone', 'Inspection', 'Payment', 'Rating',
];

/** md5 of every row of every application table: equal fingerprints = nothing changed. */
async function fingerprint() {
  const out: Record<string, string> = {};
  for (const t of TABLES) {
    const [row] = await prisma.$queryRawUnsafe<{ h: string | null }[]>(
      `SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM "${t}" x`,
    );
    out[t] = row.h ?? '';
  }
  return out;
}

/** A quote on a seed job through the real API (invite -> accept -> submit). */
async function seedJobQuote(workshopId: string) {
  const inv = await request(app).post(`/api/jobs/${BRACKETS}/invitations`).set(auth(await tokenFor(ASHA))).send({ workshopId });
  expect(inv.status).toBe(201);
  const invitationId: string = inv.body.data.invitation.id;
  const token = await tokenFor(owner(workshopId));
  expect((await request(app).post(`/api/invitations/${invitationId}/respond`).set(auth(token)).send({ response: 'ACCEPTED' })).status).toBe(200);
  const q = await request(app).post(`/api/quotes/invitations/${invitationId}`).set(auth(token)).send(VALID);
  expect(q.status).toBe(201);
  return q.body.data.quote as { id: string; invitationId: string; jobId: string; workshopId: string };
}

/** Real (non-seed) buyer, job, workshop, invitation and quote. */
async function realData() {
  const buyer = await registerUser('BUYER');
  const job = await request(app)
    .post('/api/jobs')
    .set(auth(buyer.token))
    .send({
      title: 'Real customer job',
      material: 'brass',
      manufacturingProcess: 'LATHE_TURNING',
      quantity: 42,
      deadline: new Date(Date.now() + 20 * 86_400_000).toISOString(),
    });
  expect(job.status).toBe(201);
  const jobId: string = job.body.data.job.id;
  const realWorkshop = await registerUser('WORKSHOP');
  const realWorkshopId = (await prisma.workshop.findUniqueOrThrow({ where: { userId: realWorkshop.user.id } })).id;
  // Invitations/quotes for a real job, from a real workshop and from a seed workshop.
  // Created directly: the scope rule depends only on the job, not on how the rows were made.
  const rows = [];
  for (const workshopId of [realWorkshopId, PRECISION]) {
    const invitation = await prisma.jobInvitation.create({
      data: { jobId, workshopId, matchScore: 70, scoreBreakdown: {}, matchReasons: [], rank: 1, status: 'ACCEPTED' },
    });
    const quote = await prisma.quote.create({
      data: { invitationId: invitation.id, jobId, workshopId, totalPrice: '777.70', estimatedDays: 5 },
    });
    rows.push({ invitation, quote });
  }
  return { buyer, jobId, realWorkshopId, rows };
}

/** Everything outside the seed-owned scope, for before/after comparison. */
async function nonSeedSnapshot() {
  const notSeed = { NOT: { id: { startsWith: 'seed-' } } };
  return {
    users: await prisma.user.findMany({ where: notSeed, orderBy: { id: 'asc' } }),
    workshops: await prisma.workshop.findMany({ where: notSeed, orderBy: { id: 'asc' } }),
    jobs: await prisma.job.findMany({ where: notSeed, orderBy: { id: 'asc' } }),
    invitations: await prisma.jobInvitation.findMany({ where: { jobId: { notIn: SEED_JOB_IDS } }, orderBy: { id: 'asc' } }),
    quotes: await prisma.quote.findMany({ where: { jobId: { notIn: SEED_JOB_IDS } }, orderBy: { id: 'asc' } }),
  };
}

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('reseeding with quotes', () => {
  it('succeeds: seed-job quotes are cleared before their invitations and reported', async () => {
    await seedJobQuote(PRECISION);
    await seedJobQuote(MUMBAI);
    const summary = await runSeed(prisma, { password: SEED_TEST_PASSWORD });
    expect(summary.quotesCleared).toBe(2);
    expect(summary.invitationsCleared).toBe(2);
    expect(await prisma.quote.count({ where: { jobId: { in: SEED_JOB_IDS } } })).toBe(0);
    expect(await prisma.jobInvitation.count({ where: { jobId: { in: SEED_JOB_IDS } } })).toBe(0);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } })).status).toBe('OPEN');
  });

  it('is repeatable after clearing quotes (second run clears nothing)', async () => {
    await seedJobQuote(PRECISION);
    await runSeed(prisma, { password: SEED_TEST_PASSWORD });
    const again = await runSeed(prisma, { password: SEED_TEST_PASSWORD });
    expect(again).toMatchObject({ quotesCleared: 0, invitationsCleared: 0 });
  });

  it('a cancelled seed job with CANCELLED quotes is reset too', async () => {
    await seedJobQuote(PRECISION);
    expect((await request(app).put(`/api/jobs/${BRACKETS}`).set(auth(await tokenFor(ASHA))).send({ status: 'CANCELLED' })).status).toBe(200);
    const summary = await runSeed(prisma, { password: SEED_TEST_PASSWORD });
    expect(summary.quotesCleared).toBe(1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } })).status).toBe('OPEN');
  });

  it('preserves every record outside the seed-owned scope, including quotes by seed workshops on real jobs', async () => {
    const real = await realData();
    await seedJobQuote(PRECISION);
    const before = await nonSeedSnapshot();
    expect(before.quotes).toHaveLength(2);

    const summary = await runSeed(prisma, { password: SEED_TEST_PASSWORD });

    expect(summary.quotesCleared).toBe(1);
    expect(await nonSeedSnapshot()).toEqual(before);
    for (const { invitation, quote } of real.rows) {
      expect(await prisma.jobInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).toEqual(invitation);
      expect(await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).toEqual(quote);
    }
  });
});

describe('reseeding with orders (order history is never touched)', () => {
  it('refuses when an order exists on a seed job, and changes nothing', async () => {
    const quote = await seedJobQuote(PRECISION);
    await prisma.order.create({
      data: { jobId: BRACKETS, quoteId: quote.id, buyerId: ASHA, workshopId: PRECISION, agreedPrice: '12500.50' },
    });
    // A seed-owned change that a successful run would reset - it must survive the refusal.
    await prisma.job.update({ where: { id: 'seed-job-titanium-drone' }, data: { quantity: 1 } });
    const before = await fingerprint();

    const run = runSeed(prisma, { password: SEED_TEST_PASSWORD });
    await expect(run).rejects.toBeInstanceOf(SeedConflictError);
    await expect(runSeed(prisma, { password: SEED_TEST_PASSWORD })).rejects.toThrow(
      /Orders exist on seed jobs or seed workshops: .*job seed-job-alu-brackets.*nothing was changed/,
    );

    expect(await fingerprint()).toEqual(before);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: 'seed-job-titanium-drone' } })).quantity).toBe(1);
  });

  it('refuses when an order on a REAL job references a seed workshop, and changes nothing', async () => {
    const real = await realData();
    const seedWorkshopQuote = real.rows[1].quote; // PRECISION's quote on the real job
    await prisma.order.create({
      data: {
        jobId: real.jobId,
        quoteId: seedWorkshopQuote.id,
        buyerId: real.buyer.user.id,
        workshopId: PRECISION,
        agreedPrice: '777.70',
      },
    });
    await prisma.workshop.update({ where: { id: PRECISION }, data: { rating: 3.1, ratingCount: 9 } });
    const before = await fingerprint();

    await expect(runSeed(prisma, { password: SEED_TEST_PASSWORD })).rejects.toThrow(
      new RegExp(`workshop ${PRECISION}`),
    );

    expect(await fingerprint()).toEqual(before);
    // Ratings earned through real orders are not overwritten by dataset values.
    expect(await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } })).toMatchObject({ rating: 3.1, ratingCount: 9 });
  });

  it('an order between real parties only does not block seeding', async () => {
    const real = await realData();
    const realQuote = real.rows[0].quote; // real workshop's quote on the real job
    const order = await prisma.order.create({
      data: { jobId: real.jobId, quoteId: realQuote.id, buyerId: real.buyer.user.id, workshopId: real.realWorkshopId, agreedPrice: '777.70' },
    });
    await seedJobQuote(PRECISION);
    const summary = await runSeed(prisma, { password: SEED_TEST_PASSWORD });
    expect(summary.quotesCleared).toBe(1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(order);
  });
});

describe('foreign keys that make the deletion order matter', () => {
  it('an invitation with a quote cannot be deleted directly (Restrict)', async () => {
    const quote = await seedJobQuote(PRECISION);
    const err = await prisma.jobInvitation.delete({ where: { id: quote.invitationId } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((err as Prisma.PrismaClientKnownRequestError).code).toBe('P2003');
  });

  it('a quote referenced by an order cannot be deleted (Restrict)', async () => {
    const quote = await seedJobQuote(PRECISION);
    await prisma.order.create({
      data: { jobId: BRACKETS, quoteId: quote.id, buyerId: ASHA, workshopId: PRECISION, agreedPrice: '12500.50' },
    });
    const err = await prisma.quote.delete({ where: { id: quote.id } }).catch((e: unknown) => e);
    expect((err as Prisma.PrismaClientKnownRequestError).code).toBe('P2003');
  });
});
