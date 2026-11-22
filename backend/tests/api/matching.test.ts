import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma, resetDatabase } from '../helpers/db';
import { createUserDirect, registerUser } from '../helpers/auth';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86_400_000;

let buyer: { token: string; id: string };
let otherBuyer: { token: string };
let workshopToken: string;
let inspectorToken: string;
let adminToken: string;
let nearWorkshopId: string;

async function createJob(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/jobs')
    .set(auth(buyer.token))
    .send({
      title: 'Matching API job',
      material: 'aluminium',
      manufacturingProcess: 'CNC_MACHINING',
      quantity: 100,
      deadline: new Date(Date.now() + 30 * DAY).toISOString(),
      latitude: 18.52,
      longitude: 73.85,
      ...overrides,
    });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data.job as { id: string; updatedAt: string };
}

/** Workshop that can do the default job, at the given location. */
async function capableWorkshop(
  name: string,
  latitude: number | null,
  longitude: number | null,
  verificationStatus: 'VERIFIED' | 'PENDING' = 'VERIFIED',
) {
  const owner = await registerUser('WORKSHOP', {
    workshop: { businessName: name, ...(latitude !== null && { latitude, longitude }) },
  });
  const workshopId = owner.user.workshop.id as string;
  await prisma.machine.create({ data: { workshopId, machineName: 'Mill', machineType: 'CNC_MILL' } });
  await prisma.capability.create({
    data: { workshopId, manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium'], leadTimeDays: 1 },
  });
  await prisma.workshopCapacity.create({
    data: { workshopId, availableCapacity: 1000, startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + 40 * DAY) },
  });
  // Registration creates PENDING workshops; only VERIFIED ones are eligible.
  await prisma.workshop.update({ where: { id: workshopId }, data: { verificationStatus } });
  return { workshopId, token: owner.token };
}

beforeAll(async () => {
  await resetDatabase();
  const b = await registerUser('BUYER');
  buyer = { token: b.token, id: b.user.id };
  otherBuyer = { token: (await registerUser('BUYER')).token };
  inspectorToken = (await registerUser('INSPECTOR')).token;
  adminToken = (await createUserDirect('ADMIN')).token;

  const near = await capableWorkshop('Near Works', 18.53, 73.86);
  nearWorkshopId = near.workshopId;
  workshopToken = near.token;
  await capableWorkshop('Mumbai Far Works', 19.076, 72.8777);
  await capableWorkshop('Nowhere Works', null, null);
  await capableWorkshop('Pending Works', 18.521, 73.851, 'PENDING');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/jobs/:id/matches - access', () => {
  it('returns ranked matches to the owning buyer', async () => {
    const job = await createJob();
    const res = await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(buyer.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: 'Matching completed' });
    expect(res.body.data).toMatchObject({
      jobId: job.id,
      jobStatus: 'OPEN',
      totalWorkshops: 4,
      eligibleCount: 3,
      excludedCount: 1,
      scoring: { weights: { rating: 0.35, capacityHeadroom: 0.25, distance: 0.2, deadlineSlack: 0.15, experience: 0.05 }, maxDistanceKm: null },
    });
    const results = res.body.data.results as { businessName: string; rank: number | null; verificationStatus: string }[];
    expect(results[0]).toMatchObject({ businessName: 'Near Works', rank: 1, verificationStatus: 'VERIFIED', invitation: null });
    // Eligible (ranked) first, then the excluded PENDING workshop - despite being the closest.
    expect(results.slice(0, 3).map((r) => r.businessName).sort()).toEqual(['Mumbai Far Works', 'Near Works', 'Nowhere Works']);
    expect(results[3]).toMatchObject({ businessName: 'Pending Works', rank: null, verificationStatus: 'PENDING', score: null });
  });

  it('lets an admin view matches for any job', async () => {
    const job = await createJob();
    expect((await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(adminToken))).status).toBe(200);
  });

  it("returns 404 for another buyer's job and for an unknown job", async () => {
    const job = await createJob();
    const other = await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(otherBuyer.token));
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Job not found');
    expect((await request(app).get('/api/jobs/no-such-job/matches').set(auth(buyer.token))).status).toBe(404);
  });

  it('returns 403 for workshops and inspectors, 401 without a token', async () => {
    const job = await createJob();
    expect((await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(workshopToken))).status).toBe(403);
    expect((await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(inspectorToken))).status).toBe(403);
    expect((await request(app).get(`/api/jobs/${job.id}/matches`)).status).toBe(401);
  });
});

describe('GET /api/jobs/:id/matches - job status', () => {
  it.each(['DRAFT', 'CANCELLED', 'AWARDED', 'IN_PROGRESS', 'COMPLETED'] as const)('refuses a %s job with 409', async (status) => {
    const job = await createJob();
    await prisma.job.update({ where: { id: job.id }, data: { status } });
    const res = await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(buyer.token));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Matching is only available for OPEN or MATCHED jobs (this job is ${status})`);
  });

  it('allows a MATCHED job (to view or invite more later)', async () => {
    const job = await createJob();
    await prisma.job.update({ where: { id: job.id }, data: { status: 'MATCHED' } });
    expect((await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(buyer.token))).status).toBe(200);
  });
});

describe('GET /api/jobs/:id/matches - query validation and distance filter', () => {
  it.each(['-5', '0', 'abc', '99999'])('rejects maxDistanceKm=%s with 400', async (v) => {
    const job = await createJob();
    const res = await request(app).get(`/api/jobs/${job.id}/matches?maxDistanceKm=${v}`).set(auth(buyer.token));
    expect(res.status).toBe(400);
  });

  it('rejects unknown query parameters', async () => {
    const job = await createJob();
    expect((await request(app).get(`/api/jobs/${job.id}/matches?sort=rating`).set(auth(buyer.token))).status).toBe(400);
  });

  it('maxDistanceKm excludes far workshops but keeps location-less ones', async () => {
    const job = await createJob();
    const res = await request(app).get(`/api/jobs/${job.id}/matches?maxDistanceKm=50`).set(auth(buyer.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ eligibleCount: 2, excludedCount: 2, scoring: { maxDistanceKm: 50 } });
    const byName = Object.fromEntries(res.body.data.results.map((r: { businessName: string }) => [r.businessName, r]));
    expect(byName['Mumbai Far Works'].eligibility.reasons[0]).toMatch(/beyond the 50 km limit/);
    expect(byName['Nowhere Works'].eligibility.eligible).toBe(true);
    expect(byName['Nowhere Works'].scoreBreakdown.distanceScore).toBeNull();
  });

  it('rejects maxDistanceKm when the job has no location', async () => {
    const job = await createJob({ latitude: undefined, longitude: undefined });
    const res = await request(app).get(`/api/jobs/${job.id}/matches?maxDistanceKm=50`).set(auth(buyer.token));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/requires the job to have a location/);
  });
});

describe('GET /api/jobs/:id/matches - read-only behaviour', () => {
  it('creates no invitations and does not change the job', async () => {
    const job = await createJob();
    const before = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(buyer.token));
    await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(buyer.token));
    expect(await prisma.jobInvitation.count({ where: { jobId: job.id } })).toBe(0);
    const after = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after).toEqual(before);
  });

  it('shows an existing invitation for a workshop without modifying it', async () => {
    const job = await createJob();
    await prisma.jobInvitation.create({
      data: { jobId: job.id, workshopId: nearWorkshopId, matchScore: 90, scoreBreakdown: {}, matchReasons: [], rank: 1, status: 'ACCEPTED' },
    });
    const res = await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(buyer.token));
    const near = res.body.data.results.find((r: { workshopId: string }) => r.workshopId === nearWorkshopId);
    expect(near.invitation).toEqual({ id: expect.any(String), status: 'ACCEPTED' });
  });

  it('reports no eligible workshops clearly', async () => {
    const job = await createJob({ material: 'unobtainium' });
    const res = await request(app).get(`/api/jobs/${job.id}/matches`).set(auth(buyer.token));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Matching completed: no eligible workshops');
    expect(res.body.data.eligibleCount).toBe(0);
    expect(res.body.data.results.every((r: { score: null | number }) => r.score === null)).toBe(true);
  });
});
