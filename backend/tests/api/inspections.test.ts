import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import { createUserDirect } from '../helpers/auth';
import {
  ADMIN,
  ASHA,
  INSPECTOR,
  MUMBAI,
  PRECISION,
  VIKRAM,
  api,
  auth,
  awardedOrder,
  inspect,
  owner,
  startedOrder,
  type TokenFor,
} from '../helpers/orderFlow';

let tokenFor: TokenFor;
const WS = owner(PRECISION);

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const history = (orderId: string, as: string) => api(tokenFor, as, 'get', `/orders/${orderId}/inspections`);
const complete = (orderId: string) => api(tokenFor, ASHA, 'post', `/orders/${orderId}/complete`);
const milestone = async (orderId: string, sequence = 1) =>
  (await api(tokenFor, WS, 'post', `/orders/${orderId}/milestones`, { title: `M${sequence}`, sequence })).body.data.milestone.id as string;
const move = (id: string, action: 'start' | 'complete' | 'approve') =>
  api(tokenFor, action === 'approve' ? ASHA : WS, 'post', `/milestones/${id}/${action}`);

describe('create', () => {
  it('an inspector records an inspection on an IN_PROGRESS order', async () => {
    const orderId = await startedOrder(tokenFor);
    const res = await inspect(tokenFor, orderId, 'FAILED', '  Out of tolerance  ');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Inspection recorded',
      data: {
        inspection: { orderId, inspectorId: INSPECTOR, status: 'FAILED', findings: 'Out of tolerance', inspector: { id: INSPECTOR } },
        reworkMilestoneId: null,
      },
    });
  });

  it.each(['CONFIRMED', 'COMPLETED', 'CANCELLED'] as const)('a %s order cannot be inspected (409)', async (status) => {
    const orderId = status === 'CONFIRMED' ? await awardedOrder(tokenFor) : await startedOrder(tokenFor);
    if (status === 'COMPLETED') {
      await inspect(tokenFor, orderId, 'PASSED');
      expect((await complete(orderId)).status).toBe(200);
    }
    if (status === 'CANCELLED') await api(tokenFor, ASHA, 'post', `/orders/${orderId}/cancel`, { reason: 'Not needed' });
    const before = await prisma.inspection.count({ where: { orderId } });
    const res = await inspect(tokenFor, orderId, 'PASSED');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Only IN_PROGRESS orders can be inspected (this order is ${status})`);
    expect(await prisma.inspection.count({ where: { orderId } })).toBe(before);
  });

  it('REWORK_REQUIRED without an active milestone is refused and writes nothing (rollback)', async () => {
    const orderId = await startedOrder(tokenFor);
    const pending = await milestone(orderId);
    const res = await inspect(tokenFor, orderId, 'REWORK_REQUIRED', 'Redo');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(
      'No IN_PROGRESS or COMPLETED milestone to send back; pass milestoneId to choose one (an APPROVED milestone can be reopened)',
    );
    expect(await prisma.inspection.count({ where: { orderId } })).toBe(0);
    expect((await prisma.milestone.findUniqueOrThrow({ where: { id: pending } })).status).toBe('PENDING');
  });

  it('REWORK_REQUIRED on an IN_PROGRESS milestone uses the default note when no findings are given', async () => {
    const orderId = await startedOrder(tokenFor);
    const id = await milestone(orderId);
    await move(id, 'start');
    expect((await inspect(tokenFor, orderId, 'REWORK_REQUIRED')).status).toBe(201);
    expect(await prisma.milestone.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: 'REWORK_REQUIRED',
      notes: 'Rework requested after inspection',
    });
  });

  it('a failing milestone update rolls the inspection back', async () => {
    const orderId = await startedOrder(tokenFor);
    const id = await milestone(orderId);
    await move(id, 'start');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION i5_fail_rework() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected failure'; END; $$ LANGUAGE plpgsql;
      `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER i5_fail_rework BEFORE UPDATE ON "Milestone"
      FOR EACH ROW WHEN (NEW."status" = 'REWORK_REQUIRED') EXECUTE FUNCTION i5_fail_rework()`);
    try {
      expect((await inspect(tokenFor, orderId, 'REWORK_REQUIRED', 'x')).status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS i5_fail_rework ON "Milestone"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS i5_fail_rework()');
    }
    expect(await prisma.inspection.count({ where: { orderId } })).toBe(0);
    expect((await prisma.milestone.findUniqueOrThrow({ where: { id } })).status).toBe('IN_PROGRESS');
  });

  it.each([
    ['missing status', {}],
    ['bad status', { status: 'OK' }],
    ['empty findings', { status: 'FAILED', findings: '   ' }],
    ['findings too long', { status: 'FAILED', findings: 'x'.repeat(2001) }],
    ['unknown field', { status: 'PASSED', inspectorId: ADMIN }],
  ])('validation: %s -> 400', async (_name, body) => {
    const orderId = await startedOrder(tokenFor);
    expect((await api(tokenFor, INSPECTOR, 'post', `/orders/${orderId}/inspections`, body)).status).toBe(400);
  });

  it('only INSPECTOR can create (buyer/workshop/admin 403, no token 401); unknown order 404', async () => {
    const orderId = await startedOrder(tokenFor);
    for (const as of [ASHA, WS, ADMIN]) {
      expect((await api(tokenFor, as, 'post', `/orders/${orderId}/inspections`, { status: 'PASSED' })).status).toBe(403);
    }
    expect((await request(app).post(`/api/orders/${orderId}/inspections`).send({ status: 'PASSED' })).status).toBe(401);
    expect((await inspect(tokenFor, 'no-such-order', 'PASSED')).status).toBe(404);
    expect(await prisma.inspection.count()).toBe(0);
  });
});

describe('history access', () => {
  it('buyer, awarded workshop, the inspector who inspected it, and admin can read; newest first', async () => {
    const orderId = await startedOrder(tokenFor);
    await inspect(tokenFor, orderId, 'FAILED', 'first');
    await inspect(tokenFor, orderId, 'PASSED', 'second');
    for (const as of [ASHA, WS, INSPECTOR, ADMIN]) {
      const res = await history(orderId, as);
      expect(res.status).toBe(200);
      expect(res.body.data.inspections.map((i: { findings: string }) => i.findings)).toEqual(['second', 'first']);
    }
  });

  it('another buyer, another workshop and an inspector who never inspected the order get 404', async () => {
    const orderId = await startedOrder(tokenFor);
    await inspect(tokenFor, orderId, 'PASSED');
    const otherInspector = await createUserDirect('INSPECTOR');
    for (const as of [VIKRAM, owner(MUMBAI)]) {
      const res = await history(orderId, as);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Order not found');
    }
    const res = await request(app).get(`/api/orders/${orderId}/inspections`).set(auth(otherInspector.token));
    expect(res.status).toBe(404);
    expect((await history('no-such-order', ADMIN)).status).toBe(404);
  });
});

describe('QC gate on order completion', () => {
  it('no inspection yet -> 409, order stays IN_PROGRESS', async () => {
    const orderId = await startedOrder(tokenFor);
    const count = async () => (await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } })).totalCompletedJobs;
    const before = await count();
    const res = await complete(orderId);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The order has not passed quality inspection yet; it cannot be completed');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('IN_PROGRESS');
    expect((await prisma.job.findUniqueOrThrow({ where: { id: 'seed-job-alu-brackets' } })).status).toBe('IN_PROGRESS');
    expect(await count()).toBe(before);
  });

  it.each(['FAILED', 'REWORK_REQUIRED'] as const)('latest inspection %s -> 409, even after an earlier PASSED', async (status) => {
    const orderId = await startedOrder(tokenFor);
    if (status === 'REWORK_REQUIRED') await move(await milestone(orderId), 'start');
    await inspect(tokenFor, orderId, 'PASSED');
    await inspect(tokenFor, orderId, status, 'Problem');
    const res = await complete(orderId);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`The latest quality inspection is ${status}; a PASSED inspection is required to complete the order`);
  });

  it('a PASSED inspection after a FAILED one unblocks completion', async () => {
    const orderId = await startedOrder(tokenFor);
    await inspect(tokenFor, orderId, 'FAILED', 'Problem');
    await inspect(tokenFor, orderId, 'PASSED');
    expect((await complete(orderId)).status).toBe(200);
  });

  it('a PASSED latest inspection is enough: completion works with milestones not all APPROVED', async () => {
    const orderId = await startedOrder(tokenFor);
    const approved = await milestone(orderId, 1);
    for (const a of ['start', 'complete', 'approve'] as const) await move(approved, a);
    const completedOnly = await milestone(orderId, 2);
    await move(completedOnly, 'start');
    await move(completedOnly, 'complete');
    const pending = await milestone(orderId, 3);
    await inspect(tokenFor, orderId, 'PASSED');

    const res = await complete(orderId);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ changed: true, order: { status: 'COMPLETED' } });
    const statuses = await prisma.milestone.findMany({ where: { orderId }, orderBy: { sequence: 'asc' }, select: { id: true, status: true } });
    expect(statuses).toEqual([
      { id: approved, status: 'APPROVED' },
      { id: completedOnly, status: 'COMPLETED' },
      { id: pending, status: 'PENDING' },
    ]);
  });

  it('completion works with an IN_PROGRESS milestone when the latest inspection is PASSED', async () => {
    const orderId = await startedOrder(tokenFor);
    await move(await milestone(orderId), 'start');
    await inspect(tokenFor, orderId, 'PASSED');
    expect((await complete(orderId)).status).toBe(200);
  });

  it('full flow: milestone rework, re-inspection PASSED, completion', async () => {
    const orderId = await startedOrder(tokenFor);
    const id = await milestone(orderId);
    await move(id, 'start');
    await move(id, 'complete');
    await inspect(tokenFor, orderId, 'REWORK_REQUIRED', 'Fix finish');
    await move(id, 'start');
    await move(id, 'complete');
    expect((await complete(orderId)).status).toBe(409); // latest is still REWORK_REQUIRED
    await inspect(tokenFor, orderId, 'PASSED');
    expect((await complete(orderId)).body.data.order.status).toBe('COMPLETED');
  });
});
