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

const create = (orderId: string, body: unknown, as = WS) => api(tokenFor, as, 'post', `/orders/${orderId}/milestones`, body);
const list = (orderId: string, as = ASHA) => api(tokenFor, as, 'get', `/orders/${orderId}/milestones`);
const edit = (id: string, body: unknown, as = WS) => api(tokenFor, as, 'patch', `/milestones/${id}`, body);
const move = (id: string, action: 'start' | 'complete' | 'approve', as = action === 'approve' ? ASHA : WS) =>
  api(tokenFor, as, 'post', `/milestones/${id}/${action}`);
const row = (id: string) => prisma.milestone.findUniqueOrThrow({ where: { id } });

async function milestones(orderId: string, n: number) {
  const ids: string[] = [];
  for (let s = 1; s <= n; s += 1) {
    const res = await create(orderId, { title: `Step ${s}`, sequence: s });
    expect(res.status).toBe(201);
    ids.push(res.body.data.milestone.id);
  }
  return ids;
}

describe('create and list', () => {
  it('the awarded workshop creates milestones on a CONFIRMED order; buyer and workshop list them by sequence', async () => {
    const orderId = await awardedOrder(tokenFor);
    const b = await create(orderId, { title: '  Machining  ', sequence: 2, description: 'CNC', dueDate: '2027-01-15' });
    expect(b.status).toBe(201);
    expect(b.body).toMatchObject({
      success: true,
      message: 'Milestone created',
      data: { milestone: { orderId, title: 'Machining', sequence: 2, status: 'PENDING', description: 'CNC' } },
    });
    expect(b.body.data.milestone.dueDate).toBe('2027-01-15T23:59:59.999Z');
    expect((await create(orderId, { title: 'Material', sequence: 1 })).status).toBe(201);

    for (const as of [ASHA, WS]) {
      const res = await list(orderId, as);
      expect(res.status).toBe(200);
      expect(res.body.data.milestones.map((m: { sequence: number }) => m.sequence)).toEqual([1, 2]);
    }
  });

  it('a duplicate sequence is a 409 and nothing is created', async () => {
    const orderId = await awardedOrder(tokenFor);
    await milestones(orderId, 1);
    const res = await create(orderId, { title: 'Again', sequence: 1 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'A milestone with sequence 1 already exists for this order' });
    expect(await prisma.milestone.count({ where: { orderId } })).toBe(1);
  });

  it('a new milestone must come after every started milestone', async () => {
    const orderId = await startedOrder(tokenFor);
    const two = (await create(orderId, { title: 'Two', sequence: 2 })).body.data.milestone.id;
    const four = (await create(orderId, { title: 'Four', sequence: 4 })).body.data.milestone.id;
    expect((await move(two, 'start')).status).toBe(200);
    const res = await create(orderId, { title: 'Before a started one', sequence: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('sequence must be greater than 2, the last milestone that has already started');
    expect((await edit(four, { sequence: 1 })).status).toBe(409);
    expect((await create(orderId, { title: 'Three', sequence: 3 })).status).toBe(201);
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)('cannot create on a %s order (409)', async (status) => {
    const orderId = await startedOrder(tokenFor);
    if (status === 'COMPLETED') {
      await inspect(tokenFor, orderId, 'PASSED');
      expect((await api(tokenFor, ASHA, 'post', `/orders/${orderId}/complete`)).status).toBe(200);
    } else {
      expect((await api(tokenFor, ASHA, 'post', `/orders/${orderId}/cancel`, { reason: 'No longer needed' })).status).toBe(200);
    }
    const res = await create(orderId, { title: 'Too late', sequence: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Milestones cannot be changed on an order that is ${status}`);
  });

  it.each([
    ['missing title', { sequence: 1 }],
    ['blank title', { title: '   ', sequence: 1 }],
    ['sequence 0', { title: 'x', sequence: 0 }],
    ['fractional sequence', { title: 'x', sequence: 1.5 }],
    ['string sequence', { title: 'x', sequence: '1' }],
    ['bad date', { title: 'x', sequence: 1, dueDate: 'soon' }],
    ['unknown field', { title: 'x', sequence: 1, status: 'APPROVED' }],
    ['title too long', { title: 'x'.repeat(201), sequence: 1 }],
  ])('validation: %s -> 400', async (_name, body) => {
    const orderId = await awardedOrder(tokenFor);
    expect((await create(orderId, body)).status).toBe(400);
  });

  it('permissions: buyer/inspector/admin 403 on create; other workshop and other buyer 404; no token 401', async () => {
    const orderId = await awardedOrder(tokenFor);
    for (const as of [ASHA, INSPECTOR, ADMIN]) expect((await create(orderId, { title: 'x', sequence: 1 }, as)).status).toBe(403);
    const other = await create(orderId, { title: 'x', sequence: 1 }, owner(MUMBAI));
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Order not found');
    expect((await list(orderId, VIKRAM)).status).toBe(404);
    expect((await list(orderId, owner(MUMBAI))).status).toBe(404);
    expect((await list(orderId, INSPECTOR)).status).toBe(403);
    expect((await create('no-such-order', { title: 'x', sequence: 1 })).status).toBe(404);
    expect((await request(app).get(`/api/orders/${orderId}/milestones`)).status).toBe(401);
    const noProfile = await createUserDirect('WORKSHOP');
    expect((await request(app).get(`/api/orders/${orderId}/milestones`).set(auth(noProfile.token))).status).toBe(404);
  });
});

describe('edit', () => {
  it('edits a PENDING milestone (title, description cleared, sequence moved)', async () => {
    const orderId = await awardedOrder(tokenFor);
    const res0 = await create(orderId, { title: 'Draft', sequence: 1, description: 'old' });
    const id = res0.body.data.milestone.id;
    const res = await edit(id, { title: 'Final', description: null, sequence: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.milestone).toMatchObject({ title: 'Final', description: null, sequence: 5, status: 'PENDING' });
  });

  it('only PENDING milestones can be edited (409); moving onto a used sequence is 409', async () => {
    const orderId = await startedOrder(tokenFor);
    const [a, b] = await milestones(orderId, 2);
    expect((await edit(b, { sequence: 1 })).status).toBe(409);
    await move(a, 'start');
    const res = await edit(a, { title: 'Changed' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Only PENDING milestones can be edited (this milestone is IN_PROGRESS)');
    expect((await row(a)).title).toBe('Step 1');
  });

  it('validation and access: empty body 400, unknown field 400, buyer 403, other workshop 404', async () => {
    const orderId = await awardedOrder(tokenFor);
    const [id] = await milestones(orderId, 1);
    expect((await edit(id, {})).status).toBe(400);
    expect((await edit(id, { status: 'APPROVED' })).status).toBe(400);
    expect((await edit(id, { title: 'x' }, ASHA)).status).toBe(403);
    const other = await edit(id, { title: 'x' }, owner(MUMBAI));
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Milestone not found');
  });
});

describe('transitions', () => {
  it('start -> complete -> approve, with timestamps; repeats are 200 changed:false', async () => {
    const orderId = await startedOrder(tokenFor);
    const [id] = await milestones(orderId, 1);

    const s = await move(id, 'start');
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ message: 'Milestone started', data: { changed: true, milestone: { status: 'IN_PROGRESS' } } });
    expect(s.body.data.milestone.startedAt).not.toBeNull();
    const s2 = await move(id, 'start');
    expect(s2.body).toMatchObject({ message: 'Milestone already started', data: { changed: false } });

    const c = await move(id, 'complete');
    expect(c.body.data).toMatchObject({ changed: true, milestone: { status: 'COMPLETED' } });
    expect(c.body.data.milestone.completedAt).not.toBeNull();
    const before = await row(id);
    expect((await move(id, 'complete')).body.data.changed).toBe(false);
    expect((await row(id)).updatedAt).toEqual(before.updatedAt);

    const a = await move(id, 'approve');
    expect(a.body).toMatchObject({ message: 'Milestone approved', data: { changed: true, milestone: { status: 'APPROVED' } } });
    expect((await move(id, 'approve')).body.data.changed).toBe(false);
  });

  it('sequential: a later milestone cannot start until every earlier one is APPROVED', async () => {
    const orderId = await startedOrder(tokenFor);
    const [a, b] = await milestones(orderId, 2);
    let res = await move(b, 'start');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Milestone 1 is PENDING; earlier milestones must be APPROVED before this one can start');
    await move(a, 'start');
    await move(a, 'complete');
    res = await move(b, 'start');
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Milestone 1 is COMPLETED');
    await move(a, 'approve');
    expect((await move(b, 'start')).status).toBe(200);
  });

  it.each([
    ['complete a PENDING milestone', 'complete', 'A PENDING milestone cannot be completed'],
    ['approve a PENDING milestone', 'approve', 'A PENDING milestone cannot be approved'],
  ] as const)('invalid transition: %s (409)', async (_name, action, message) => {
    const orderId = await startedOrder(tokenFor);
    const [id] = await milestones(orderId, 1);
    const res = await move(id, action);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(message);
  });

  it('an APPROVED milestone cannot be started or completed again', async () => {
    const orderId = await startedOrder(tokenFor);
    const [id] = await milestones(orderId, 1);
    for (const a of ['start', 'complete', 'approve'] as const) await move(id, a);
    expect((await move(id, 'start')).status).toBe(409);
    expect((await move(id, 'complete')).status).toBe(409);
  });

  it('transitions need an IN_PROGRESS order (CONFIRMED -> 409)', async () => {
    const orderId = await awardedOrder(tokenFor);
    const [id] = await milestones(orderId, 1);
    const res = await move(id, 'start');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Milestones can only be started while the order is IN_PROGRESS (it is CONFIRMED)');
  });

  it('roles: buyer cannot start/complete (403), workshop cannot approve (403); other parties 404', async () => {
    const orderId = await startedOrder(tokenFor);
    const [id] = await milestones(orderId, 1);
    expect((await move(id, 'start', ASHA)).status).toBe(403);
    expect((await move(id, 'start', owner(MUMBAI))).status).toBe(404);
    await move(id, 'start');
    await move(id, 'complete');
    expect((await move(id, 'approve', WS)).status).toBe(403);
    expect((await move(id, 'approve', VIKRAM)).status).toBe(404);
    expect((await move(id, 'approve', INSPECTOR)).status).toBe(403);
    expect((await row(id)).status).toBe('COMPLETED');
    expect((await api(tokenFor, WS, 'post', `/milestones/${id}/start`, { force: true })).status).toBe(400);
  });

  it('rework: a REWORK_REQUIRED inspection sends the active milestone back; the workshop restarts it', async () => {
    const orderId = await startedOrder(tokenFor);
    const [id] = await milestones(orderId, 1);
    await move(id, 'start');
    await move(id, 'complete');
    const startedAt = (await row(id)).startedAt;

    const res = await inspect(tokenFor, orderId, 'REWORK_REQUIRED', 'Burrs on edges');
    expect(res.status).toBe(201);
    expect(res.body.data.reworkMilestoneId).toBe(id);
    expect(await row(id)).toMatchObject({ status: 'REWORK_REQUIRED', completedAt: null, notes: 'Burrs on edges' });
    expect((await move(id, 'approve')).status).toBe(409);

    const restart = await move(id, 'start');
    expect(restart.status).toBe(200);
    expect((await row(id)).startedAt).toEqual(startedAt);
    await move(id, 'complete');
    expect((await move(id, 'approve')).status).toBe(200);
  });
});
