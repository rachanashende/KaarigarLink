import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma, resetDatabase } from '../helpers/db';
import { createUserDirect, registerUser } from '../helpers/auth';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

const jobBody = (overrides: Record<string, unknown> = {}) => ({
  title: '500 aluminium brackets',
  description: 'Bracket per drawing BRK-101',
  material: 'Aluminium',
  manufacturingProcess: 'CNC_MACHINING',
  quantity: 500,
  deadline: daysAhead(30),
  address: 'Hinjewadi, Pune',
  latitude: 18.59,
  longitude: 73.74,
  technicalSpecifications: { drawing: 'BRK-101 rev C', finish: 'anodised' },
  requirements: [
    { requirementType: 'MACHINE_TYPE', requirementValue: 'CNC_MILL' },
    { requirementType: 'TOLERANCE_MM', requirementValue: '0.05' },
    { requirementType: 'CERTIFICATION', requirementValue: 'iso 9001', isMandatory: false },
  ],
  ...overrides,
});

let buyerA: { token: string; id: string };
let buyerB: { token: string; id: string };
let workshop: { token: string; workshopId: string };
let otherWorkshop: { token: string };
let inspectorToken: string;
let adminToken: string;

async function createJob(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/jobs').set(auth(token)).send(jobBody(overrides));
  if (res.status !== 201) throw new Error(`createJob failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.job as { id: string; updatedAt: string; [k: string]: unknown };
}

beforeAll(async () => {
  await resetDatabase();
  const a = await registerUser('BUYER');
  buyerA = { token: a.token, id: a.user.id };
  const b = await registerUser('BUYER');
  buyerB = { token: b.token, id: b.user.id };
  const w = await registerUser('WORKSHOP');
  workshop = { token: w.token, workshopId: w.user.workshop.id };
  otherWorkshop = { token: (await registerUser('WORKSHOP')).token };
  inspectorToken = (await registerUser('INSPECTOR')).token;
  adminToken = (await createUserDirect('ADMIN')).token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/jobs', () => {
  it('creates a job for the authenticated buyer with its requirements', async () => {
    const res = await request(app).post('/api/jobs').set(auth(buyerA.token)).send(jobBody());
    expect(res.status).toBe(201);
    const job = res.body.data.job;
    expect(job).toMatchObject({
      buyerId: buyerA.id,
      material: 'aluminium',
      manufacturingProcess: 'CNC_MACHINING',
      quantity: 500,
      quantityUnit: 'UNITS',
      status: 'OPEN',
      matchedAt: null,
      latitude: 18.59,
      technicalSpecifications: { drawing: 'BRK-101 rev C', finish: 'anodised' },
      buyer: { id: buyerA.id, name: expect.any(String) },
      _count: { invitations: 0 },
    });
    expect(job.buyer.email).toBeUndefined();
    expect(job.requirements).toHaveLength(3);
    expect(job.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requirementType: 'CERTIFICATION', requirementValue: 'ISO_9001', isMandatory: false }),
      ]),
    );

    // Related-record consistency: rows really exist and belong to the job.
    const rows = await prisma.jobRequirement.findMany({ where: { jobId: job.id } });
    expect(rows).toHaveLength(3);
  });

  it('can create a DRAFT job', async () => {
    const res = await request(app).post('/api/jobs').set(auth(buyerA.token)).send(jobBody({ status: 'DRAFT' }));
    expect(res.status).toBe(201);
    expect(res.body.data.job.status).toBe('DRAFT');
  });

  it('ignores no ownership tricks: buyerId in body is rejected', async () => {
    const res = await request(app).post('/api/jobs').set(auth(buyerA.token)).send(jobBody({ buyerId: buyerB.id }));
    expect(res.status).toBe(400);
  });

  it('returns 400 with field errors for invalid data', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set(auth(buyerA.token))
      .send({ title: 'x', quantity: 0, manufacturingProcess: 'ALCHEMY', deadline: '2020-01-01' });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['title', 'quantity', 'manufacturingProcess', 'deadline', 'material']));
  });

  it('validates quantity and deadline', async () => {
    for (const bad of [{ quantity: -1 }, { quantity: 1.5 }, { deadline: daysAhead(0.01) }, { deadline: daysAhead(900) }]) {
      const res = await request(app).post('/api/jobs').set(auth(buyerA.token)).send(jobBody(bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('rejects invalid requirements and stores nothing', async () => {
    const before = await prisma.job.count();
    const res = await request(app)
      .post('/api/jobs')
      .set(auth(buyerA.token))
      .send(jobBody({ requirements: [{ requirementType: 'MACHINE_TYPE', requirementValue: 'WARP_DRIVE' }] }));
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('requirements.0.requirementValue');
    expect(await prisma.job.count()).toBe(before);
  });

  it('rejects the unsupported budget field', async () => {
    const res = await request(app).post('/api/jobs').set(auth(buyerA.token)).send(jobBody({ budget: 100000 }));
    expect(res.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/jobs').send(jobBody());
    expect(res.status).toBe(401);
  });

  it.each(['WORKSHOP', 'INSPECTOR', 'ADMIN'])('returns 403 for %s', async (role) => {
    const token = role === 'WORKSHOP' ? workshop.token : role === 'INSPECTOR' ? inspectorToken : adminToken;
    const res = await request(app).post('/api/jobs').set(auth(token)).send(jobBody());
    expect(res.status).toBe(403);
  });
});

describe('GET /api/jobs', () => {
  it("lists only the buyer's own jobs", async () => {
    await createJob(buyerB.token, { title: 'Buyer B secret job' });
    const res = await request(app).get('/api/jobs').set(auth(buyerA.token));
    expect(res.status).toBe(200);
    const items = res.body.data.items as { buyerId: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((j) => j.buyerId === buyerA.id)).toBe(true);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/jobs?status=DRAFT').set(auth(buyerA.token));
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((j: { status: string }) => j.status === 'DRAFT')).toBe(true);
  });

  it('lets an admin list all jobs', async () => {
    const res = await request(app).get('/api/jobs').set(auth(adminToken));
    expect(res.status).toBe(200);
    const buyers = new Set(res.body.data.items.map((j: { buyerId: string }) => j.buyerId));
    expect(buyers.has(buyerA.id) && buyers.has(buyerB.id)).toBe(true);
  });

  it('returns 403 for workshops and 401 without a token', async () => {
    expect((await request(app).get('/api/jobs').set(auth(workshop.token))).status).toBe(403);
    expect((await request(app).get('/api/jobs')).status).toBe(401);
  });

  it('rejects an invalid status filter', async () => {
    expect((await request(app).get('/api/jobs?status=FLYING').set(auth(buyerA.token))).status).toBe(400);
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns the job to its owner', async () => {
    const job = await createJob(buyerA.token);
    const res = await request(app).get(`/api/jobs/${job.id}`).set(auth(buyerA.token));
    expect(res.status).toBe(200);
    expect(res.body.data.job).toMatchObject({ id: job.id, buyerId: buyerA.id });
    expect(res.body.data.job.requirements).toHaveLength(3);
  });

  it("returns 404 (not 403) for another buyer's job so its existence is not revealed", async () => {
    const job = await createJob(buyerA.token);
    const res = await request(app).get(`/api/jobs/${job.id}`).set(auth(buyerB.token));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Job not found');
  });

  it('returns 404 for a non-invited workshop and for inspectors; admin can view', async () => {
    const job = await createJob(buyerA.token);
    expect((await request(app).get(`/api/jobs/${job.id}`).set(auth(otherWorkshop.token))).status).toBe(404);
    expect((await request(app).get(`/api/jobs/${job.id}`).set(auth(inspectorToken))).status).toBe(404);
    expect((await request(app).get(`/api/jobs/${job.id}`).set(auth(adminToken))).status).toBe(200);
  });

  it('lets an invited workshop view the job, without revealing how many workshops were invited', async () => {
    const job = await createJob(buyerA.token);
    const competitor = await registerUser('WORKSHOP');
    for (const workshopId of [workshop.workshopId, competitor.user.workshop.id]) {
      await prisma.jobInvitation.create({
        data: { jobId: job.id, workshopId, matchScore: 80, scoreBreakdown: {}, matchReasons: [], rank: 1 },
      });
    }
    const res = await request(app).get(`/api/jobs/${job.id}`).set(auth(workshop.token));
    expect(res.status).toBe(200);
    // Competitor count is hidden from workshops; every other job field is still there.
    expect(res.body.data.job).not.toHaveProperty('_count');
    expect(JSON.stringify(res.body)).not.toMatch(/_count|invitations/);
    expect(res.body.data.job).toMatchObject({ id: job.id, buyerId: buyerA.id, title: expect.any(String), buyer: { id: buyerA.id } });
    expect(res.body.data.job.requirements).toHaveLength(3);

    // The owning buyer (and admins) still get the count.
    const asBuyer = await request(app).get(`/api/jobs/${job.id}`).set(auth(buyerA.token));
    expect(asBuyer.body.data.job._count.invitations).toBe(2);
    const asAdmin = await request(app).get(`/api/jobs/${job.id}`).set(auth(adminToken));
    expect(asAdmin.body.data.job._count.invitations).toBe(2);
  });

  it('returns 404 for an unknown id', async () => {
    expect((await request(app).get('/api/jobs/not-a-real-id').set(auth(buyerA.token))).status).toBe(404);
  });
});

describe('PUT /api/jobs/:id', () => {
  it('updates an owned job', async () => {
    const job = await createJob(buyerA.token);
    const res = await request(app)
      .put(`/api/jobs/${job.id}`)
      .set(auth(buyerA.token))
      .send({ quantity: 750, material: 'Mild Steel', description: null });
    expect(res.status).toBe(200);
    expect(res.body.data.job).toMatchObject({ quantity: 750, material: 'mild steel', description: null, buyerId: buyerA.id });
    // Requirements untouched when not sent.
    expect(res.body.data.job.requirements).toHaveLength(3);
  });

  it("returns 404 when updating another buyer's job and changes nothing", async () => {
    const job = await createJob(buyerA.token);
    const res = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerB.token)).send({ quantity: 1 });
    expect(res.status).toBe(404);
    const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.quantity).toBe(500);
  });

  it('returns 403 for non-buyers and 401 without a token', async () => {
    const job = await createJob(buyerA.token);
    expect((await request(app).put(`/api/jobs/${job.id}`).set(auth(adminToken)).send({ quantity: 1 })).status).toBe(403);
    expect((await request(app).put(`/api/jobs/${job.id}`).set(auth(workshop.token)).send({ quantity: 1 })).status).toBe(403);
    expect((await request(app).put(`/api/jobs/${job.id}`).send({ quantity: 1 })).status).toBe(401);
  });

  it('rejects ownership/system fields', async () => {
    const job = await createJob(buyerA.token);
    for (const body of [{ buyerId: buyerB.id }, { matchedAt: new Date().toISOString() }, { status: 'MATCHED' }]) {
      const res = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ buyerId: buyerA.id, status: 'OPEN', matchedAt: null });
  });

  it('replaces requirements consistently (old rows removed, new rows stored)', async () => {
    const job = await createJob(buyerA.token);
    const res = await request(app)
      .put(`/api/jobs/${job.id}`)
      .set(auth(buyerA.token))
      .send({ requirements: [{ requirementType: 'PART_SIZE_MM', requirementValue: 300 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.job.requirements).toEqual([
      expect.objectContaining({ requirementType: 'PART_SIZE_MM', requirementValue: '300', isMandatory: true }),
    ]);
    const rows = await prisma.jobRequirement.findMany({ where: { jobId: job.id } });
    expect(rows.map((r) => r.requirementType)).toEqual(['PART_SIZE_MM']);
    expect(new Date(res.body.data.job.updatedAt).getTime()).toBeGreaterThan(new Date(job.updatedAt).getTime());
  });

  it('clears requirements with an empty array', async () => {
    const job = await createJob(buyerA.token);
    const res = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ requirements: [] });
    expect(res.status).toBe(200);
    expect(await prisma.jobRequirement.count({ where: { jobId: job.id } })).toBe(0);
  });

  it('an invalid requirement in an update changes nothing (fields or requirements)', async () => {
    const job = await createJob(buyerA.token);
    const res = await request(app)
      .put(`/api/jobs/${job.id}`)
      .set(auth(buyerA.token))
      .send({ quantity: 999, requirements: [{ requirementType: 'TOLERANCE_MM', requirementValue: '-3' }] });
    expect(res.status).toBe(400);
    const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id }, include: { requirements: true } });
    expect(row.quantity).toBe(500);
    expect(row.requirements).toHaveLength(3);
  });

  it('validates deadline and quantity on update', async () => {
    const job = await createJob(buyerA.token);
    for (const bad of [{ quantity: 0 }, { deadline: '2020-01-01' }, { deadline: 'soon' }]) {
      const res = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('rejects clearing only one coordinate', async () => {
    const job = await createJob(buyerA.token);
    const res = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ latitude: null });
    expect(res.status).toBe(400);
  });
});

describe('Job status rules', () => {
  it('allows DRAFT -> OPEN -> DRAFT', async () => {
    const job = await createJob(buyerA.token, { status: 'DRAFT' });
    const open = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ status: 'OPEN' });
    expect(open.body.data.job.status).toBe('OPEN');
    const draft = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ status: 'DRAFT' });
    expect(draft.body.data.job.status).toBe('DRAFT');
  });

  it('blocks detail edits once MATCHED but allows cancelling, which expires invitations', async () => {
    const job = await createJob(buyerA.token);
    await prisma.job.update({ where: { id: job.id }, data: { status: 'MATCHED', matchedAt: new Date() } });
    await prisma.jobInvitation.create({
      data: { jobId: job.id, workshopId: workshop.workshopId, matchScore: 70, scoreBreakdown: {}, matchReasons: [], rank: 1 },
    });

    const edit = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ quantity: 10 });
    expect(edit.status).toBe(409);
    expect(edit.body.message).toBe('Job details cannot be edited while status is MATCHED');

    const cancel = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ status: 'CANCELLED' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.job.status).toBe('CANCELLED');
    const inv = await prisma.jobInvitation.findFirstOrThrow({ where: { jobId: job.id } });
    expect(inv.status).toBe('EXPIRED');
  });

  it('cancelling expires INVITED/ACCEPTED invitations, leaves DECLINED, and re-sending CANCELLED is a no-op', async () => {
    const job = await createJob(buyerA.token);
    const statuses = ['INVITED', 'ACCEPTED', 'DECLINED'] as const;
    const invitationIds: string[] = [];
    for (const [i, status] of statuses.entries()) {
      const ws = await registerUser('WORKSHOP');
      const inv = await prisma.jobInvitation.create({
        data: { jobId: job.id, workshopId: ws.user.workshop.id, matchScore: 60, scoreBreakdown: {}, matchReasons: [], rank: i + 1, status },
      });
      invitationIds.push(inv.id);
    }

    const cancel = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ status: 'CANCELLED' });
    expect(cancel.status).toBe(200);
    const after = await prisma.jobInvitation.findMany({ where: { id: { in: invitationIds } } });
    const byId = new Map(after.map((inv) => [inv.id, inv.status]));
    expect(invitationIds.map((id) => byId.get(id))).toEqual(['EXPIRED', 'EXPIRED', 'DECLINED']);

    const again = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ status: 'CANCELLED' });
    expect(again.status).toBe(200);
    expect(again.body.data.job.status).toBe('CANCELLED');
  });

  it('does not allow re-opening a CANCELLED job', async () => {
    const job = await createJob(buyerA.token);
    await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ status: 'CANCELLED' });
    const res = await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ status: 'OPEN' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Cannot change job status from CANCELLED to OPEN');
  });

  it('does not allow buyer changes once AWARDED (Member 2 owns that lifecycle)', async () => {
    const job = await createJob(buyerA.token);
    await prisma.job.update({ where: { id: job.id }, data: { status: 'AWARDED' } });
    expect((await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ status: 'CANCELLED' })).status).toBe(409);
    expect((await request(app).put(`/api/jobs/${job.id}`).set(auth(buyerA.token)).send({ title: 'New title' })).status).toBe(409);
  });
});
