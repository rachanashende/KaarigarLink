import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { createUserDirect } from '../helpers/auth';
import { seededSession } from '../helpers/seedSession';

/** I4b: order start, completion and cancellation. */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const ASHA = 'seed-user-buyer-asha'; // owns BRACKETS and SHAFTS
const VIKRAM = 'seed-user-buyer-vikram';
const INSPECTOR = 'seed-user-inspector';
const ADMIN = 'seed-user-admin';
const BRACKETS = 'seed-job-alu-brackets'; // eligible: precision, mumbai, talegaon
const SHAFTS = 'seed-job-stainless-shafts'; // eligible: precision only
const PRECISION = 'seed-ws-precision-works';
const MUMBAI = 'seed-ws-mumbai-metalcraft';
const TALEGAON = 'seed-ws-talegaon-tooling';
const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;
const VALID = { totalPrice: '12500.50', estimatedDays: 14 };

let tokenFor: (userId: string) => Promise<string>;

async function invite(workshopId: string, response?: 'ACCEPTED' | 'DECLINED', jobId = BRACKETS) {
  const inv = await request(app).post(`/api/jobs/${jobId}/invitations`).set(auth(await tokenFor(ASHA))).send({ workshopId });
  expect(inv.status).toBe(201);
  const id: string = inv.body.data.invitation.id;
  if (response) {
    const res = await request(app)
      .post(`/api/invitations/${id}/respond`)
      .set(auth(await tokenFor(owner(workshopId))))
      .send({ response });
    expect(res.status).toBe(200);
  }
  return id;
}

async function quote(workshopId: string, jobId = BRACKETS) {
  const invitationId = await invite(workshopId, 'ACCEPTED', jobId);
  const res = await request(app)
    .post(`/api/quotes/invitations/${invitationId}`)
    .set(auth(await tokenFor(owner(workshopId))))
    .send(VALID);
  expect(res.status).toBe(201);
  return res.body.data.quote as { id: string; invitationId: string };
}

/**
 * BRACKETS awarded to PRECISION. MUMBAI also quoted (its quote becomes REJECTED,
 * its invitation stays ACCEPTED) and TALEGAON declined.
 */
async function awardedOrder() {
  const winner = await quote(PRECISION);
  const loser = await quote(MUMBAI);
  const declined = await invite(TALEGAON, 'DECLINED');
  const res = await request(app).post(`/api/orders/award/${winner.id}`).set(auth(await tokenFor(ASHA)));
  expect(res.status).toBe(201);
  return { orderId: res.body.data.order.id as string, winner, loser, declined };
}

const act = async (orderId: string, action: 'start' | 'complete' | 'cancel', as: string, body?: Record<string, unknown>) => {
  const req = request(app).post(`/api/orders/${orderId}/${action}`).set(auth(await tokenFor(as)));
  return body === undefined ? req : req.send(body);
};
const start = (orderId: string, as = owner(PRECISION), body?: Record<string, unknown>) => act(orderId, 'start', as, body);
const complete = (orderId: string, as = ASHA, body?: Record<string, unknown>) => act(orderId, 'complete', as, body);
const cancel = (orderId: string, reason: unknown = 'Buyer changed plans', as = ASHA) =>
  act(orderId, 'cancel', as, { reason });

const orderRow = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
const jobRow = () => prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
const workshopRow = () => prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } });
const invitationStatus = async (id: string) => (await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status;

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------

describe('start: CONFIRMED -> IN_PROGRESS', () => {
  it('the awarded workshop starts the order; the job follows', async () => {
    const { orderId } = await awardedOrder();
    const jobBefore = await jobRow();
    const res = await start(orderId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: 'Order started', data: { changed: true } });
    expect(res.body.data.order).toMatchObject({
      id: orderId,
      status: 'IN_PROGRESS',
      agreedPrice: '12500.50',
      job: { id: BRACKETS, status: 'IN_PROGRESS' },
      quote: { status: 'ACCEPTED', totalPrice: '12500.50' },
      workshop: { id: PRECISION },
    });
    const job = await jobRow();
    expect(job.status).toBe('IN_PROGRESS');
    expect(job.updatedAt.getTime()).toBeGreaterThan(jobBefore.updatedAt.getTime());
    expect((await orderRow(orderId)).status).toBe('IN_PROGRESS');
  });

  it('a repeated start returns 200 changed:false and writes nothing', async () => {
    const { orderId } = await awardedOrder();
    await start(orderId);
    const [orderBefore, jobBefore] = [await orderRow(orderId), await jobRow()];
    const res = await start(orderId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Order already started', data: { changed: false, order: { status: 'IN_PROGRESS' } } });
    expect((await orderRow(orderId)).updatedAt).toEqual(orderBefore.updatedAt);
    expect((await jobRow()).updatedAt).toEqual(jobBefore.updatedAt);
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)('cannot start a %s order (409)', async (status) => {
    const { orderId } = await awardedOrder();
    await start(orderId);
    if (status === 'COMPLETED') await complete(orderId);
    else await cancel(orderId);
    const res = await start(orderId);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: `Cannot start an order that is ${status}` });
  });
});

// ---------------------------------------------------------------------------

describe('complete: IN_PROGRESS -> COMPLETED', () => {
  it('the buyer completes; job COMPLETED, completion date set, count +1, workshop version unchanged', async () => {
    const { orderId } = await awardedOrder();
    await start(orderId);
    const wsBefore = await workshopRow();
    const t0 = Date.now();
    const res = await complete(orderId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Order completed', data: { changed: true } });
    expect(res.body.data.order).toMatchObject({ status: 'COMPLETED', job: { status: 'COMPLETED' }, agreedPrice: '12500.50' });
    const done = new Date(res.body.data.order.actualCompletionDate).getTime();
    expect(done).toBeGreaterThanOrEqual(t0 - 1000);
    expect(done).toBeLessThanOrEqual(Date.now() + 1000);
    expect((await jobRow()).status).toBe('COMPLETED');
    const ws = await workshopRow();
    expect(ws.totalCompletedJobs).toBe(wsBefore.totalCompletedJobs + 1);
    expect(ws.updatedAt).toEqual(wsBefore.updatedAt); // profile version untouched
  });

  it('a repeated completion returns changed:false and never counts twice', async () => {
    const { orderId } = await awardedOrder();
    await start(orderId);
    const before = (await workshopRow()).totalCompletedJobs;
    const first = await complete(orderId);
    const again = await complete(orderId);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ message: 'Order already completed', data: { changed: false } });
    expect(again.body.data.order.actualCompletionDate).toBe(first.body.data.order.actualCompletionDate);
    expect((await workshopRow()).totalCompletedJobs).toBe(before + 1);
  });

  it('completing a CONFIRMED (not started) order is a 409', async () => {
    const { orderId } = await awardedOrder();
    const before = (await workshopRow()).totalCompletedJobs;
    const res = await complete(orderId);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The order has not been started yet; it must be IN_PROGRESS to be completed');
    expect((await orderRow(orderId)).status).toBe('CONFIRMED');
    expect((await jobRow()).status).toBe('AWARDED');
    expect((await workshopRow()).totalCompletedJobs).toBe(before);
  });

  it('completing a CANCELLED order is a 409', async () => {
    const { orderId } = await awardedOrder();
    await cancel(orderId);
    const res = await complete(orderId);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Cannot complete an order that is CANCELLED');
  });

  it('completion after the original job deadline is allowed', async () => {
    const { orderId } = await awardedOrder();
    await start(orderId);
    await prisma.job.update({ where: { id: BRACKETS }, data: { deadline: new Date(Date.now() - 86_400_000) } });
    expect((await complete(orderId)).status).toBe(200);
  });

  it('matching reflects the new completed-job count', async () => {
    const { orderId } = await awardedOrder();
    await start(orderId);
    const before = (await workshopRow()).totalCompletedJobs;
    await complete(orderId);
    const matches = await request(app).get(`/api/jobs/${SHAFTS}/matches`).set(auth(await tokenFor(ASHA)));
    const row = matches.body.data.results.find((r: { workshopId: string }) => r.workshopId === PRECISION);
    expect(row.totalCompletedJobs).toBe(before + 1);
  });

  it('is atomic: if the count increment fails, order, job and count are unchanged', async () => {
    const { orderId } = await awardedOrder();
    await start(orderId);
    const before = await workshopRow();
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION i4b_fail_increment() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected failure'; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER i4b_fail_increment BEFORE UPDATE ON "Workshop"
      FOR EACH ROW WHEN (NEW."totalCompletedJobs" IS DISTINCT FROM OLD."totalCompletedJobs")
      EXECUTE FUNCTION i4b_fail_increment()`);
    try {
      expect((await complete(orderId)).status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS i4b_fail_increment ON "Workshop"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS i4b_fail_increment()');
    }
    const order = await orderRow(orderId);
    expect(order.status).toBe('IN_PROGRESS');
    expect(order.actualCompletionDate).toBeNull();
    expect((await jobRow()).status).toBe('IN_PROGRESS');
    expect((await workshopRow()).totalCompletedJobs).toBe(before.totalCompletedJobs);
    // Without the injected failure the same completion succeeds.
    expect((await complete(orderId)).status).toBe(200);
    expect((await workshopRow()).totalCompletedJobs).toBe(before.totalCompletedJobs + 1);
  });
});

// ---------------------------------------------------------------------------

describe('cancel: CONFIRMED / IN_PROGRESS -> CANCELLED', () => {
  it.each(['CONFIRMED', 'IN_PROGRESS'] as const)('cancels a %s order; job CANCELLED, quote history kept, invitations expired', async (from) => {
    const { orderId, winner, loser, declined } = await awardedOrder();
    if (from === 'IN_PROGRESS') await start(orderId);
    // An outstanding invitation on ANOTHER job must not change.
    const otherJobInvitation = await invite(PRECISION, undefined, SHAFTS);
    const extra = await prisma.jobInvitation.findFirstOrThrow({ where: { jobId: BRACKETS, status: 'ACCEPTED', workshopId: MUMBAI } });
    const countBefore = (await workshopRow()).totalCompletedJobs;

    const res = await cancel(orderId, '  Supplier site flooded  ');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Order cancelled', data: { changed: true } });
    expect(res.body.data.order).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Supplier site flooded',
      job: { status: 'CANCELLED' },
      quote: { id: winner.id, status: 'ACCEPTED' },
    });
    expect((await jobRow()).status).toBe('CANCELLED');
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: winner.id } })).status).toBe('ACCEPTED');
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: loser.id } })).status).toBe('REJECTED');
    expect(await invitationStatus(winner.invitationId)).toBe('EXPIRED');
    expect(await invitationStatus(extra.id)).toBe('EXPIRED');
    expect(await invitationStatus(declined)).toBe('DECLINED');
    expect(await invitationStatus(otherJobInvitation)).toBe('INVITED');
    expect((await workshopRow()).totalCompletedJobs).toBe(countBefore);
  });

  it('expires INVITED invitations and leaves EXPIRED and DECLINED ones as they are', async () => {
    const { orderId, loser, declined } = await awardedOrder();
    await prisma.jobInvitation.update({ where: { id: loser.invitationId }, data: { status: 'INVITED' } });
    const stale = await prisma.jobInvitation.findFirstOrThrow({ where: { id: declined } });
    expect((await cancel(orderId)).status).toBe(200);
    expect(await invitationStatus(loser.invitationId)).toBe('EXPIRED');
    expect(await invitationStatus(declined)).toBe('DECLINED');
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id: declined } })).updatedAt).toEqual(stale.updatedAt);
    expect(await prisma.jobInvitation.count({ where: { jobId: BRACKETS, status: { in: ['INVITED', 'ACCEPTED'] } } })).toBe(0);
  });

  it('a repeated cancellation returns changed:false and keeps the original reason', async () => {
    const { orderId } = await awardedOrder();
    await cancel(orderId, 'First reason');
    const res = await cancel(orderId, 'A different reason');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Order already cancelled', data: { changed: false } });
    expect(res.body.data.order.cancellationReason).toBe('First reason');
    expect((await orderRow(orderId)).cancellationReason).toBe('First reason');
  });

  it('a COMPLETED order cannot be cancelled (409)', async () => {
    const { orderId } = await awardedOrder();
    await start(orderId);
    await complete(orderId);
    const res = await cancel(orderId);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Cannot cancel an order that is COMPLETED');
    expect((await orderRow(orderId)).cancellationReason).toBeNull();
  });

  it.each([
    ['missing reason', {}],
    ['non-string reason', { reason: 42 }],
    ['whitespace only', { reason: '     ' }],
    ['too short after trimming', { reason: '  ab  ' }],
    ['1001 characters', { reason: 'x'.repeat(1001) }],
    ['unknown field', { reason: 'Valid reason', refund: true }],
  ])('400 for an invalid body: %s', async (_name, body) => {
    const { orderId } = await awardedOrder();
    const res = await act(orderId, 'cancel', ASHA, body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect((await orderRow(orderId)).status).toBe('CONFIRMED');
  });

  it.each([['3 characters', 'abc'], ['1000 characters', 'y'.repeat(1000)]])('accepts the boundary: %s', async (_name, reason) => {
    const { orderId } = await awardedOrder();
    const res = await cancel(orderId, reason);
    expect(res.status).toBe(200);
    expect((await orderRow(orderId)).cancellationReason).toBe(reason);
  });
});

// ---------------------------------------------------------------------------

describe('permissions and input', () => {
  it('start: buyer/inspector/admin 403, other workshop 404, no token 401, unknown 404, no profile 404', async () => {
    const { orderId } = await awardedOrder();
    for (const as of [ASHA, INSPECTOR, ADMIN]) expect((await start(orderId, as)).status).toBe(403);
    const other = await start(orderId, owner(MUMBAI));
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Order not found');
    expect((await request(app).post(`/api/orders/${orderId}/start`)).status).toBe(401);
    expect((await start('does-not-exist')).status).toBe(404);
    const noProfile = await createUserDirect('WORKSHOP');
    expect((await request(app).post(`/api/orders/${orderId}/start`).set(auth(noProfile.token))).status).toBe(404);
    expect((await orderRow(orderId)).status).toBe('CONFIRMED');
  });

  it.each(['complete', 'cancel'] as const)('%s: workshop/inspector/admin 403, other buyer 404, no token 401, unknown 404', async (action) => {
    const { orderId } = await awardedOrder();
    await start(orderId);
    const body = action === 'cancel' ? { reason: 'Valid reason' } : undefined;
    for (const as of [owner(PRECISION), INSPECTOR, ADMIN]) expect((await act(orderId, action, as, body)).status).toBe(403);
    const other = await act(orderId, action, VIKRAM, body);
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Order not found');
    expect((await request(app).post(`/api/orders/${orderId}/${action}`).send(body)).status).toBe(401);
    expect((await act('does-not-exist', action, ASHA, body)).status).toBe(404);
    expect((await orderRow(orderId)).status).toBe('IN_PROGRESS');
  });

  it('start and complete accept only an empty body', async () => {
    const { orderId } = await awardedOrder();
    expect((await start(orderId, owner(PRECISION), { note: 'x' })).status).toBe(400);
    expect((await start(orderId, owner(PRECISION), {})).status).toBe(200);
    expect((await complete(orderId, ASHA, { rating: 5 })).status).toBe(400);
    expect((await orderRow(orderId)).status).toBe('IN_PROGRESS');
  });

  it('an order whose job was changed outside the order flow is refused (409), not forced', async () => {
    const { orderId } = await awardedOrder();
    await prisma.job.update({ where: { id: BRACKETS }, data: { status: 'MATCHED' } });
    const res = await start(orderId);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Cannot start this order: its job is MATCHED');
    expect((await orderRow(orderId)).status).toBe('CONFIRMED');
  });

  it.each([
    { action: 'start', jobStatus: 'AWARDED' },
    { action: 'complete', jobStatus: 'IN_PROGRESS' },
    { action: 'cancel', jobStatus: 'IN_PROGRESS' },
  ] as const)('a repeated $action whose job is out of sync ($jobStatus) is refused (409) and writes nothing', async ({ action, jobStatus }) => {
    const { orderId } = await awardedOrder();
    expect((await start(orderId)).status).toBe(200);
    if (action === 'complete') expect((await complete(orderId)).status).toBe(200);
    if (action === 'cancel') expect((await cancel(orderId, 'Original reason')).status).toBe(200);

    await prisma.job.update({ where: { id: BRACKETS }, data: { status: jobStatus } });
    const orderBefore = await orderRow(orderId);
    const jobBefore = await jobRow();
    const workshopBefore = await workshopRow();

    const res =
      action === 'start' ? await start(orderId) : action === 'complete' ? await complete(orderId) : await cancel(orderId, 'A different reason');
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe(`Cannot ${action} this order: its job is ${jobStatus}`);

    expect(await orderRow(orderId)).toEqual(orderBefore); // status, updatedAt, actualCompletionDate, cancellationReason
    expect(await jobRow()).toEqual(jobBefore);
    expect(await workshopRow()).toEqual(workshopBefore); // totalCompletedJobs and updatedAt
    if (action === 'cancel') expect(orderBefore.cancellationReason).toBe('Original reason');
    if (action === 'complete') expect(orderBefore.actualCompletionDate).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('I4 award replay after lifecycle transitions', () => {
  it.each(['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const)('awarding the same quote again after %s returns the existing order (200)', async (state) => {
    const { orderId, winner, loser } = await awardedOrder();
    if (state !== 'CANCELLED') await start(orderId);
    if (state === 'COMPLETED') await complete(orderId);
    if (state === 'CANCELLED') await cancel(orderId);
    const count = (await workshopRow()).totalCompletedJobs;

    const replay = await request(app).post(`/api/orders/award/${winner.id}`).set(auth(await tokenFor(ASHA)));
    expect(replay.status).toBe(200);
    expect(replay.body.data).toMatchObject({ created: false, order: { id: orderId, status: state } });
    const other = await request(app).post(`/api/orders/award/${loser.id}`).set(auth(await tokenFor(ASHA)));
    expect(other.status).toBe(409);
    expect(await prisma.order.count()).toBe(1);
    expect((await workshopRow()).totalCompletedJobs).toBe(count);
  });

  it('the lifecycle is visible in order lookup and /orders/mine', async () => {
    const { orderId } = await awardedOrder();
    await start(orderId);
    await complete(orderId);
    const read = await request(app).get(`/api/orders/${orderId}`).set(auth(await tokenFor(owner(PRECISION))));
    expect(read.body.data.order).toMatchObject({ status: 'COMPLETED', job: { status: 'COMPLETED' } });
    const mine = await request(app).get('/api/orders/mine').set(auth(await tokenFor(ASHA)));
    expect(mine.body.data.orders[0]).toMatchObject({ id: orderId, status: 'COMPLETED' });
  });
});
