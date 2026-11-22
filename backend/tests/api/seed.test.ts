import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma, resetDatabase } from '../helpers/db';
import { registerUser } from '../helpers/auth';
import { ALL_USERS, BUYERS, JOBS, WORKSHOPS } from '../../prisma/seed/data';
import { runSeed, SeedConflictError } from '../../prisma/seed/seeder';

// Test-only password, passed directly (the CLI reads SEED_DEFAULT_PASSWORD from .env).
const SEED_PASSWORD = 'SeedTest-Passw0rd';
const NOW = new Date('2026-11-20T09:30:00.000Z');

const expectedCounts = {
  users: ALL_USERS.length,
  workshops: WORKSHOPS.length,
  machines: WORKSHOPS.reduce((n, w) => n + w.machines.length, 0),
  capabilities: WORKSHOPS.reduce((n, w) => n + w.capabilities.length, 0),
  capacities: WORKSHOPS.reduce((n, w) => n + w.capacities.length, 0),
  jobs: JOBS.length,
  requirements: JOBS.reduce((n, j) => n + j.requirements.length, 0),
};

async function seedCounts() {
  const seed = { startsWith: 'seed-' };
  return {
    users: await prisma.user.count({ where: { id: seed } }),
    workshops: await prisma.workshop.count({ where: { id: seed } }),
    machines: await prisma.machine.count({ where: { id: seed } }),
    capabilities: await prisma.capability.count({ where: { id: seed } }),
    capacities: await prisma.workshopCapacity.count({ where: { id: seed } }),
    jobs: await prisma.job.count({ where: { id: seed } }),
    requirements: await prisma.jobRequirement.count({ where: { id: seed } }),
  };
}

let realUser: { token: string; user: { id: string; email: string } };
let realJobId: string;

beforeAll(async () => {
  await resetDatabase();
  // "Real" data created through the API before seeding - must survive seeding.
  realUser = await registerUser('BUYER');
  const job = await request(app)
    .post('/api/jobs')
    .set('Authorization', `Bearer ${realUser.token}`)
    .send({
      title: 'Real customer job',
      material: 'brass',
      manufacturingProcess: 'LATHE_TURNING',
      quantity: 42,
      deadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    });
  realJobId = job.body.data.job.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('runSeed', () => {
  it('creates the full dataset with the expected record counts', async () => {
    const summary = await runSeed(prisma, { password: SEED_PASSWORD, now: NOW });
    expect(summary).toMatchObject(expectedCounts);
    expect(await seedCounts()).toEqual(expectedCounts);
  });

  it('is repeatable: a second run creates no duplicates and keeps the same ids', async () => {
    const idsBefore = (await prisma.job.findMany({ where: { id: { startsWith: 'seed-' } }, select: { id: true } })).map((j) => j.id);
    const hashBefore = (await prisma.user.findUniqueOrThrow({ where: { id: BUYERS[0].id } })).passwordHash;

    await runSeed(prisma, { password: SEED_PASSWORD, now: NOW });

    expect(await seedCounts()).toEqual(expectedCounts);
    const idsAfter = (await prisma.job.findMany({ where: { id: { startsWith: 'seed-' } }, select: { id: true } })).map((j) => j.id);
    expect(idsAfter.sort()).toEqual(idsBefore.sort());
    // Password unchanged -> hash kept, so reseeding is stable.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: BUYERS[0].id } })).passwordHash).toBe(hashBefore);
  });

  it('never stores plaintext passwords, and seed accounts log in through the real API', async () => {
    const users = await prisma.user.findMany({ where: { id: { startsWith: 'seed-' } } });
    expect(users.every((u) => u.passwordHash !== SEED_PASSWORD && /^\$2[aby]\$\d{2}\$/.test(u.passwordHash))).toBe(true);

    for (const role of ['ADMIN', 'BUYER', 'WORKSHOP', 'INSPECTOR'] as const) {
      const account = ALL_USERS.find((u) => u.role === role)!;
      const res = await request(app).post('/api/auth/login').send({ email: account.email, password: SEED_PASSWORD });
      expect(res.status, role).toBe(200);
      expect(res.body.data.user).toMatchObject({ id: account.id, role });
    }
  });

  it('builds correct relationships', async () => {
    const workshops = await prisma.workshop.findMany({
      where: { id: { startsWith: 'seed-' } },
      include: { user: true, machines: true, capabilities: true, capacities: true },
    });
    for (const w of workshops) {
      const data = WORKSHOPS.find((d) => d.id === w.id)!;
      expect(w.user.role).toBe('WORKSHOP');
      expect(w.userId).toBe(data.owner.id);
      expect(w.machines).toHaveLength(data.machines.length);
      expect(w.capabilities).toHaveLength(data.capabilities.length);
      expect(w.capacities).toHaveLength(data.capacities.length);
    }

    const jobs = await prisma.job.findMany({ where: { id: { startsWith: 'seed-' } }, include: { buyer: true, requirements: true } });
    for (const j of jobs) {
      const data = JOBS.find((d) => d.id === j.id)!;
      expect(j.buyer.role).toBe('BUYER');
      expect(j.requirements).toHaveLength(data.requirements.length);
      expect(j.status).toBe(data.status);
      // Dates are relative to the seed day: deadline = end of (today + deadlineDay) UTC.
      expect(j.deadline.toISOString()).toBe(new Date(Date.UTC(2026, 10, 20 + data.deadlineDay, 23, 59, 59, 999)).toISOString());
    }

    // Workshop API returns seed data like any other workshop.
    const login = await request(app).post('/api/auth/login').send({ email: BUYERS[0].email, password: SEED_PASSWORD });
    const res = await request(app).get('/api/workshops/seed-ws-precision-works').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.workshop.machines.length).toBeGreaterThan(0);
  });

  it('leaves real (non-seed) users and jobs untouched', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: realUser.user.id } });
    expect(user.email).toBe(realUser.user.email);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: realJobId } });
    expect(job).toMatchObject({ title: 'Real customer job', quantity: 42, buyerId: realUser.user.id });
  });

  it('resets seed records that were changed, and clears their invitations', async () => {
    const jobId = 'seed-job-alu-brackets';
    await prisma.job.update({ where: { id: jobId }, data: { quantity: 1, status: 'MATCHED' } });
    await prisma.jobInvitation.create({
      data: { jobId, workshopId: 'seed-ws-precision-works', matchScore: 90, scoreBreakdown: {}, matchReasons: [], rank: 1 },
    });
    await prisma.machine.create({ data: { workshopId: 'seed-ws-precision-works', machineName: 'Demo add', machineType: 'OTHER' } });

    const summary = await runSeed(prisma, { password: SEED_PASSWORD, now: NOW });

    expect(summary.invitationsCleared).toBe(1);
    expect(await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ quantity: 500, status: 'OPEN', matchedAt: null });
    expect(await prisma.machine.count({ where: { workshopId: 'seed-ws-precision-works' } })).toBe(2);
    expect(await seedCounts()).toEqual(expectedCounts);
  });

  it('refuses to take over a real account that uses a seed email, and changes nothing', async () => {
    await resetDatabase();
    const victim = await registerUser('BUYER', { email: BUYERS[1].email });

    await expect(runSeed(prisma, { password: SEED_PASSWORD, now: NOW })).rejects.toBeInstanceOf(SeedConflictError);

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.job.count()).toBe(0);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: victim.user.id } });
    expect(user.role).toBe('BUYER');
  });
});

describe('reseeding and sessions (M13 token version)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await runSeed(prisma, { password: SEED_PASSWORD, now: NOW });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const loginAsha = () => request(app).post('/api/auth/login').send({ email: 'asha.rao@kaarigarlink.test', password: SEED_PASSWORD });

  it('an unchanged reseed keeps passwords and sessions', async () => {
    const token = (await loginAsha()).body.data.token as string;
    await runSeed(prisma, { password: SEED_PASSWORD, now: NOW });
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + token)).status).toBe(200);
  });

  it('a reseed that resets a changed password also ends that account\'s earlier sessions', async () => {
    const token = (await loginAsha()).body.data.token as string;
    const changed = await request(app).patch('/api/auth/me/password').set('Authorization', 'Bearer ' + token).send({ currentPassword: SEED_PASSWORD, newPassword: 'Changed-Passw0rd' });
    expect(changed.status).toBe(200);
    const afterChange = changed.body.data.token as string;

    await runSeed(prisma, { password: SEED_PASSWORD, now: NOW }); // resets the seed password
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + afterChange)).status).toBe(401);
    expect((await loginAsha()).status).toBe(200);
  });
});
