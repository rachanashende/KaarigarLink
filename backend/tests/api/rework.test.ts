import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import { ASHA, INSPECTOR, PRECISION, SHAFTS, api, inspect, owner, startedOrder, type TokenFor } from '../helpers/orderFlow';

/** B2: rework targeting, including already-APPROVED milestones. */
let tokenFor: TokenFor;
const WS = owner(PRECISION);

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const create = async (orderId: string, sequence: number) =>
  (await api(tokenFor, WS, 'post', `/orders/${orderId}/milestones`, { title: `M${sequence}`, sequence })).body.data.milestone.id as string;
const move = (id: string, action: 'start' | 'complete' | 'approve') =>
  api(tokenFor, action === 'approve' ? ASHA : WS, 'post', `/milestones/${id}/${action}`);
const approveAll = async (id: string) => {
  for (const a of ['start', 'complete', 'approve'] as const) expect((await move(id, a)).status).toBe(200);
};
const rework = (orderId: string, body: Record<string, unknown> = {}) =>
  api(tokenFor, INSPECTOR, 'post', `/orders/${orderId}/inspections`, { status: 'REWORK_REQUIRED', ...body });
const milestone = (id: string) => prisma.milestone.findUniqueOrThrow({ where: { id } });
const complete = (orderId: string) => api(tokenFor, ASHA, 'post', `/orders/${orderId}/complete`);

describe('rework targets', () => {
  it('an APPROVED milestone can be sent back with milestoneId; later milestones are untouched', async () => {
    const orderId = await startedOrder(tokenFor);
    const m1 = await create(orderId, 1);
    const m2 = await create(orderId, 2);
    await approveAll(m1);
    await move(m2, 'start');
    const m2Before = await milestone(m2);

    const res = await rework(orderId, { milestoneId: m1, findings: 'Weld porosity found later' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ reworkMilestoneId: m1, inspection: { milestoneId: m1, status: 'REWORK_REQUIRED' } });
    expect(await milestone(m1)).toMatchObject({ status: 'REWORK_REQUIRED', completedAt: null, notes: 'Weld porosity found later' });
    expect(await milestone(m2)).toEqual(m2Before);

    // The workshop restarts it; the buyer re-approves.
    await approveAll(m1);
    expect((await milestone(m1)).status).toBe('APPROVED');
  });

  it('rework when every milestone is APPROVED: without milestoneId 409 and nothing written; with it 201', async () => {
    const orderId = await startedOrder(tokenFor);
    const m1 = await create(orderId, 1);
    const m2 = await create(orderId, 2);
    await approveAll(m1);
    await approveAll(m2);

    const refused = await rework(orderId);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toBe(
      'No IN_PROGRESS or COMPLETED milestone to send back; pass milestoneId to choose one (an APPROVED milestone can be reopened)',
    );
    expect(await prisma.inspection.count({ where: { orderId } })).toBe(0);

    const res = await rework(orderId, { milestoneId: m2 });
    expect(res.status).toBe(201);
    expect((await milestone(m2)).status).toBe('REWORK_REQUIRED');
    expect((await milestone(m1)).status).toBe('APPROVED');
    expect((await complete(orderId)).status).toBe(409);
  });

  it('without milestoneId the active milestone is chosen (unchanged default)', async () => {
    const orderId = await startedOrder(tokenFor);
    const m1 = await create(orderId, 1);
    const m2 = await create(orderId, 2);
    await approveAll(m1);
    await move(m2, 'start');
    await move(m2, 'complete');
    const res = await rework(orderId, { findings: 'Finish' });
    expect(res.body.data.reworkMilestoneId).toBe(m2);
    expect((await milestone(m1)).status).toBe('APPROVED');
  });

  it('an order with no milestones: REWORK_REQUIRED is recorded and blocks completion', async () => {
    const orderId = await startedOrder(tokenFor);
    const res = await rework(orderId, { findings: 'Whole batch' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ reworkMilestoneId: null, inspection: { milestoneId: null } });
    expect((await complete(orderId)).status).toBe(409);
    await inspect(tokenFor, orderId, 'PASSED');
    expect((await complete(orderId)).status).toBe(200);
  });

  it('FAILED changes no milestone and blocks completion until a later PASSED', async () => {
    const orderId = await startedOrder(tokenFor);
    const m1 = await create(orderId, 1);
    await move(m1, 'start');
    const before = await milestone(m1);
    expect((await inspect(tokenFor, orderId, 'FAILED', 'Out of tolerance')).body.data.inspection.milestoneId).toBeNull();
    expect(await milestone(m1)).toEqual(before);
    expect((await complete(orderId)).status).toBe(409);
  });

  it('invalid targets: PENDING 409, already REWORK_REQUIRED 409, another order 404, unknown 404 - nothing written', async () => {
    const orderId = await startedOrder(tokenFor);
    const pending = await create(orderId, 1);
    let res = await rework(orderId, { milestoneId: pending });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Milestone 1 has not started yet; only started milestones can be sent back for rework');

    await move(pending, 'start');
    expect((await rework(orderId, { milestoneId: pending })).status).toBe(201);
    res = await rework(orderId, { milestoneId: pending });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Milestone 1 is already awaiting rework');

    const otherOrder = await startedOrder(tokenFor, SHAFTS);
    const foreign = await create(otherOrder, 1);
    await move(foreign, 'start');
    res = await rework(orderId, { milestoneId: foreign });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Milestone not found');
    expect((await milestone(foreign)).status).toBe('IN_PROGRESS');
    expect((await rework(orderId, { milestoneId: 'no-such-milestone' })).status).toBe(404);
    expect(await prisma.inspection.count({ where: { orderId } })).toBe(1);
  });

  it('validation: milestoneId only with REWORK_REQUIRED; empty milestoneId 400', async () => {
    const orderId = await startedOrder(tokenFor);
    const m1 = await create(orderId, 1);
    for (const status of ['PASSED', 'FAILED']) {
      const res = await api(tokenFor, INSPECTOR, 'post', `/orders/${orderId}/inspections`, { status, milestoneId: m1 });
      expect(res.status).toBe(400);
    }
    expect((await rework(orderId, { milestoneId: '  ' })).status).toBe(400);
  });

  it('history keeps every inspection and which milestone each rework targeted', async () => {
    const orderId = await startedOrder(tokenFor);
    const m1 = await create(orderId, 1);
    await approveAll(m1);
    await rework(orderId, { milestoneId: m1, findings: 'first' });
    await approveAll(m1);
    await inspect(tokenFor, orderId, 'PASSED');
    const res = await api(tokenFor, ASHA, 'get', `/orders/${orderId}/inspections`);
    expect(res.body.data.inspections.map((i: { status: string; milestoneId: string | null }) => [i.status, i.milestoneId])).toEqual([
      ['PASSED', null],
      ['REWORK_REQUIRED', m1],
    ]);
    expect((await complete(orderId)).status).toBe(200);
  });
});

describe('terminal orders and rollback', () => {
  it.each(['COMPLETED', 'CANCELLED'] as const)('no inspection (with or without milestoneId) after %s (409)', async (status) => {
    const orderId = await startedOrder(tokenFor);
    const m1 = await create(orderId, 1);
    await approveAll(m1);
    if (status === 'COMPLETED') {
      await inspect(tokenFor, orderId, 'PASSED');
      expect((await complete(orderId)).status).toBe(200);
    } else {
      await api(tokenFor, ASHA, 'post', `/orders/${orderId}/cancel`, { reason: 'Not needed' });
    }
    const before = await prisma.inspection.count({ where: { orderId } });
    for (const res of [await rework(orderId, { milestoneId: m1 }), await inspect(tokenFor, orderId, 'FAILED')]) {
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(`Only IN_PROGRESS orders can be inspected (this order is ${status})`);
    }
    expect(await prisma.inspection.count({ where: { orderId } })).toBe(before);
    expect((await milestone(m1)).status).toBe('APPROVED');
  });

  it('if the inspection insert fails, the reopened APPROVED milestone is rolled back', async () => {
    const orderId = await startedOrder(tokenFor);
    const m1 = await create(orderId, 1);
    await approveAll(m1);
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION b2_fail_inspection() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected failure'; END; $$ LANGUAGE plpgsql;`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER b2_fail_inspection BEFORE INSERT ON "Inspection" FOR EACH ROW EXECUTE FUNCTION b2_fail_inspection()`);
    try {
      expect((await rework(orderId, { milestoneId: m1 })).status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS b2_fail_inspection ON "Inspection"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS b2_fail_inspection()');
    }
    expect((await milestone(m1)).status).toBe('APPROVED');
    expect(await prisma.inspection.count()).toBe(0);
  });
});

describe('concurrency', () => {
  it('parallel rework requests for the same APPROVED milestone: one 201, the others 409', async () => {
    const orderId = await startedOrder(tokenFor);
    const m1 = await create(orderId, 1);
    await approveAll(m1);
    const results = await Promise.all([1, 2, 3].map(() => rework(orderId, { milestoneId: m1 })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.inspection.count({ where: { orderId } })).toBe(1);
  });

  it('parallel inspections are all recorded with strictly increasing inspectedAt', async () => {
    const orderId = await startedOrder(tokenFor);
    const results = await Promise.all(['FAILED', 'PASSED', 'FAILED', 'PASSED'].map((s) => inspect(tokenFor, orderId, s as 'PASSED')));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const rows = await prisma.inspection.findMany({ where: { orderId }, orderBy: { inspectedAt: 'asc' } });
    const times = rows.map((r) => r.inspectedAt.getTime());
    expect(new Set(times).size).toBe(4);
    // The QC gate follows the latest one.
    const res = await complete(orderId);
    expect(res.status).toBe(rows[3].status === 'PASSED' ? 200 : 409);
  });

  it('a rework of an APPROVED milestone racing order completion: never COMPLETED after a non-PASSED latest inspection', async () => {
    for (let round = 0; round < 3; round += 1) {
      tokenFor = await seededSession();
      const orderId = await startedOrder(tokenFor);
      const m1 = await create(orderId, 1);
      await approveAll(m1);
      await inspect(tokenFor, orderId, 'PASSED');
      const [rr, rc] = await Promise.all([rework(orderId, { milestoneId: m1 }), complete(orderId)]);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      if (rc.status === 200) {
        expect(rr.status).toBe(409);
        expect(order.status).toBe('COMPLETED');
        expect((await milestone(m1)).status).toBe('APPROVED');
      } else {
        expect(rr.status).toBe(201);
        expect(order.status).toBe('IN_PROGRESS');
        expect((await milestone(m1)).status).toBe('REWORK_REQUIRED');
      }
    }
  });
});
