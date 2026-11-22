import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import { createUserDirect } from '../helpers/auth';
import { ADMIN, ASHA, BRACKETS, INSPECTOR, MUMBAI, PRECISION, VIKRAM, api, auth, owner, startedOrder, type TokenFor } from '../helpers/orderFlow';

/**
 * M13 consolidated backend security checks (the browser run could not script API calls).
 * One started order: buyer ASHA, workshop PRECISION, inspector INSPECTOR.
 * Outsiders: buyer VIKRAM, workshop MUMBAI, a second inspector.
 */
let tokenFor: TokenFor;
let orderId: string;
const WS = owner(PRECISION);
const OTHER_WS = owner(MUMBAI);
const PDF = Buffer.from('%PDF-1.4\n% security\n');

beforeEach(async () => {
  tokenFor = await seededSession();
  orderId = await startedOrder(tokenFor);
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** No error response may leak internals. */
function safe(res: request.Response) {
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(500);
  expect(res.body.success).toBe(false);
  expect(res.body.stack).toBeUndefined();
  expect(JSON.stringify(res.body)).not.toMatch(/prisma|at .*\.ts:\d+|SELECT |passwordHash/i);
}

describe('unauthenticated requests are rejected', () => {
  it.each([
    ['get', '/api/auth/me'], ['get', '/api/jobs'], ['post', '/api/jobs'], ['get', '/api/orders/mine'], ['get', '/api/orders/x'],
    ['post', '/api/orders/x/payments'], ['post', '/api/orders/x/inspections'], ['put', '/api/orders/x/inspector'], ['get', '/api/admin/users'],
    ['get', '/api/audit'], ['get', '/api/notifications'], ['get', '/api/documents/x/download'], ['get', '/api/workshops/me'],
    ['post', '/api/invitations/x/respond'], ['patch', '/api/quotes/x'], ['post', '/api/payments/x/refund'], ['get', '/api/inspections/assigned'],
  ] as const)('%s %s -> 401', async (method, url) => {
    const res = await request(app)[method](url);
    expect(res.status).toBe(401);
    safe(res);
  });

  it('a forged or malformed token is rejected', async () => {
    for (const header of ['Bearer not-a-token', 'Bearer ', 'Basic abc', 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJzZWVkLXVzZXItYWRtaW4ifQ.']) {
      const res = await request(app).get('/api/admin/users').set('Authorization', header);
      expect(res.status, header).toBe(401);
      safe(res);
    }
  });
});

describe('role boundaries', () => {
  it('a buyer cannot use any admin endpoint', async () => {
    for (const [method, url, body] of [
      ['get', '/admin/users'], ['get', '/admin/orders'], ['get', '/admin/quotes'], ['get', '/admin/invitations'], ['get', '/admin/workshops'],
      ['get', '/audit'], ['get', '/inspections'], ['get', '/inspections/inspectors'],
      ['put', `/orders/${orderId}/inspector`, { inspectorId: INSPECTOR }],
    ] as const) {
      const res = await api(tokenFor, ASHA, method, url, body);
      expect(res.status, url).toBe(403);
      safe(res);
    }
    // Verifying a workshop is admin-only too.
    const verify = await api(tokenFor, ASHA, 'put', `/workshops/${PRECISION}`, { verificationStatus: 'VERIFIED' });
    expect([403, 404]).toContain(verify.status);
  });

  it('a workshop cannot create jobs, pay, award or inspect', async () => {
    expect((await api(tokenFor, WS, 'post', '/jobs', { title: 'x' })).status).toBe(403);
    expect((await api(tokenFor, WS, 'post', `/orders/${orderId}/payments`, { amount: '1.00' })).status).toBe(403);
    expect((await api(tokenFor, WS, 'post', `/orders/${orderId}/inspections`, { status: 'PASSED', findings: 'Self-inspection' })).status).toBe(403);
    expect((await api(tokenFor, WS, 'post', `/orders/${orderId}/complete`)).status).toBe(403);
  });
});

describe('another workshop\'s private records', () => {
  it('a different workshop cannot read or change the order, its documents, history or payments', async () => {
    for (const url of [`/orders/${orderId}`, `/orders/${orderId}/documents`, `/orders/${orderId}/history`, `/orders/${orderId}/payments`, `/orders/${orderId}/milestones`]) {
      const res = await api(tokenFor, OTHER_WS, 'get', url);
      expect(res.status, url).toBe(404);
      safe(res);
    }
    expect((await api(tokenFor, OTHER_WS, 'post', `/orders/${orderId}/start`)).status).toBe(404);
    expect((await api(tokenFor, OTHER_WS, 'post', `/orders/${orderId}/milestones`, { title: 'Hijack', sequence: 9 })).status).toBe(404);
  });

  it('a different workshop cannot edit the workshop profile or respond to its invitations', async () => {
    expect((await api(tokenFor, OTHER_WS, 'put', `/workshops/${PRECISION}`, { businessName: 'Hijacked' })).status).toBeGreaterThanOrEqual(403);
    expect((await api(tokenFor, OTHER_WS, 'post', `/workshops/${PRECISION}/machines`, { machineName: 'x', machineType: 'CNC_MILL', quantity: 1, operationalStatus: 'OPERATIONAL' })).status).toBeGreaterThanOrEqual(403);
    const inv = await prisma.jobInvitation.findFirstOrThrow({ where: { workshopId: PRECISION } });
    expect((await api(tokenFor, OTHER_WS, 'post', `/invitations/${inv.id}/respond`, { response: 'DECLINED' })).status).toBe(404);
    const quote = await prisma.quote.findFirstOrThrow({ where: { workshopId: PRECISION } });
    expect((await api(tokenFor, OTHER_WS, 'patch', `/quotes/${quote.id}`, { totalPrice: '1.00' })).status).toBe(404);
    expect((await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } })).businessName).not.toBe('Hijacked');
  });
});

describe('inspectors see only their current assignments', () => {
  it('an unassigned inspector gets 404 for the order, its draft, documents, history and inspections', async () => {
    const other = await createUserDirect('INSPECTOR');
    const as = (method: 'get' | 'post' | 'put', url: string, body?: object) => {
      const req = request(app)[method]('/api' + url).set(auth(other.token));
      return body ? req.send(body) : req;
    };
    for (const url of [`/orders/${orderId}`, `/orders/${orderId}/inspection-draft`, `/orders/${orderId}/documents`, `/orders/${orderId}/history`]) {
      const res = await as('get', url);
      expect(res.status, url).toBe(404);
      safe(res);
    }
    expect((await as('post', `/orders/${orderId}/inspections`, { status: 'PASSED', findings: 'Not mine' })).status).toBe(404);
    expect((await as('put', `/orders/${orderId}/inspection-draft`, { checklist: { items: [] } })).status).toBeGreaterThanOrEqual(400);
    const upload = await request(app).post(`/api/orders/${orderId}/documents`).set(auth(other.token)).set('Content-Type', 'application/pdf').set('X-File-Name', 'x.pdf').send(PDF);
    expect(upload.status).toBe(404);
    expect((await as('get', '/inspections/assigned')).body.data.items ?? (await as('get', '/inspections/assigned')).body.data.orders).toHaveLength(0);
  });
});

describe('cross-user access by buyers', () => {
  it('another buyer cannot read the order, payments, history, documents or notifications', async () => {
    for (const url of [`/orders/${orderId}`, `/orders/${orderId}/payments`, `/orders/${orderId}/history`, `/orders/${orderId}/documents`, `/jobs/${BRACKETS}/documents`]) {
      const res = await api(tokenFor, VIKRAM, 'get', url);
      expect(res.status, url).toBe(404);
      safe(res);
    }
    expect((await api(tokenFor, VIKRAM, 'post', `/orders/${orderId}/payments`, { amount: '1.00' })).status).toBe(404);
    expect((await api(tokenFor, VIKRAM, 'post', `/orders/${orderId}/cancel`, { reason: 'Not mine' })).status).toBe(404);
    const theirs = await prisma.notification.findFirstOrThrow({ where: { userId: ASHA } });
    expect((await api(tokenFor, VIKRAM, 'post', `/notifications/${theirs.id}/read`)).status).toBe(404);
    expect((await api(tokenFor, ADMIN, 'post', `/notifications/${theirs.id}/read`)).status).toBe(404);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
  });

  it('documents of one order are not downloadable by outsiders, by ID or by guessing', async () => {
    const up = await request(app).post(`/api/orders/${orderId}/documents`).set(auth(await tokenFor(INSPECTOR))).set('Content-Type', 'application/pdf').set('X-File-Name', 'e.pdf').send(PDF);
    expect(up.status).toBe(201);
    const id = up.body.data.document.id;
    for (const who of [VIKRAM, OTHER_WS]) {
      const res = await request(app).get(`/api/documents/${id}/download`).set(auth(await tokenFor(who)));
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).not.toMatch(/pdf/);
    }
    expect((await request(app).get('/api/documents/does-not-exist/download').set(auth(await tokenFor(ASHA)))).status).toBe(404);
  });
});

describe('invalid IDs and malformed payloads fail safely', () => {
  it('unknown and odd IDs are 404, never 500', async () => {
    for (const id of ['does-not-exist', '%00', '..%2F..%2Fetc', "' OR 1=1 --", 'x'.repeat(300)]) {
      const res = await api(tokenFor, ASHA, 'get', '/orders/' + id);
      expect([400, 404], id).toContain(res.status);
      safe(res);
    }
  });

  it('malformed JSON, wrong types, unknown fields and oversized bodies are rejected cleanly', async () => {
    const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('Malformed JSON in request body');
    safe(bad);
    for (const body of [{ amount: -5 }, { amount: 'abc' }, { amount: '1.00', status: 'SUCCEEDED' }, {}, { amount: '0' }]) {
      const res = await api(tokenFor, ASHA, 'post', `/orders/${orderId}/payments`, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      safe(res);
    }
    const huge = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(2 * 1024 * 1024) }));
    expect(huge.status).toBe(413);
    safe(huge);
  });
});

describe('regressions from the browser report', () => {
  it('BUG-08: workshop invitations include the job creation date', async () => {
    const res = await api(tokenFor, WS, 'get', '/workshops/invitations');
    expect(res.status).toBe(200);
    const items = res.body.data.items as { job: { createdAt?: string } }[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(new Date(item.job.createdAt!).toString()).not.toBe('Invalid Date');
  });

  it('BUG-04: a grade of a supported material is matched; a different material is not', async () => {
    const job = await api(tokenFor, ASHA, 'post', '/jobs', {
      title: 'Grade matching', material: 'Aluminium 6061', manufacturingProcess: 'CNC_MACHINING', quantity: 10,
      deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    expect(job.status).toBe(201);
    const matches = await api(tokenFor, ASHA, 'get', `/jobs/${job.body.data.job.id}/matches`);
    const precision = matches.body.data.results.find((r: { workshopId: string }) => r.workshopId === PRECISION);
    expect(precision.eligibility.eligible).toBe(true);
    expect(precision.explanations).toContain('Supports aluminium for CNC_MACHINING (aluminium 6061 is a grade or form of aluminium)');
    expect(precision.explanations).toContain('Distance not scored: the job has no map coordinates (a delivery city and state are not converted to coordinates)');

    const steel = await api(tokenFor, ASHA, 'post', '/jobs', {
      title: 'Different material', material: 'titanium grade 5', manufacturingProcess: 'CNC_MACHINING', quantity: 10,
      deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    const none = await api(tokenFor, ASHA, 'get', `/jobs/${steel.body.data.job.id}/matches`);
    expect(none.body.data.results.find((r: { workshopId: string }) => r.workshopId === PRECISION).eligibility.eligible).toBe(false);
  });
});

describe('NUL bytes (regression: used to be a 500 from PostgreSQL)', () => {
  it('in a path ID, a query or a JSON body -> 400, nothing written', async () => {
    const before = await prisma.job.count();
    const cases = [
      await api(tokenFor, ASHA, 'get', '/orders/%00'),
      await api(tokenFor, ASHA, 'get', '/orders/abc%00def/documents'),
      await api(tokenFor, ADMIN, 'get', '/audit?action=X%00'),
      await api(tokenFor, ASHA, 'post', '/jobs', { title: 'Bad\u0000title', material: 'aluminium', manufacturingProcess: 'CNC_MACHINING', quantity: 1, deadline: new Date(Date.now() + 30 * 86_400_000).toISOString() }),
      await request(app).post('/api/auth/login').send({ email: 'a\u0000@b.c', password: 'x' }),
    ];
    for (const res of cases) {
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Request contains an invalid character');
      safe(res);
    }
    expect(await prisma.job.count()).toBe(before);
  });
});
