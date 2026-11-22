import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { createUserDirect } from '../helpers/auth';
import { seededSession } from '../helpers/seedSession';

/** I4: quote award, order lookup and order listing. */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86_400_000;

const ASHA = 'seed-user-buyer-asha'; // owns BRACKETS and SHAFTS
const VIKRAM = 'seed-user-buyer-vikram';
const INSPECTOR = 'seed-user-inspector';
const BRACKETS = 'seed-job-alu-brackets'; // eligible: precision, mumbai, talegaon
const SHAFTS = 'seed-job-stainless-shafts'; // eligible: precision only
const PRECISION = 'seed-ws-precision-works';
const MUMBAI = 'seed-ws-mumbai-metalcraft';
const TALEGAON = 'seed-ws-talegaon-tooling';
const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;
const VALID = { totalPrice: '12500.50', estimatedDays: 14 };

let tokenFor: (userId: string) => Promise<string>;

async function invitation(workshopId: string, jobId = BRACKETS, accept = true) {
  const inv = await request(app).post(`/api/jobs/${jobId}/invitations`).set(auth(await tokenFor(ASHA))).send({ workshopId });
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

async function submittedQuote(workshopId: string, jobId = BRACKETS, body: Record<string, unknown> = VALID) {
  const invitationId = await invitation(workshopId, jobId);
  const res = await request(app)
    .post(`/api/quotes/invitations/${invitationId}`)
    .set(auth(await tokenFor(owner(workshopId))))
    .send(body);
  expect(res.status).toBe(201);
  return res.body.data.quote as { id: string; invitationId: string };
}

const award = async (quoteId: string, as = ASHA, body?: Record<string, unknown>) => {
  const req = request(app).post(`/api/orders/award/${quoteId}`).set(auth(await tokenFor(as)));
  return body === undefined ? req : req.send(body);
};
const getOrder = async (orderId: string, as: string) =>
  request(app).get(`/api/orders/${orderId}`).set(auth(await tokenFor(as)));
const myOrders = async (as: string) => request(app).get('/api/orders/mine').set(auth(await tokenFor(as)));

/** Nothing about the award was written: job still open, no order, quote still SUBMITTED. */
async function expectNotAwarded(quoteId: string) {
  expect(await prisma.order.count()).toBe(0);
  expect((await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } })).status).toBe('MATCHED');
  expect((await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).status).toBe('SUBMITTED');
}

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('POST /api/orders/award/:quoteId - happy path', () => {
  it('creates the order and settles the job, quotes and invitations', async () => {
    const winner = await submittedQuote(PRECISION);
    const loser = await submittedQuote(MUMBAI);
    const pendingInvitation = await invitation(TALEGAON, BRACKETS, false); // never answered
    const jobBefore = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });

    const res = await award(winner.id);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Quote awarded and order created');
    expect(res.body.data.created).toBe(true);
    const order = res.body.data.order;
    expect(order).toMatchObject({
      jobId: BRACKETS,
      quoteId: winner.id,
      buyerId: ASHA,
      workshopId: PRECISION,
      agreedPrice: '12500.50',
      currency: 'INR',
      status: 'CONFIRMED',
      actualCompletionDate: null,
      quote: { id: winner.id, totalPrice: '12500.50', status: 'ACCEPTED' },
      job: { id: BRACKETS, status: 'AWARDED' },
      workshop: { id: PRECISION, businessName: expect.any(String) },
    });
    const expected = Date.now() + 14 * DAY;
    expect(Math.abs(new Date(order.expectedCompletionDate).getTime() - expected)).toBeLessThan(60_000);

    // Job: AWARDED with a strictly later version.
    const job = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
    expect(job.status).toBe('AWARDED');
    expect(job.updatedAt.getTime()).toBeGreaterThan(jobBefore.updatedAt.getTime());
    // Quotes: only the selected one ACCEPTED; other SUBMITTED ones REJECTED.
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: winner.id } })).status).toBe('ACCEPTED');
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: loser.id } })).status).toBe('REJECTED');
    // Invitations (M8): INVITED -> EXPIRED, every ACCEPTED one kept, nothing DECLINED.
    const inv = async (id: string) => (await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status;
    expect(await inv(winner.invitationId)).toBe('ACCEPTED');
    expect(await inv(loser.invitationId)).toBe('ACCEPTED');
    expect(await inv(pendingInvitation)).toBe('EXPIRED');
    expect(await prisma.jobInvitation.count({ where: { status: 'DECLINED' } })).toBe(0);
    expect(await prisma.order.count()).toBe(1);
  });

  it('formats money to two decimals everywhere it returns it', async () => {
    const quote = await submittedQuote(PRECISION, BRACKETS, { totalPrice: 0.1, estimatedDays: 2 });
    const res = await award(quote.id);
    expect(res.body.data.order.agreedPrice).toBe('0.10');
    expect(res.body.data.order.quote.totalPrice).toBe('0.10');
    const row = await prisma.order.findFirstOrThrow();
    expect(row.agreedPrice.toFixed(2)).toBe('0.10');
    const read = await getOrder(row.id, ASHA);
    expect(read.body.data.order).toMatchObject({ agreedPrice: '0.10', quote: { totalPrice: '0.10' } });
    expect((await myOrders(ASHA)).body.data.orders[0].agreedPrice).toBe('0.10');
  });

  it('a large exact amount is copied without rounding', async () => {
    const quote = await submittedQuote(PRECISION, BRACKETS, { totalPrice: '9999999999.99', estimatedDays: 2 });
    expect((await award(quote.id)).body.data.order.agreedPrice).toBe('9999999999.99');
  });
});

// ---------------------------------------------------------------------------

describe('award eligibility (409, nothing written)', () => {
  it('job deadline passed', async () => {
    const quote = await submittedQuote(PRECISION);
    await prisma.job.update({ where: { id: BRACKETS }, data: { deadline: new Date(Date.now() - 1000) } });
    const res = await award(quote.id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'The job deadline has passed; it can no longer be awarded' });
    expect(await prisma.order.count()).toBe(0);
  });

  it('quote validUntil passed', async () => {
    const quote = await submittedQuote(PRECISION, BRACKETS, { ...VALID, validUntil: new Date(Date.now() + DAY).toISOString() });
    await prisma.quote.update({ where: { id: quote.id }, data: { validUntil: new Date(Date.now() - 1000) } });
    const res = await award(quote.id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This quote is no longer valid (validUntil has passed)');
    await expectNotAwarded(quote.id);
  });

  it.each([
    ['INVITED', "The workshop has not accepted this job's invitation"],
    ['DECLINED', "The workshop declined this job's invitation"],
    ['EXPIRED', "The workshop's invitation for this job has expired"],
  ] as const)('selected invitation %s', async (status, message) => {
    const quote = await submittedQuote(PRECISION);
    await prisma.jobInvitation.update({ where: { id: quote.invitationId }, data: { status } });
    const res = await award(quote.id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(message);
    await expectNotAwarded(quote.id);
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id: quote.invitationId } })).status).toBe(status);
  });

  it.each(['PENDING', 'REJECTED'] as const)('workshop no longer verified (%s)', async (verificationStatus) => {
    const quote = await submittedQuote(PRECISION);
    await prisma.workshop.update({ where: { id: PRECISION }, data: { verificationStatus } });
    const res = await award(quote.id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The workshop is no longer verified; this quote cannot be awarded');
    await expectNotAwarded(quote.id);
  });

  it.each(['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CANCELLED'] as const)('quote is %s', async (status) => {
    const quote = await submittedQuote(PRECISION);
    await prisma.quote.update({ where: { id: quote.id }, data: { status } });
    const res = await award(quote.id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Only SUBMITTED quotes can be awarded (this quote is ${status})`);
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } })).status).toBe('MATCHED');
  });

  it.each(['AWARDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DRAFT'] as const)('job is %s (no order)', async (status) => {
    const quote = await submittedQuote(PRECISION);
    await prisma.job.update({ where: { id: BRACKETS }, data: { status } });
    const res = await award(quote.id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`This job cannot be awarded (status ${status})`);
    expect(await prisma.order.count()).toBe(0);
  });

  it('job cancelled through the API (I3)', async () => {
    const quote = await submittedQuote(PRECISION);
    expect((await request(app).put(`/api/jobs/${BRACKETS}`).set(auth(await tokenFor(ASHA))).send({ status: 'CANCELLED' })).status).toBe(200);
    const res = await award(quote.id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This job cannot be awarded (status CANCELLED)');
  });

  it('a failure after the job update rolls the whole award back', async () => {
    const quote = await submittedQuote(PRECISION);
    const pending = await invitation(TALEGAON, BRACKETS, false);
    await prisma.workshop.update({ where: { id: PRECISION }, data: { verificationStatus: 'PENDING' } });
    expect((await award(quote.id)).status).toBe(409);
    // The job update and the invitation expiry ran before the verification check - both undone.
    await expectNotAwarded(quote.id);
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id: pending } })).status).toBe('INVITED');
  });
});

// ---------------------------------------------------------------------------

describe('repeated award requests', () => {
  it('the same buyer awarding the same quote again gets 200 and the same order', async () => {
    const quote = await submittedQuote(PRECISION);
    const first = await award(quote.id);
    const again = await award(quote.id);
    expect(again.status).toBe(200);
    expect(again.body.message).toBe('Quote already awarded; existing order returned');
    expect(again.body.data.created).toBe(false);
    expect(again.body.data.order.id).toBe(first.body.data.order.id);
    expect(again.body.data.order.agreedPrice).toBe('12500.50');
    expect(await prisma.order.count()).toBe(1);
  });

  it('a different quote for an already-awarded job is a 409', async () => {
    const winner = await submittedQuote(PRECISION);
    const other = await submittedQuote(MUMBAI);
    expect((await award(winner.id)).status).toBe(201);
    const res = await award(other.id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'This job has already been awarded to another quote' });
    expect(await prisma.order.count()).toBe(1);
  });

  it("another buyer retrying an awarded quote gets 404 and never sees the order", async () => {
    const quote = await submittedQuote(PRECISION);
    await award(quote.id);
    const res = await award(quote.id, VIKRAM);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Quote not found' });
  });
});

// ---------------------------------------------------------------------------

describe('award access and input', () => {
  it('401 without a token', async () => {
    const quote = await submittedQuote(PRECISION);
    expect((await request(app).post(`/api/orders/award/${quote.id}`)).status).toBe(401);
  });

  it('403 for workshop and inspector roles', async () => {
    const quote = await submittedQuote(PRECISION);
    expect((await award(quote.id, owner(PRECISION))).status).toBe(403);
    expect((await award(quote.id, INSPECTOR)).status).toBe(403);
    await expectNotAwarded(quote.id);
  });

  it("404 for another buyer's quote and for an unknown quote", async () => {
    const quote = await submittedQuote(PRECISION);
    expect((await award(quote.id, VIKRAM)).status).toBe(404);
    expect((await award('does-not-exist')).status).toBe(404);
    await expectNotAwarded(quote.id);
  });

  it('400 for any request body field', async () => {
    const quote = await submittedQuote(PRECISION);
    const res = await award(quote.id, ASHA, { agreedPrice: '1.00' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    await expectNotAwarded(quote.id);
  });

  it('an empty JSON body is accepted', async () => {
    const quote = await submittedQuote(PRECISION);
    expect((await award(quote.id, ASHA, {})).status).toBe(201);
  });
});

// ---------------------------------------------------------------------------

describe('GET /api/orders/:orderId', () => {
  async function awardedOrderId() {
    const quote = await submittedQuote(PRECISION);
    return (await award(quote.id)).body.data.order.id as string;
  }

  it('the buyer and the awarded workshop can read it', async () => {
    const id = await awardedOrderId();
    for (const as of [ASHA, owner(PRECISION)]) {
      const res = await getOrder(id, as);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Order fetched successfully');
      expect(res.body.data.order).toMatchObject({
        id,
        agreedPrice: '12500.50',
        quote: { totalPrice: '12500.50' },
        job: { id: BRACKETS },
        workshop: { id: PRECISION },
        milestones: [],
        inspections: [],
        payments: [],
      });
    }
  });

  it('other buyers and other workshops get 404', async () => {
    const id = await awardedOrderId();
    for (const as of [VIKRAM, owner(MUMBAI)]) {
      const res = await getOrder(id, as);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Order not found');
    }
  });

  it('inspector and admin roles get 403 (not part of I4); no token 401; unknown id 404', async () => {
    const id = await awardedOrderId();
    expect((await getOrder(id, INSPECTOR)).status).toBe(403);
    expect((await getOrder(id, 'seed-user-admin')).status).toBe(403);
    expect((await request(app).get(`/api/orders/${id}`)).status).toBe(401);
    expect((await getOrder('does-not-exist', ASHA)).status).toBe(404);
  });

  it('a workshop user without a profile gets 404', async () => {
    const id = await awardedOrderId();
    const noProfile = await createUserDirect('WORKSHOP');
    const res = await request(app).get(`/api/orders/${id}`).set(auth(noProfile.token));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('No workshop profile found for this user');
  });
});

// ---------------------------------------------------------------------------

describe('GET /api/orders/mine', () => {
  it('returns only the caller’s orders, newest first, for buyers and workshops', async () => {
    const first = await award((await submittedQuote(PRECISION, BRACKETS)).id);
    const second = await award((await submittedQuote(PRECISION, SHAFTS)).id);
    expect([first.status, second.status]).toEqual([201, 201]);
    const ids = [second.body.data.order.id, first.body.data.order.id];

    const buyer = await myOrders(ASHA);
    expect(buyer.status).toBe(200);
    expect(buyer.body.data.orders.map((o: { id: string }) => o.id)).toEqual(ids);
    expect(buyer.body.data.orders[0]).toMatchObject({
      agreedPrice: '12500.50',
      job: { id: SHAFTS, title: expect.any(String), status: 'AWARDED' },
      workshop: { id: PRECISION },
    });

    const workshop = await myOrders(owner(PRECISION));
    expect(workshop.body.data.orders.map((o: { id: string }) => o.id)).toEqual(ids);

    expect((await myOrders(VIKRAM)).body.data.orders).toEqual([]);
    expect((await myOrders(owner(MUMBAI))).body.data.orders).toEqual([]);
  });

  it('403 for inspector and admin, 401 without a token', async () => {
    expect((await myOrders(INSPECTOR)).status).toBe(403);
    expect((await myOrders('seed-user-admin')).status).toBe(403);
    expect((await request(app).get('/api/orders/mine')).status).toBe(401);
  });
});
