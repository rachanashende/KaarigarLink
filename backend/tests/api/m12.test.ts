import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import { ADMIN, ASHA, BRACKETS, INSPECTOR, PRECISION, VIKRAM, api, auth, owner, startedOrder, type TokenFor } from '../helpers/orderFlow';

/** M12: documents, audit history, notifications, password change. */
let tokenFor: TokenFor;
const WS = owner(PRECISION);
const PDF = Buffer.from('%PDF-1.4\n% test\n');

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function upload(as: string, path: string, name: string, type: string, body: Buffer) {
  return request(app).post('/api' + path).set(auth(await tokenFor(as))).set('Content-Type', type).set('X-File-Name', encodeURIComponent(name)).send(body);
}

describe('documents', () => {
  it('the buyer uploads a design file; invited workshops download it; others get 404', async () => {
    const res = await upload(ASHA, `/jobs/${BRACKETS}/documents`, '../../etc/drawing.pdf', 'application/pdf', PDF);
    expect(res.status).toBe(201);
    expect(res.body.data.document).toMatchObject({ kind: 'DESIGN_FILE', originalName: 'drawing.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length });
    expect(res.body.data.document.storageKey).toBeUndefined();
    const id = res.body.data.document.id;

    expect((await api(tokenFor, WS, 'get', `/jobs/${BRACKETS}/documents`)).status).toBe(404); // not invited yet
    await api(tokenFor, ASHA, 'post', `/jobs/${BRACKETS}/invitations`, { workshopId: PRECISION });
    expect((await api(tokenFor, WS, 'get', `/jobs/${BRACKETS}/documents`)).body.data.documents).toHaveLength(1);
    const download = await request(app).get(`/api/documents/${id}/download`).set(auth(await tokenFor(WS)));
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect((await request(app).get(`/api/documents/${id}/download`).set(auth(await tokenFor(VIKRAM)))).status).toBe(404);
    expect((await api(tokenFor, WS, 'delete', `/documents/${id}`)).status).toBe(403);
    expect((await api(tokenFor, ASHA, 'delete', `/documents/${id}`)).body.data).toEqual({ deleted: true });
  });

  it('rejects wrong extensions, mismatched MIME types, spoofed contents and empty files', async () => {
    expect((await upload(ASHA, `/jobs/${BRACKETS}/documents`, 'run.exe', 'application/octet-stream', PDF)).status).toBe(400);
    expect((await upload(ASHA, `/jobs/${BRACKETS}/documents`, 'drawing.pdf', 'image/png', PDF)).status).toBe(400);
    expect((await upload(ASHA, `/jobs/${BRACKETS}/documents`, 'drawing.pdf', 'application/pdf', Buffer.from('not a pdf'))).status).toBe(400);
    expect((await upload(ASHA, `/jobs/${BRACKETS}/documents`, 'drawing.pdf', 'application/pdf', Buffer.alloc(0))).status).toBe(400);
    expect((await upload(VIKRAM, `/jobs/${BRACKETS}/documents`, 'drawing.pdf', 'application/pdf', PDF)).status).toBe(404);
    expect(await prisma.document.count()).toBe(0);
  });

  it('only the assigned inspector uploads evidence; it is linked to the submitted inspection', async () => {
    const orderId = await startedOrder(tokenFor);
    expect((await upload(ASHA, `/orders/${orderId}/documents`, 'e.pdf', 'application/pdf', PDF)).status).toBe(403);
    const res = await upload(INSPECTOR, `/orders/${orderId}/documents`, 'edge.pdf', 'application/pdf', PDF);
    expect(res.status).toBe(201);
    const documentId = res.body.data.document.id;
    const inspection = await api(tokenFor, INSPECTOR, 'post', `/orders/${orderId}/inspections`, {
      status: 'FAILED', findings: 'Edge burrs',
      checklist: { items: [{ id: 'finish', label: 'Finish', result: 'FAIL', notes: 'Burrs', evidence: [{ name: 'edge.pdf', mediaType: 'application/pdf', sizeBytes: PDF.length, documentId }] }] },
    });
    expect(inspection.status).toBe(201);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).inspectionId).toBe(inspection.body.data.inspection.id);
    expect((await api(tokenFor, INSPECTOR, 'delete', `/documents/${documentId}`)).status).toBe(409);
    expect((await api(tokenFor, ASHA, 'get', `/orders/${orderId}/documents`)).body.data.documents).toHaveLength(1);
  });
});

describe('audit history and notifications', () => {
  it('business actions are audited once; order history is scoped; audit rows are append-only', async () => {
    const orderId = await startedOrder(tokenFor);
    await api(tokenFor, WS, 'post', `/orders/${orderId}/start`); // repeat: changed:false -> no new event
    const history = await api(tokenFor, ASHA, 'get', `/orders/${orderId}/history`);
    expect(history.status).toBe(200);
    const actions = history.body.data.items.map((item: { action: string }) => item.action);
    expect(actions).toEqual(expect.arrayContaining(['QUOTE_AWARDED', 'INSPECTOR_ASSIGNED', 'ORDER_STARTED']));
    expect(actions.filter((a: string) => a === 'ORDER_STARTED')).toHaveLength(1);
    expect((await api(tokenFor, VIKRAM, 'get', `/orders/${orderId}/history`)).status).toBe(404);
    expect((await api(tokenFor, ASHA, 'get', '/audit')).status).toBe(403);
    expect((await api(tokenFor, ADMIN, 'get', '/audit?action=ORDER_STARTED')).body.data.items).toHaveLength(1);
    await expect(prisma.auditEvent.deleteMany()).rejects.toThrow(/append-only/);
  });

  it('notifies only the relevant users; unread count and mark-as-read are per user', async () => {
    const orderId = await startedOrder(tokenFor);
    const buyer = await api(tokenFor, ASHA, 'get', '/notifications');
    expect(buyer.body.data.items.some((n: { type: string }) => n.type === 'ORDER_STARTED')).toBe(true);
    const inspector = await api(tokenFor, INSPECTOR, 'get', '/notifications/unread-count');
    expect(inspector.body.data.unread).toBeGreaterThan(0);
    const mine = buyer.body.data.items[0];
    expect((await api(tokenFor, VIKRAM, 'post', `/notifications/${mine.id}/read`)).status).toBe(404);
    expect((await api(tokenFor, ASHA, 'post', `/notifications/${mine.id}/read`)).body.data).toEqual({ changed: true });
    expect((await api(tokenFor, ASHA, 'post', '/notifications/read-all')).status).toBe(200);
    expect((await api(tokenFor, ASHA, 'get', '/notifications/unread-count')).body.data.unread).toBe(0);
    expect(orderId).toBeTruthy();
  });
});

describe('password change', () => {
  it('requires the current password; old tokens stop working; the new token works', async () => {
    const oldToken = await tokenFor(ASHA);
    expect((await api(tokenFor, ASHA, 'patch', '/auth/me/password', { currentPassword: 'wrong', newPassword: 'NewPassw0rd!' })).status).toBe(400);
    await new Promise((resolve) => setTimeout(resolve, 1100)); // tokens have second precision
    const res = await api(tokenFor, ASHA, 'patch', '/auth/me/password', { currentPassword: 'SeedTest-Passw0rd', newPassword: 'NewPassw0rd!' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(oldToken))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(res.body.data.token))).status).toBe(200);
    expect(JSON.stringify(await prisma.auditEvent.findMany({ where: { action: 'PASSWORD_CHANGED' } }))).not.toContain('NewPassw0rd');
  });
});
