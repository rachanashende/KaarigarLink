import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma, resetDatabase } from '../helpers/db';
import { createUserDirect, registerUser } from '../helpers/auth';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let owner: { token: string; workshopId: string };
let otherWorkshop: { token: string; workshopId: string };
let buyerToken: string;
let adminToken: string;

beforeAll(async () => {
  await resetDatabase();
  const o = await registerUser('WORKSHOP', {
    workshop: { businessName: 'Precision Works', city: 'Pune', latitude: 18.52, longitude: 73.85 },
  });
  owner = { token: o.token, workshopId: o.user.workshop.id };
  const other = await registerUser('WORKSHOP');
  otherWorkshop = { token: other.token, workshopId: other.user.workshop.id };
  buyerToken = (await registerUser('BUYER')).token;
  adminToken = (await createUserDirect('ADMIN')).token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Workshop profile', () => {
  it('POST /api/workshops creates a profile for a WORKSHOP user without one', async () => {
    const { token } = await createUserDirect('WORKSHOP');
    const res = await request(app)
      .post('/api/workshops')
      .set(auth(token))
      .send({ businessName: 'Late Starter Fab', certifications: ['iso 9001'] });
    expect(res.status).toBe(201);
    expect(res.body.data.workshop).toMatchObject({
      businessName: 'Late Starter Fab',
      certifications: ['ISO_9001'],
      verificationStatus: 'PENDING',
      rating: 0,
    });
  });

  it('POST /api/workshops returns 409 when a profile already exists', async () => {
    const res = await request(app).post('/api/workshops').set(auth(owner.token)).send({ businessName: 'Again' });
    expect(res.status).toBe(409);
  });

  it('POST /api/workshops is forbidden for buyers', async () => {
    const res = await request(app).post('/api/workshops').set(auth(buyerToken)).send({ businessName: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('GET /api/workshops/me returns the full profile', async () => {
    const res = await request(app).get('/api/workshops/me').set(auth(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.data.workshop).toMatchObject({ id: owner.workshopId, machines: [], capabilities: [], capacities: [] });
  });

  it('PUT /api/workshops/:id lets the owner update details', async () => {
    const res = await request(app)
      .put(`/api/workshops/${owner.workshopId}`)
      .set(auth(owner.token))
      .send({ description: '5-axis CNC specialists', city: 'Pimpri' });
    expect(res.status).toBe(200);
    expect(res.body.data.workshop).toMatchObject({ description: '5-axis CNC specialists', city: 'Pimpri' });
  });

  it('PUT /api/workshops/:id is forbidden for another workshop', async () => {
    const res = await request(app)
      .put(`/api/workshops/${owner.workshopId}`)
      .set(auth(otherWorkshop.token))
      .send({ businessName: 'Hijacked' });
    expect(res.status).toBe(403);
  });

  it('PUT /api/workshops/:id is forbidden for buyers', async () => {
    const res = await request(app)
      .put(`/api/workshops/${owner.workshopId}`)
      .set(auth(buyerToken))
      .send({ businessName: 'Hijacked' });
    expect(res.status).toBe(403);
  });

  it('owner cannot change verificationStatus, admin can', async () => {
    const asOwner = await request(app)
      .put(`/api/workshops/${owner.workshopId}`)
      .set(auth(owner.token))
      .send({ verificationStatus: 'VERIFIED' });
    expect(asOwner.status).toBe(403);

    const asAdmin = await request(app)
      .put(`/api/workshops/${owner.workshopId}`)
      .set(auth(adminToken))
      .send({ verificationStatus: 'VERIFIED' });
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data.workshop.verificationStatus).toBe('VERIFIED');
  });

  it('GET /api/workshops/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/workshops/does-not-exist').set(auth(buyerToken));
    expect(res.status).toBe(404);
  });
});

describe('Machines', () => {
  let machineId: string;

  it('registers a machine', async () => {
    const res = await request(app)
      .post(`/api/workshops/${owner.workshopId}/machines`)
      .set(auth(owner.token))
      .send({ machineName: 'Haas VF-2', machineType: 'CNC_MILL', quantity: 2, specifications: { axes: 3 } });
    expect(res.status).toBe(201);
    expect(res.body.data.machine).toMatchObject({
      workshopId: owner.workshopId,
      machineType: 'CNC_MILL',
      quantity: 2,
      operationalStatus: 'OPERATIONAL',
      specifications: { axes: 3 },
    });
    machineId = res.body.data.machine.id;
  });

  it('rejects an invalid machine type with 400', async () => {
    const res = await request(app)
      .post(`/api/workshops/${owner.workshopId}/machines`)
      .set(auth(owner.token))
      .send({ machineName: 'Mystery', machineType: 'TELEPORTER' });
    expect(res.status).toBe(400);
  });

  it('updates machine status', async () => {
    const res = await request(app)
      .put(`/api/workshops/${owner.workshopId}/machines/${machineId}`)
      .set(auth(owner.token))
      .send({ operationalStatus: 'MAINTENANCE' });
    expect(res.status).toBe(200);
    expect(res.body.data.machine.operationalStatus).toBe('MAINTENANCE');
  });

  it("forbids another workshop from adding machines to someone else's workshop", async () => {
    const res = await request(app)
      .post(`/api/workshops/${owner.workshopId}/machines`)
      .set(auth(otherWorkshop.token))
      .send({ machineName: 'Sneaky', machineType: 'CNC_LATHE' });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the machine belongs to a different workshop", async () => {
    const res = await request(app)
      .put(`/api/workshops/${otherWorkshop.workshopId}/machines/${machineId}`)
      .set(auth(otherWorkshop.token))
      .send({ quantity: 5 });
    expect(res.status).toBe(404);
  });

  it('lists machines', async () => {
    const res = await request(app).get(`/api/workshops/${owner.workshopId}/machines`).set(auth(buyerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.machines).toHaveLength(1);
  });
});

describe('Capabilities', () => {
  let capabilityId: string;

  it('adds a capability with normalised materials', async () => {
    const res = await request(app)
      .post(`/api/workshops/${owner.workshopId}/capabilities`)
      .set(auth(owner.token))
      .send({
        manufacturingProcess: 'CNC_MACHINING',
        supportedMaterials: ['Aluminum', 'Mild Steel', 'aluminium'],
        specifications: { minToleranceMm: 0.01, maxPartSizeMm: 600 },
        leadTimeDays: 3,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.capability.supportedMaterials).toEqual(['aluminium', 'mild steel']);
    capabilityId = res.body.data.capability.id;
  });

  it('rejects a duplicate process with 409', async () => {
    const res = await request(app)
      .post(`/api/workshops/${owner.workshopId}/capabilities`)
      .set(auth(owner.token))
      .send({ manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['brass'] });
    expect(res.status).toBe(409);
  });

  it('updates supported materials', async () => {
    const res = await request(app)
      .put(`/api/workshops/${owner.workshopId}/capabilities/${capabilityId}`)
      .set(auth(owner.token))
      .send({ supportedMaterials: ['aluminium', 'brass'] });
    expect(res.status).toBe(200);
    expect(res.body.data.capability.supportedMaterials).toEqual(['aluminium', 'brass']);
  });
});

describe('Capacity', () => {
  let capacityId: string;

  it('adds a capacity window', async () => {
    const res = await request(app)
      .post(`/api/workshops/${owner.workshopId}/capacity`)
      .set(auth(owner.token))
      .send({ availableCapacity: 1000, startDate: '2099-01-01', endDate: '2099-01-31' });
    expect(res.status).toBe(201);
    expect(res.body.data.capacity).toMatchObject({ availableCapacity: 1000, capacityUnit: 'UNITS' });
    capacityId = res.body.data.capacity.id;
  });

  it('rejects an overlapping window with 409', async () => {
    const res = await request(app)
      .post(`/api/workshops/${owner.workshopId}/capacity`)
      .set(auth(owner.token))
      .send({ availableCapacity: 500, startDate: '2099-01-15', endDate: '2099-02-15' });
    expect(res.status).toBe(409);
  });

  it('allows an adjacent, non-overlapping window', async () => {
    const res = await request(app)
      .post(`/api/workshops/${owner.workshopId}/capacity`)
      .set(auth(owner.token))
      .send({ availableCapacity: 500, startDate: '2099-02-01', endDate: '2099-02-28' });
    expect(res.status).toBe(201);
  });

  it('rejects endDate before startDate with 400', async () => {
    const res = await request(app)
      .post(`/api/workshops/${owner.workshopId}/capacity`)
      .set(auth(owner.token))
      .send({ availableCapacity: 10, startDate: '2099-05-10', endDate: '2099-05-01' });
    expect(res.status).toBe(400);
  });

  it('updates available capacity', async () => {
    const res = await request(app)
      .put(`/api/workshops/${owner.workshopId}/capacity/${capacityId}`)
      .set(auth(owner.token))
      .send({ availableCapacity: 750 });
    expect(res.status).toBe(200);
    expect(res.body.data.capacity.availableCapacity).toBe(750);
  });

  it('rejects an update that would create an overlap', async () => {
    const res = await request(app)
      .put(`/api/workshops/${owner.workshopId}/capacity/${capacityId}`)
      .set(auth(owner.token))
      .send({ endDate: '2099-02-10' });
    expect(res.status).toBe(409);
  });

  it('admin can manage any workshop capacity', async () => {
    const res = await request(app)
      .put(`/api/workshops/${owner.workshopId}/capacity/${capacityId}`)
      .set(auth(adminToken))
      .send({ availableCapacity: 800 });
    expect(res.status).toBe(200);
  });
});

describe('Workshop details & listing', () => {
  it('GET /api/workshops/:id includes machines, capabilities and capacity', async () => {
    const res = await request(app).get(`/api/workshops/${owner.workshopId}`).set(auth(buyerToken));
    expect(res.status).toBe(200);
    const ws = res.body.data.workshop;
    expect(ws.machines).toHaveLength(1);
    expect(ws.capabilities).toHaveLength(1);
    expect(ws.capacities).toHaveLength(2);
    expect(ws.user).toEqual({ id: expect.any(String), name: expect.any(String) });
  });

  it('GET /api/workshops filters by process', async () => {
    const res = await request(app).get('/api/workshops?process=CNC_MACHINING').set(auth(buyerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.items.map((w: { id: string }) => w.id)).toEqual([owner.workshopId]);
    expect(res.body.data.pagination).toMatchObject({ page: 1, total: 1 });
  });

  it('GET /api/workshops rejects an invalid process filter', async () => {
    const res = await request(app).get('/api/workshops?process=MAGIC').set(auth(buyerToken));
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/workshops');
    expect(res.status).toBe(401);
  });
});
