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
  PRECISION,
  api,
  assignInspector,
  auth,
  awardedOrder,
  completedOrder,
  inspect,
  owner,
  startedOrder,
  type TokenFor,
} from '../helpers/orderFlow';

/** B1: ADMIN assigns inspectors; only the current inspector can inspect or read. */
let tokenFor: TokenFor;
const WS = owner(PRECISION);

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A second inspector (not in the seed) with its own token. */
async function otherInspector() {
  const { user, token } = await createUserDirect('INSPECTOR');
  const as = (method: 'get' | 'post', path: string, body?: object) => {
    const req = request(app)[method](`/api${path}`).set(auth(token));
    return body ? req.send(body) : req;
  };
  return { id: user.id, as };
}

const activeRows = (orderId: string) => prisma.inspectorAssignment.findMany({ where: { orderId, active: true } });

describe('assign / reassign / unassign', () => {
  it('ADMIN assigns an inspector (201); assigning the same one again is 200 changed:false', async () => {
    const orderId = await awardedOrder(tokenFor, undefined, undefined, undefined, false);
    const res = await assignInspector(tokenFor, orderId);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Inspector assigned',
      data: {
        changed: true,
        previous: null,
        assignment: { orderId, inspectorId: INSPECTOR, assignedById: ADMIN, active: true, endedAt: null, inspector: { id: INSPECTOR }, assignedBy: { id: ADMIN } },
      },
    });
    const again = await assignInspector(tokenFor, orderId);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ message: 'Inspector already assigned to this order', data: { changed: false } });
    expect(await prisma.inspectorAssignment.count({ where: { orderId } })).toBe(1);
  });

  it('reassignment ends the old row (kept as history) and creates a new active one', async () => {
    const orderId = await startedOrder(tokenFor);
    const other = await otherInspector();
    const res = await assignInspector(tokenFor, orderId, other.id);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Inspector reassigned');
    expect(res.body.data.previous).toMatchObject({ inspectorId: INSPECTOR, active: null, endedById: ADMIN });
    expect(res.body.data.previous.endedAt).not.toBeNull();
    expect(res.body.data.assignment).toMatchObject({ inspectorId: other.id, active: true });

    const history = await api(tokenFor, ADMIN, 'get', `/orders/${orderId}/inspector-assignments`);
    expect(history.status).toBe(200);
    expect(history.body.data.assignments.map((a: { inspectorId: string }) => a.inspectorId)).toEqual([other.id, INSPECTOR]);
    expect(await activeRows(orderId)).toHaveLength(1);
  });

  it('unassign ends the active row; repeating it is changed:false', async () => {
    const orderId = await startedOrder(tokenFor);
    const res = await api(tokenFor, ADMIN, 'delete', `/orders/${orderId}/inspector`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Inspector unassigned', data: { changed: true, assignment: { active: null, endedById: ADMIN } } });
    expect(await activeRows(orderId)).toHaveLength(0);
    const again = await api(tokenFor, ADMIN, 'delete', `/orders/${orderId}/inspector`);
    expect(again.body).toMatchObject({ message: 'No inspector was assigned', data: { changed: false, assignment: null } });
    expect((await inspect(tokenFor, orderId, 'PASSED')).status).toBe(404);
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)('assignments cannot change on a %s order (409); the history stays', async (status) => {
    const orderId = status === 'COMPLETED' ? await completedOrder(tokenFor) : await awardedOrder(tokenFor);
    if (status === 'CANCELLED') await api(tokenFor, ASHA, 'post', `/orders/${orderId}/cancel`, { reason: 'Not needed' });
    const other = await otherInspector();
    const res = await assignInspector(tokenFor, orderId, other.id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Inspectors can only be assigned to CONFIRMED or IN_PROGRESS orders (this order is ${status})`);
    expect((await api(tokenFor, ADMIN, 'delete', `/orders/${orderId}/inspector`)).status).toBe(409);
    expect(await activeRows(orderId)).toMatchObject([{ inspectorId: INSPECTOR }]);
  });

  it('only INSPECTOR users can be assigned; unknown users and orders 404; validation 400', async () => {
    const orderId = await awardedOrder(tokenFor, undefined, undefined, undefined, false);
    const buyer = await assignInspector(tokenFor, orderId, ASHA);
    expect(buyer.status).toBe(409);
    expect(buyer.body.message).toBe('Only users with the INSPECTOR role can be assigned');
    expect((await assignInspector(tokenFor, orderId, 'no-such-user')).status).toBe(404);
    expect((await assignInspector(tokenFor, 'no-such-order')).status).toBe(404);
    expect((await api(tokenFor, ADMIN, 'put', `/orders/${orderId}/inspector`, {})).status).toBe(400);
    expect((await api(tokenFor, ADMIN, 'put', `/orders/${orderId}/inspector`, { inspectorId: INSPECTOR, active: false })).status).toBe(400);
    expect((await api(tokenFor, ADMIN, 'delete', `/orders/${orderId}/inspector`, { force: true })).status).toBe(400);
    expect(await prisma.inspectorAssignment.count()).toBe(0);
  });

  it('assignment endpoints are ADMIN only (403), and need a token (401)', async () => {
    const orderId = await awardedOrder(tokenFor, undefined, undefined, undefined, false);
    for (const as of [ASHA, WS, INSPECTOR]) {
      expect((await api(tokenFor, as, 'put', `/orders/${orderId}/inspector`, { inspectorId: INSPECTOR })).status).toBe(403);
      expect((await api(tokenFor, as, 'delete', `/orders/${orderId}/inspector`)).status).toBe(403);
      expect((await api(tokenFor, as, 'get', `/orders/${orderId}/inspector-assignments`)).status).toBe(403);
      expect((await api(tokenFor, as, 'get', '/inspections')).status).toBe(403);
      expect((await api(tokenFor, as, 'get', '/inspections/inspectors')).status).toBe(403);
    }
    expect((await request(app).put(`/api/orders/${orderId}/inspector`).send({ inspectorId: INSPECTOR })).status).toBe(401);
    expect(await prisma.inspectorAssignment.count()).toBe(0);
  });
});

describe('inspector access', () => {
  it('an inspector who is not assigned cannot inspect, read history or read the order (404)', async () => {
    const orderId = await startedOrder(tokenFor);
    const other = await otherInspector();
    for (const res of [
      await other.as('post', `/orders/${orderId}/inspections`, { status: 'PASSED' }),
      await other.as('get', `/orders/${orderId}/inspections`),
      await other.as('get', `/orders/${orderId}`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Order not found');
    }
    expect(await prisma.inspection.count()).toBe(0);
  });

  it('an order with no assignment cannot be inspected by anyone (404)', async () => {
    const orderId = await awardedOrder(tokenFor, undefined, undefined, undefined, false);
    await api(tokenFor, WS, 'post', `/orders/${orderId}/start`);
    expect((await inspect(tokenFor, orderId, 'PASSED')).status).toBe(404);
  });

  it('after reassignment the old inspector loses access; their inspection keeps its attribution', async () => {
    const orderId = await startedOrder(tokenFor);
    const first = await inspect(tokenFor, orderId, 'FAILED', 'by the first inspector');
    expect(first.status).toBe(201);
    const other = await otherInspector();
    await assignInspector(tokenFor, orderId, other.id);

    expect((await inspect(tokenFor, orderId, 'PASSED')).status).toBe(404);
    expect((await api(tokenFor, INSPECTOR, 'get', `/orders/${orderId}/inspections`)).status).toBe(404);
    expect((await api(tokenFor, INSPECTOR, 'get', `/orders/${orderId}`)).status).toBe(404);
    expect((await api(tokenFor, INSPECTOR, 'get', '/inspections/assigned')).body.data.items).toEqual([]);

    expect((await other.as('post', `/orders/${orderId}/inspections`, { status: 'PASSED' })).status).toBe(201);
    for (const res of [await other.as('get', `/orders/${orderId}/inspections`), await api(tokenFor, ASHA, 'get', `/orders/${orderId}/inspections`)]) {
      expect(res.body.data.inspections.map((i: { inspectorId: string }) => i.inspectorId)).toEqual([other.id, INSPECTOR]);
    }
    // The reassignment did not alter the old record.
    expect((await prisma.inspection.findUniqueOrThrow({ where: { id: first.body.data.inspection.id } })).inspectorId).toBe(INSPECTOR);
  });

  it('the assigned inspector reads the order without payments', async () => {
    const orderId = await startedOrder(tokenFor);
    await api(tokenFor, ASHA, 'post', `/orders/${orderId}/payments`, { amount: '100' });
    const res = await api(tokenFor, INSPECTOR, 'get', `/orders/${orderId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.order).toMatchObject({ id: orderId, status: 'IN_PROGRESS', job: { id: 'seed-job-alu-brackets' } });
    expect(res.body.data.order.payments).toBeUndefined();
    expect((await api(tokenFor, ASHA, 'get', `/orders/${orderId}`)).body.data.order.payments).toHaveLength(1);
  });

  it('GET /inspections/assigned lists my active assignments (paginated)', async () => {
    const a = await awardedOrder(tokenFor);
    const b = await awardedOrder(tokenFor, 'seed-job-stainless-shafts');
    const res = await api(tokenFor, INSPECTOR, 'get', '/inspections/assigned?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(res.body.data.items[0]).toMatchObject({ order: { id: b, job: { title: expect.any(String) }, workshop: { id: PRECISION } } });
    const page2 = await api(tokenFor, INSPECTOR, 'get', '/inspections/assigned?limit=1&page=2');
    expect(page2.body.data.items[0].order.id).toBe(a);
    expect((await api(tokenFor, INSPECTOR, 'get', '/inspections/assigned?limit=0')).status).toBe(400);
    expect((await api(tokenFor, ASHA, 'get', '/inspections/assigned')).status).toBe(403);
  });
});

describe('admin platform-wide views', () => {
  it('GET /inspections lists every inspection, filterable and paginated', async () => {
    const a = await startedOrder(tokenFor);
    const b = await startedOrder(tokenFor, 'seed-job-stainless-shafts');
    await inspect(tokenFor, a, 'FAILED', 'a1');
    await inspect(tokenFor, b, 'PASSED', 'b1');
    await inspect(tokenFor, a, 'PASSED', 'a2');

    const all = await api(tokenFor, ADMIN, 'get', '/inspections');
    expect(all.status).toBe(200);
    expect(all.body.data.items.map((i: { findings: string }) => i.findings)).toEqual(['a2', 'b1', 'a1']);
    expect(all.body.data.items[0]).toMatchObject({ inspector: { id: INSPECTOR }, order: { id: a, workshop: { id: PRECISION } } });
    expect(all.body.data.pagination.total).toBe(3);

    expect((await api(tokenFor, ADMIN, 'get', '/inspections?status=PASSED')).body.data.pagination.total).toBe(2);
    expect((await api(tokenFor, ADMIN, 'get', `/inspections?orderId=${b}`)).body.data.items).toHaveLength(1);
    expect((await api(tokenFor, ADMIN, 'get', `/inspections?inspectorId=${INSPECTOR}&limit=2`)).body.data.pagination).toMatchObject({ total: 3, totalPages: 2 });
    expect((await api(tokenFor, ADMIN, 'get', '/inspections?status=MAYBE')).status).toBe(400);
    expect((await api(tokenFor, ADMIN, 'get', '/inspections?foo=1')).status).toBe(400);
  });

  it('ADMIN reads any order history; GET /inspections/inspectors shows active assignment counts', async () => {
    const orderId = await startedOrder(tokenFor);
    await inspect(tokenFor, orderId, 'PASSED');
    expect((await api(tokenFor, ADMIN, 'get', `/orders/${orderId}/inspections`)).body.data.inspections).toHaveLength(1);
    const res = await api(tokenFor, ADMIN, 'get', '/inspections/inspectors');
    expect(res.status).toBe(200);
    expect(res.body.data.inspectors).toContainEqual(expect.objectContaining({ id: INSPECTOR, activeAssignments: 1 }));
    expect(res.body.data.inspectors[0].passwordHash).toBeUndefined();
  });
});

describe('database guards and concurrency', () => {
  it('the database allows only one active assignment per order, and active is never false', async () => {
    const orderId = await awardedOrder(tokenFor);
    const other = await otherInspector();
    await expect(
      prisma.inspectorAssignment.create({ data: { orderId, inspectorId: other.id, assignedById: ADMIN } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.inspectorAssignment.create({ data: { orderId, inspectorId: other.id, assignedById: ADMIN, active: false } }),
    ).rejects.toThrow(/InspectorAssignment_active_state_check/);
  });

  it('parallel assignments of the same inspector: one 201, the others 200 changed:false; one row', async () => {
    const orderId = await awardedOrder(tokenFor, undefined, undefined, undefined, false);
    const results = await Promise.all([1, 2, 3].map(() => assignInspector(tokenFor, orderId)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(await prisma.inspectorAssignment.count({ where: { orderId } })).toBe(1);
  });

  it('parallel assignments of different inspectors are serialised: exactly one active row at the end', async () => {
    const orderId = await awardedOrder(tokenFor, undefined, undefined, undefined, false);
    const others = await Promise.all([otherInspector(), otherInspector(), otherInspector()]);
    const results = await Promise.all(others.map((o) => assignInspector(tokenFor, orderId, o.id)));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(await activeRows(orderId)).toHaveLength(1);
    expect(await prisma.inspectorAssignment.count({ where: { orderId } })).toBe(3);
  });

  it('an inspection racing a reassignment: it succeeds only if it ran before the reassignment', async () => {
    for (let round = 0; round < 3; round += 1) {
      tokenFor = await seededSession();
      const orderId = await startedOrder(tokenFor);
      const other = await otherInspector();
      const [ri, ra] = await Promise.all([inspect(tokenFor, orderId, 'PASSED'), assignInspector(tokenFor, orderId, other.id)]);
      expect(ra.status).toBe(201);
      const newAssignment = await prisma.inspectorAssignment.findFirstOrThrow({ where: { orderId, active: true } });
      if (ri.status === 201) {
        const inspection = await prisma.inspection.findUniqueOrThrow({ where: { id: ri.body.data.inspection.id } });
        expect(inspection.inspectorId).toBe(INSPECTOR);
        expect(inspection.inspectedAt.getTime()).toBeLessThanOrEqual(newAssignment.assignedAt.getTime());
      } else {
        expect(ri.status).toBe(404);
        expect(await prisma.inspection.count({ where: { orderId } })).toBe(0);
      }
    }
  });
});
