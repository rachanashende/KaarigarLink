import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import { createUserDirect } from '../helpers/auth';
import { ADMIN, ASHA, BRACKETS, INSPECTOR, PRECISION, VIKRAM, api, assignInspector, auth, owner, startedOrder, type TokenFor } from '../helpers/orderFlow';

/**
 * M13 verification: access control, size limits, isolation and duplicate prevention
 * for the M12 documents, audit history and notifications endpoints.
 */
let tokenFor: TokenFor;
const WS = owner(PRECISION);
const PDF = Buffer.from('%PDF-1.4\n% test\n');

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function upload(token: string, url: string, name: string, type: string, body: Buffer) {
  return request(app).post('/api' + url).set(auth(token)).set('Content-Type', type).set('X-File-Name', encodeURIComponent(name)).send(body);
}

describe('authentication and routing', () => {
  it('every M12 endpoint requires authentication; unknown routes stay 404', async () => {
    const calls: Array<[method: 'get' | 'post' | 'delete' | 'patch', url: string]> = [
      ['get', `/jobs/${BRACKETS}/documents`],
      ['post', `/jobs/${BRACKETS}/documents`],
      ['get', '/orders/x/documents'],
      ['post', '/orders/x/documents'],
      ['get', '/documents/x/download'],
      ['delete', '/documents/x'],
      ['get', '/audit'],
      ['get', '/orders/x/history'],
      ['get', '/notifications'],
      ['get', '/notifications/unread-count'],
      ['post', '/notifications/read-all'],
      ['post', '/notifications/x/read'],
      ['patch', '/auth/me/password'],
    ];
    for (const [method, url] of calls) {
      expect((await request(app)[method]('/api' + url)).status, `${method} ${url}`).toBe(401);
    }
    // The activity router is mounted at /api last; it must not turn unknown routes into 401.
    expect((await request(app).get('/api/no-such-route')).status).toBe(404);
  });
});

describe('documents', () => {
  it('an upload over MAX_UPLOAD_BYTES is 413 (not 500) and stores nothing', async () => {
    const big = Buffer.alloc(env.MAX_UPLOAD_BYTES + 1, 0x20);
    big.write('%PDF-1.4\n');
    const res = await upload(await tokenFor(ASHA), `/jobs/${BRACKETS}/documents`, 'big.pdf', 'application/pdf', big);
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ success: false });
    expect(res.body.stack).toBeUndefined();
    expect(await prisma.document.count()).toBe(0);
  });

  it('a non-owner buyer, a workshop and an inspector cannot upload design files', async () => {
    expect((await upload(await tokenFor(VIKRAM), `/jobs/${BRACKETS}/documents`, 'd.pdf', 'application/pdf', PDF)).status).toBe(404);
    expect((await upload(await tokenFor(WS), `/jobs/${BRACKETS}/documents`, 'd.pdf', 'application/pdf', PDF)).status).toBe(403);
    expect((await upload(await tokenFor(INSPECTOR), `/jobs/${BRACKETS}/documents`, 'd.pdf', 'application/pdf', PDF)).status).toBe(403);
  });

  it('files are written under the test storage folder only, and deletion removes the file', async () => {
    const res = await upload(await tokenFor(ASHA), `/jobs/${BRACKETS}/documents`, 'drawing.pdf', 'application/pdf', PDF);
    expect(res.status).toBe(201);
    const id = res.body.data.document.id;
    const { storageKey } = await prisma.document.findUniqueOrThrow({ where: { id } });
    const root = path.resolve(env.FILE_STORAGE_DIR);
    expect(root.endsWith(path.join('storage', 'test-uploads'))).toBe(true);
    const file = path.join(root, ...storageKey.split('/'));
    expect(fs.readFileSync(file).equals(PDF)).toBe(true);

    expect((await api(tokenFor, ASHA, 'delete', `/documents/${id}`)).status).toBe(200);
    expect(fs.existsSync(file)).toBe(false);
    expect((await request(app).get(`/api/documents/${id}/download`).set(auth(await tokenFor(ASHA)))).status).toBe(404);
  });

  it('after reassignment the previous inspector loses access to the order documents and history', async () => {
    const orderId = await startedOrder(tokenFor);
    const res = await upload(await tokenFor(INSPECTOR), `/orders/${orderId}/documents`, 'edge.pdf', 'application/pdf', PDF);
    expect(res.status).toBe(201);
    const docId = res.body.data.document.id;

    const next = await createUserDirect('INSPECTOR');
    expect((await assignInspector(tokenFor, orderId, next.user.id)).status).toBe(201); // new assignment

    const old = await tokenFor(INSPECTOR);
    expect((await request(app).get(`/api/orders/${orderId}/documents`).set(auth(old))).status).toBe(404);
    expect((await request(app).get(`/api/documents/${docId}/download`).set(auth(old))).status).toBe(404);
    expect((await request(app).get(`/api/orders/${orderId}/history`).set(auth(old))).status).toBe(404);
    expect((await upload(old, `/orders/${orderId}/documents`, 'late.pdf', 'application/pdf', PDF)).status).toBe(404);
    // The previous inspector's upload is not theirs to delete any more either.
    expect((await request(app).delete(`/api/documents/${docId}`).set(auth(old))).status).toBe(404);

    expect((await request(app).get(`/api/orders/${orderId}/documents`).set(auth(next.token))).body.data.documents).toHaveLength(1);
    expect((await request(app).get(`/api/documents/${docId}/download`).set(auth(next.token))).status).toBe(200);
    expect((await request(app).get(`/api/documents/${docId}/download`).set(auth(await tokenFor(ADMIN)))).status).toBe(200);
    expect((await request(app).get(`/api/documents/${docId}/download`).set(auth(await tokenFor(VIKRAM)))).status).toBe(404);
  });
});

describe('audit history', () => {
  it('admin filters by order, entity type and actor; personal values are not recorded', async () => {
    const orderId = await startedOrder(tokenFor);
    const byOrder = await api(tokenFor, ADMIN, 'get', `/audit?orderId=${orderId}`);
    expect(byOrder.status).toBe(200);
    expect(byOrder.body.data.items.length).toBeGreaterThan(0);
    expect(byOrder.body.data.items.every((e: { orderId: string }) => e.orderId === orderId)).toBe(true);

    const byActor = await api(tokenFor, ADMIN, 'get', `/audit?actorId=${WS}&entityType=Order`);
    expect(byActor.body.data.items.map((e: { action: string }) => e.action)).toContain('ORDER_STARTED');
    expect(byActor.body.data.items.every((e: { entityType: string }) => e.entityType === 'Order')).toBe(true);

    expect((await api(tokenFor, ADMIN, 'get', '/audit?bogus=1')).status).toBe(400);
    expect((await api(tokenFor, INSPECTOR, 'get', '/audit')).status).toBe(403);

    expect((await api(tokenFor, ASHA, 'patch', '/auth/me', { name: 'Asha Renamed', phone: '+919811111111' })).status).toBe(200);
    const profile = await prisma.auditEvent.findMany({ where: { action: 'PROFILE_UPDATED', actorId: ASHA } });
    expect(profile).toHaveLength(1);
    const stored = JSON.stringify(profile);
    expect(stored).not.toContain('Asha Renamed');
    expect(stored).not.toContain('9811111111');
  });
});

describe('notifications', () => {
  it('the actor is never notified, each user gets one notification per event, and others cannot read them', async () => {
    const orderId = await startedOrder(tokenFor);
    await api(tokenFor, WS, 'post', `/orders/${orderId}/start`); // repeat: changed:false, no new event

    const started = await prisma.notification.findMany({ where: { type: 'ORDER_STARTED' } });
    const perUser = new Map<string, number>();
    for (const n of started) perUser.set(n.userId, (perUser.get(n.userId) ?? 0) + 1);
    expect(perUser.get(ASHA)).toBe(1);
    expect(perUser.has(WS)).toBe(false); // the workshop owner started it
    expect([...perUser.values()].every((count) => count === 1)).toBe(true);

    const mine = started.find((n) => n.userId === ASHA)!;
    expect((await api(tokenFor, ASHA, 'post', `/notifications/${mine.id}/read`)).body.data).toEqual({ changed: true });
    expect((await api(tokenFor, ASHA, 'post', `/notifications/${mine.id}/read`)).body.data).toEqual({ changed: false });
    expect((await api(tokenFor, ADMIN, 'post', `/notifications/${mine.id}/read`)).status).toBe(404);

    const workshopList = await api(tokenFor, WS, 'get', '/notifications?limit=100');
    expect(workshopList.body.data.items.every((n: { id: string }) => n.id !== mine.id)).toBe(true);
    const unreadOnly = await api(tokenFor, ASHA, 'get', '/notifications?unread=true&limit=100');
    expect(unreadOnly.body.data.items.every((n: { readAt: string | null }) => n.readAt === null)).toBe(true);
  });
});

describe('admin-generated notifications (M13)', () => {
  it('reassignment notifies the new and the replaced inspector; assignment never notifies the admin, buyer or workshop', async () => {
    const orderId = await startedOrder(tokenFor); // the seed inspector is assigned
    const before = await prisma.notification.count({ where: { userId: { in: [ADMIN, ASHA, WS] }, type: { startsWith: 'INSPECTOR_' } } });
    const next = await createUserDirect('INSPECTOR');
    expect((await assignInspector(tokenFor, orderId, next.user.id)).status).toBe(201);

    const forNew = await prisma.notification.findMany({ where: { userId: next.user.id, type: 'INSPECTOR_REASSIGNED' } });
    expect(forNew.map((n) => n.title)).toEqual(['New inspection assignment']);
    const forOld = await prisma.notification.findMany({ where: { userId: INSPECTOR, type: 'INSPECTOR_REASSIGNED' } });
    expect(forOld.map((n) => n.title)).toEqual(['Inspection assignment ended']);
    expect(await prisma.notification.count({ where: { userId: { in: [ADMIN, ASHA, WS] }, type: { startsWith: 'INSPECTOR_' } } })).toBe(before);

    // Repeating the same assignment (changed:false) notifies nobody again.
    expect((await assignInspector(tokenFor, orderId, next.user.id)).status).toBe(200);
    expect(await prisma.notification.count({ where: { type: 'INSPECTOR_REASSIGNED' } })).toBe(2);
  });
});
