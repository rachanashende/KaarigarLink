import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { createUserDirect } from '../helpers/auth';
import { seededSession } from '../helpers/seedSession';

/** I2: quotation submission, editing and listing rules. */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86_400_000;

const ASHA = 'seed-user-buyer-asha'; // owns BRACKETS
const VIKRAM = 'seed-user-buyer-vikram';
const BRACKETS = 'seed-job-alu-brackets'; // eligible: precision, mumbai, talegaon
const PRECISION = 'seed-ws-precision-works';
const TALEGAON = 'seed-ws-talegaon-tooling';
const MUMBAI = 'seed-ws-mumbai-metalcraft';
const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;

const VALID = { totalPrice: '12500.50', estimatedDays: 14, notes: 'Includes anodising' };

let tokenFor: (userId: string) => Promise<string>;

const invite = async (workshopId: string) =>
  request(app).post(`/api/jobs/${BRACKETS}/invitations`).set(auth(await tokenFor(ASHA))).send({ workshopId });
const respond = async (id: string, workshopId: string, response: 'ACCEPTED' | 'DECLINED') =>
  request(app).post(`/api/invitations/${id}/respond`).set(auth(await tokenFor(owner(workshopId)))).send({ response });
const submit = async (invitationId: string, body: Record<string, unknown> = VALID, as = owner(PRECISION)) =>
  request(app).post(`/api/quotes/invitations/${invitationId}`).set(auth(await tokenFor(as))).send(body);
const edit = async (quoteId: string, body: Record<string, unknown>, as = owner(PRECISION)) =>
  request(app).patch(`/api/quotes/${quoteId}`).set(auth(await tokenFor(as))).send(body);
const cancelJob = async () =>
  request(app).put(`/api/jobs/${BRACKETS}`).set(auth(await tokenFor(ASHA))).send({ status: 'CANCELLED' });

/** Invites a workshop to BRACKETS; with accept=true it also accepts. Returns the invitation id. */
async function invitation(workshopId = PRECISION, accept = true) {
  const res = await invite(workshopId);
  expect(res.status).toBe(201);
  const id: string = res.body.data.invitation.id;
  if (accept) expect((await respond(id, workshopId, 'ACCEPTED')).status).toBe(200);
  return id;
}

async function submittedQuote(workshopId = PRECISION) {
  const res = await submit(await invitation(workshopId), VALID, owner(workshopId));
  expect(res.status).toBe(201);
  return res.body.data.quote as { id: string; updatedAt: string };
}

const quoteCount = () => prisma.quote.count({ where: { jobId: BRACKETS } });

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('POST /api/quotes/invitations/:invitationId - submission', () => {
  it('an ACCEPTED invitation can submit: 201 with exact money', async () => {
    const invitationId = await invitation();
    const res = await submit(invitationId);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, message: 'Quote submitted successfully' });
    expect(res.body.data.quote).toMatchObject({
      invitationId,
      jobId: BRACKETS,
      workshopId: PRECISION,
      totalPrice: '12500.50',
      currency: 'INR',
      estimatedDays: 14,
      notes: 'Includes anodising',
      validUntil: null,
      status: 'SUBMITTED',
    });
    const row = await prisma.quote.findUniqueOrThrow({ where: { invitationId } });
    expect(row.totalPrice.toFixed(2)).toBe('12500.50');
  });

  it('keeps decimals exact for numbers and strings', async () => {
    const a = await submit(await invitation(PRECISION), { totalPrice: 0.1, estimatedDays: 1 });
    expect(a.status).toBe(201);
    expect(a.body.data.quote.totalPrice).toBe('0.10');
    const b = await submit(await invitation(TALEGAON), { totalPrice: '9999999999.99', estimatedDays: 1 }, owner(TALEGAON));
    expect(b.status).toBe(201);
    expect(b.body.data.quote.totalPrice).toBe('9999999999.99');
  });

  it('accepts a future validUntil', async () => {
    const until = new Date(Date.now() + 10 * DAY).toISOString();
    const res = await submit(await invitation(), { ...VALID, validUntil: until });
    expect(res.status).toBe(201);
    expect(res.body.data.quote.validUntil).toBe(until);
  });

  it('rejects an INVITED (not yet accepted) invitation with 409', async () => {
    const res = await submit(await invitation(PRECISION, false));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'Accept the invitation before submitting a quote' });
    expect(await quoteCount()).toBe(0);
  });

  it('rejects a DECLINED invitation with 409', async () => {
    const id = await invitation(PRECISION, false);
    expect((await respond(id, PRECISION, 'DECLINED')).status).toBe(200);
    const res = await submit(id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The invitation was declined; quotes are not allowed');
  });

  it('rejects an invitation that expired by time and persists the EXPIRED status', async () => {
    const id = await invitation(PRECISION, false);
    await prisma.jobInvitation.update({ where: { id }, data: { createdAt: new Date(Date.now() - 8 * DAY) } });
    const res = await submit(id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The invitation has expired; quotes are not allowed');
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
  });

  it('rejects an invitation that is stored as EXPIRED', async () => {
    const id = await invitation();
    await prisma.jobInvitation.update({ where: { id }, data: { status: 'EXPIRED' } });
    expect((await submit(id)).status).toBe(409);
  });

  it('rejects when the job deadline has passed, even with an ACCEPTED invitation', async () => {
    const id = await invitation();
    await prisma.job.update({ where: { id: BRACKETS }, data: { deadline: new Date(Date.now() - 1000) } });
    const res = await submit(id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The job deadline has passed; quotes are no longer accepted');
    expect(await quoteCount()).toBe(0);
  });

  it('rejects an AWARDED job', async () => {
    const id = await invitation();
    await prisma.job.update({ where: { id: BRACKETS }, data: { status: 'AWARDED' } });
    const res = await submit(id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This job is no longer accepting quotes (status AWARDED)');
  });

  it('rejects a CANCELLED job (cancellation also expired the invitation)', async () => {
    const id = await invitation();
    expect((await cancelJob()).status).toBe(200);
    const res = await submit(id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This job is no longer accepting quotes (status CANCELLED)');
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
  });

  it("another workshop's invitation looks non-existent (404)", async () => {
    const id = await invitation(PRECISION);
    const res = await submit(id, VALID, owner(TALEGAON));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Invitation not found');
    expect(await quoteCount()).toBe(0);
  });

  it('unknown invitation -> 404; workshop user without a profile -> 404', async () => {
    expect((await submit('does-not-exist')).status).toBe(404);
    const noProfile = await createUserDirect('WORKSHOP');
    const id = await invitation();
    const res = await request(app).post(`/api/quotes/invitations/${id}`).set(auth(noProfile.token)).send(VALID);
    expect(res.status).toBe(404);
  });

  it('401 without a token; 403 for a buyer', async () => {
    const id = await invitation();
    expect((await request(app).post(`/api/quotes/invitations/${id}`).send(VALID)).status).toBe(401);
    const res = await request(app).post(`/api/quotes/invitations/${id}`).set(auth(await tokenFor(ASHA))).send(VALID);
    expect(res.status).toBe(403);
  });

  it('a second submission for the same invitation is a 409 and keeps one quote', async () => {
    const id = await invitation();
    expect((await submit(id)).status).toBe(201);
    const res = await submit(id, { ...VALID, totalPrice: '1.00' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('A quote already exists for this invitation; update it instead');
    expect(await quoteCount()).toBe(1);
    expect((await prisma.quote.findUniqueOrThrow({ where: { invitationId: id } })).totalPrice.toFixed(2)).toBe('12500.50');
  });

  it('rejects a validUntil in the past with 400', async () => {
    const res = await submit(await invitation(), { ...VALID, validUntil: new Date(Date.now() - DAY).toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'validUntil', message: 'validUntil must be in the future' }]);
    expect(await quoteCount()).toBe(0);
  });

  it.each([
    ['three decimals', { ...VALID, totalPrice: '10.123' }, 'totalPrice'],
    ['zero price', { ...VALID, totalPrice: 0 }, 'totalPrice'],
    ['negative price', { ...VALID, totalPrice: -5 }, 'totalPrice'],
    ['exponent notation', { ...VALID, totalPrice: '1e5' }, 'totalPrice'],
    ['too many digits', { ...VALID, totalPrice: '12345678901.00' }, 'totalPrice'],
    ['missing estimatedDays', { totalPrice: '10.00' }, 'estimatedDays'],
    ['fractional estimatedDays', { ...VALID, estimatedDays: 1.5 }, 'estimatedDays'],
    ['invalid validUntil', { ...VALID, validUntil: 'next week' }, 'validUntil'],
    ['unknown field', { ...VALID, status: 'ACCEPTED' }, ''],
  ])('400 for invalid input: %s', async (_name, body, field) => {
    const res = await submit(await invitation(), body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });
});

// ---------------------------------------------------------------------------

describe('PATCH /api/quotes/:quoteId - editing', () => {
  it('the owning workshop edits a SUBMITTED quote; updatedAt advances', async () => {
    const quote = await submittedQuote();
    const res = await edit(quote.id, { totalPrice: 11999, notes: null, estimatedDays: 10 });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Quote updated successfully');
    expect(res.body.data.quote).toMatchObject({ totalPrice: '11999.00', notes: null, estimatedDays: 10, status: 'SUBMITTED' });
    expect(new Date(res.body.data.quote.updatedAt).getTime()).toBeGreaterThan(new Date(quote.updatedAt).getTime());
  });

  it('can set and clear validUntil', async () => {
    const quote = await submittedQuote();
    const until = new Date(Date.now() + 5 * DAY).toISOString();
    expect((await edit(quote.id, { validUntil: until })).body.data.quote.validUntil).toBe(until);
    expect((await edit(quote.id, { validUntil: null })).body.data.quote.validUntil).toBeNull();
  });

  it("another workshop's quote looks non-existent (404); unknown quote 404", async () => {
    const quote = await submittedQuote();
    const res = await edit(quote.id, { totalPrice: 1 }, owner(TALEGAON));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Quote not found');
    expect((await edit('does-not-exist', { totalPrice: 1 })).status).toBe(404);
  });

  it('403 for a buyer, 401 without a token', async () => {
    const quote = await submittedQuote();
    expect((await edit(quote.id, { totalPrice: 1 }, ASHA)).status).toBe(403);
    expect((await request(app).patch(`/api/quotes/${quote.id}`).send({ totalPrice: 1 })).status).toBe(401);
  });

  it.each(['ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const)('a %s quote cannot be edited (409)', async (status) => {
    const quote = await submittedQuote();
    await prisma.quote.update({ where: { id: quote.id }, data: { status } });
    const res = await edit(quote.id, { totalPrice: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Only SUBMITTED quotes can be edited (this quote is ${status})`);
  });

  it('rejects edits after the job is cancelled', async () => {
    const quote = await submittedQuote();
    expect((await cancelJob()).status).toBe(200);
    const res = await edit(quote.id, { totalPrice: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This job is no longer accepting quotes (status CANCELLED)');
  });

  it('rejects edits after the job is awarded', async () => {
    const quote = await submittedQuote();
    await prisma.job.update({ where: { id: BRACKETS }, data: { status: 'AWARDED' } });
    expect((await edit(quote.id, { totalPrice: 1 })).status).toBe(409);
  });

  it('rejects edits after the job deadline has passed', async () => {
    const quote = await submittedQuote();
    await prisma.job.update({ where: { id: BRACKETS }, data: { deadline: new Date(Date.now() - 1000) } });
    const res = await edit(quote.id, { totalPrice: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The job deadline has passed; quotes are no longer accepted');
  });

  it.each(['EXPIRED', 'DECLINED'] as const)('rejects edits after the invitation is %s', async (status) => {
    const quote = await submittedQuote();
    await prisma.jobInvitation.updateMany({ where: { jobId: BRACKETS, workshopId: PRECISION }, data: { status } });
    expect((await edit(quote.id, { totalPrice: 1 })).status).toBe(409);
  });

  it('rejected edits change nothing', async () => {
    const quote = await submittedQuote();
    await prisma.job.update({ where: { id: BRACKETS }, data: { status: 'AWARDED' } });
    await edit(quote.id, { totalPrice: 1, notes: 'changed' });
    const row = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(row.totalPrice.toFixed(2)).toBe('12500.50');
    expect(row.notes).toBe('Includes anodising');
  });

  it.each([
    ['empty body', {}],
    ['past validUntil', { validUntil: new Date(Date.now() - DAY).toISOString() }],
    ['bad price', { totalPrice: '1.999' }],
    ['unknown field', { status: 'ACCEPTED' }],
  ])('400 for invalid input: %s', async (_name, body) => {
    const quote = await submittedQuote();
    expect((await edit(quote.id, body)).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------

describe('listing quotes', () => {
  it('the buyer lists quotes for their job with a workshop summary', async () => {
    await submittedQuote(PRECISION);
    await submittedQuote(MUMBAI);
    const res = await request(app).get(`/api/quotes/jobs/${BRACKETS}`).set(auth(await tokenFor(ASHA)));
    expect(res.status).toBe(200);
    expect(res.body.data.quotes).toHaveLength(2);
    for (const q of res.body.data.quotes) {
      expect(q.totalPrice).toBe('12500.50');
      expect(Object.keys(q.workshop).sort()).toEqual(['businessName', 'city', 'id', 'rating']);
    }
  });

  it("another buyer's job looks non-existent (404); workshops get 403", async () => {
    await submittedQuote();
    expect((await request(app).get(`/api/quotes/jobs/${BRACKETS}`).set(auth(await tokenFor(VIKRAM)))).status).toBe(404);
    expect(
      (await request(app).get(`/api/quotes/jobs/${BRACKETS}`).set(auth(await tokenFor(owner(PRECISION))))).status,
    ).toBe(403);
  });

  it('a workshop lists only its own quotes', async () => {
    await submittedQuote(PRECISION);
    await submittedQuote(MUMBAI);
    const res = await request(app).get('/api/quotes/mine').set(auth(await tokenFor(owner(PRECISION))));
    expect(res.status).toBe(200);
    expect(res.body.data.quotes).toHaveLength(1);
    expect(res.body.data.quotes[0]).toMatchObject({ workshopId: PRECISION, job: { id: BRACKETS } });
    const other = await request(app).get('/api/quotes/mine').set(auth(await tokenFor(owner(TALEGAON))));
    expect(other.body.data.quotes).toEqual([]);
  });
});
