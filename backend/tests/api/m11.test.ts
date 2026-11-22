import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import { createUserDirect } from '../helpers/auth';
import {
  ADMIN, ASHA, INSPECTOR, PRECISION, api, assignInspector, auth, awardedOrder, owner, startedOrder, type TokenFor,
} from '../helpers/orderFlow';

/** M11: account profile, inspection drafts + structured checklist, quote versions, admin/order list strategy. */
let tokenFor: TokenFor;
const WS = owner(PRECISION);

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const checklist = {
  items: [
    { id: 'dimensions', label: 'Dimensions & tolerances', result: 'PASS', notes: 'Within tolerance' },
    { id: 'finish', label: 'Surface finish & workmanship', result: 'FAIL', notes: 'Burrs on edges', evidence: [{ name: 'edge.jpg', mediaType: 'image/jpeg', sizeBytes: 1200 }] },
  ],
};

describe('PATCH /auth/me', () => {
  it('updates name and phone; email and role cannot change', async () => {
    const res = await api(tokenFor, ASHA, 'patch', '/auth/me', { name: 'Asha R.', phone: '+91 90000 00000' });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: ASHA, name: 'Asha R.', phone: '+91 90000 00000', role: 'BUYER' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect((await api(tokenFor, ASHA, 'patch', '/auth/me', { email: 'x@y.z' })).status).toBe(400);
    expect((await api(tokenFor, ASHA, 'patch', '/auth/me', { role: 'ADMIN' })).status).toBe(400);
    expect((await api(tokenFor, ASHA, 'patch', '/auth/me', {})).status).toBe(400);
    expect((await api(tokenFor, ASHA, 'patch', '/auth/me', { phone: null })).body.data.user.phone).toBeNull();
    expect((await request(app).patch('/api/auth/me').send({ name: 'Nobody' })).status).toBe(401);
  });
});

describe('inspection drafts', () => {
  const draftPath = (orderId: string) => `/orders/${orderId}/inspection-draft`;

  it('the assigned inspector saves, reads, replaces and deletes a private draft; nothing else changes', async () => {
    const orderId = await startedOrder(tokenFor);
    expect((await api(tokenFor, INSPECTOR, 'get', draftPath(orderId))).body.data.draft).toBeNull();
    const before = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    const saved = await api(tokenFor, INSPECTOR, 'put', draftPath(orderId), { checklist, findings: 'Work in progress' });
    expect(saved.status).toBe(200);
    expect(saved.body.data.draft).toMatchObject({ orderId, inspectorId: INSPECTOR, findings: 'Work in progress', checklist: { version: 1, items: [{ id: 'dimensions' }, { id: 'finish' }] } });
    const replaced = await api(tokenFor, INSPECTOR, 'put', draftPath(orderId), { checklist: { items: [] } });
    expect(replaced.body.data.draft).toMatchObject({ findings: null, checklist: { items: [] } });
    expect(await prisma.inspectionDraft.count({ where: { orderId } })).toBe(1);

    // A draft is not an inspection: history, QC gate and the order are untouched.
    expect((await api(tokenFor, ASHA, 'get', `/orders/${orderId}/inspections`)).body.data.inspections).toEqual([]);
    expect((await api(tokenFor, ASHA, 'post', `/orders/${orderId}/complete`)).status).toBe(409);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toEqual(before);

    const deleted = await api(tokenFor, INSPECTOR, 'delete', draftPath(orderId));
    expect(deleted.body.data).toEqual({ deleted: true });
    expect((await api(tokenFor, INSPECTOR, 'delete', draftPath(orderId))).body.data).toEqual({ deleted: false });
  });

  it('only the current inspector can reach their draft; reassignment does not transfer it', async () => {
    const orderId = await startedOrder(tokenFor);
    await api(tokenFor, INSPECTOR, 'put', draftPath(orderId), { checklist, findings: 'Mine' });
    const other = await createUserDirect('INSPECTOR');
    const asOther = (method: 'get' | 'put', body?: object) => {
      const req = request(app)[method](`/api${draftPath(orderId)}`).set(auth(other.token));
      return body ? req.send(body) : req;
    };
    expect((await asOther('get')).status).toBe(404);
    await assignInspector(tokenFor, orderId, other.user.id);
    expect((await asOther('get')).body.data.draft).toBeNull();
    expect((await api(tokenFor, INSPECTOR, 'get', draftPath(orderId))).status).toBe(404);
    expect(await prisma.inspectionDraft.count({ where: { orderId, inspectorId: INSPECTOR } })).toBe(1);
    for (const as of [ASHA, WS, ADMIN]) expect((await api(tokenFor, as, 'get', draftPath(orderId))).status).toBe(403);
  });

  it('submitting an inspection stores the structured checklist and removes the draft atomically', async () => {
    const orderId = await startedOrder(tokenFor);
    await api(tokenFor, INSPECTOR, 'put', draftPath(orderId), { checklist, findings: 'Draft' });
    const res = await api(tokenFor, INSPECTOR, 'post', `/orders/${orderId}/inspections`, {
      status: 'FAILED', findings: 'Finish out of spec', checklist,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.inspection).toMatchObject({ status: 'FAILED', findings: 'Finish out of spec', checklist: { version: 1, items: [{ id: 'dimensions', result: 'PASS' }, { id: 'finish', result: 'FAIL', evidence: [{ name: 'edge.jpg' }] }] } });
    expect(await prisma.inspectionDraft.count({ where: { orderId } })).toBe(0);
  });

  it('validation: rework details only with REWORK_REQUIRED; duplicate ids, bad results and terminal orders rejected', async () => {
    const orderId = await startedOrder(tokenFor);
    const withRework = { ...checklist, rework: { reason: 'Deburr edges', correctiveAction: 'Rework batch', deadline: '2027-01-10' } };
    expect((await api(tokenFor, INSPECTOR, 'post', `/orders/${orderId}/inspections`, { status: 'PASSED', checklist: withRework })).status).toBe(400);
    expect((await api(tokenFor, INSPECTOR, 'put', draftPath(orderId), { checklist: { items: [checklist.items[0], checklist.items[0]] } })).status).toBe(400);
    expect((await api(tokenFor, INSPECTOR, 'put', draftPath(orderId), { checklist: { items: [{ ...checklist.items[0], result: 'MAYBE' }] } })).status).toBe(400);
    await api(tokenFor, ASHA, 'post', `/orders/${orderId}/cancel`, { reason: 'Not needed' });
    expect((await api(tokenFor, INSPECTOR, 'put', draftPath(orderId), { checklist })).status).toBe(409);
  });
});

describe('quote optimistic concurrency', () => {
  async function submittedQuote() {
    const inv = await api(tokenFor, ASHA, 'post', '/jobs/seed-job-alu-brackets/invitations', { workshopId: PRECISION });
    const invitationId = inv.body.data.invitation.id;
    await api(tokenFor, WS, 'post', `/invitations/${invitationId}/respond`, { response: 'ACCEPTED' });
    return (await api(tokenFor, WS, 'post', `/quotes/invitations/${invitationId}`, { totalPrice: '100', estimatedDays: 5 })).body.data.quote;
  }

  it('an edit with the current version succeeds; a stale version is 409 and nothing changes', async () => {
    const quote = await submittedQuote();
    const first = await api(tokenFor, WS, 'patch', `/quotes/${quote.id}`, { totalPrice: '110', expectedUpdatedAt: quote.updatedAt });
    expect(first.status).toBe(200);
    const stale = await api(tokenFor, WS, 'patch', `/quotes/${quote.id}`, { totalPrice: '90', expectedUpdatedAt: quote.updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.message).toBe('This quote was changed since you loaded it. Reload the latest version and try again.');
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).totalPrice.toFixed(2)).toBe('110.00');
    expect((await api(tokenFor, WS, 'patch', `/quotes/${quote.id}`, { expectedUpdatedAt: first.body.data.quote.updatedAt })).status).toBe(400);
  });

  it('withdraw honours the version too', async () => {
    const quote = await submittedQuote();
    await api(tokenFor, WS, 'patch', `/quotes/${quote.id}`, { notes: 'changed' });
    expect((await api(tokenFor, WS, 'post', `/quotes/${quote.id}/withdraw`, { expectedUpdatedAt: quote.updatedAt })).status).toBe(409);
    expect((await api(tokenFor, WS, 'post', `/quotes/${quote.id}/withdraw`)).status).toBe(200);
  });
});

describe('list endpoints without per-record reads', () => {
  it('GET /orders/mine?view=full returns full details; default stays the summary', async () => {
    await awardedOrder(tokenFor);
    const full = await api(tokenFor, ASHA, 'get', '/orders/mine?view=full');
    expect(full.status).toBe(200);
    expect(full.body.data.orders[0]).toMatchObject({ job: { material: expect.any(String) }, quote: { totalPrice: '12500.50' }, buyer: { id: ASHA }, milestones: [], inspections: [], payments: [] });
    const summary = await api(tokenFor, ASHA, 'get', '/orders/mine');
    expect(summary.body.data.orders[0].job.material).toBeUndefined();
    expect((await api(tokenFor, ASHA, 'get', '/orders/mine?view=everything')).status).toBe(400);
  });

  it('GET /admin/workshops returns full profiles (ADMIN only)', async () => {
    const res = await api(tokenFor, ADMIN, 'get', '/admin/workshops?limit=100');
    expect(res.status).toBe(200);
    expect(res.body.data.items.find((w: { id: string }) => w.id === PRECISION)).toMatchObject({ machines: expect.any(Array), capabilities: expect.any(Array), capacities: expect.any(Array) });
    expect((await api(tokenFor, ASHA, 'get', '/admin/workshops')).status).toBe(403);
  });
});
