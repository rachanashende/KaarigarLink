import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';

/**
 * Concurrency: real parallel requests, plus deterministic races injected right
 * after the service reads (same technique as the job/workshop concurrency tests).
 */
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const ASHA = 'seed-user-buyer-asha';
const BRACKETS = 'seed-job-alu-brackets';
const PRECISION = 'seed-ws-precision-works';
const TALEGAON = 'seed-ws-talegaon-tooling';
const MUMBAI = 'seed-ws-mumbai-metalcraft';
const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;

let tokenFor: (userId: string) => Promise<string>;

// File-scoped spies that delegate to the real methods unless a race is injected
// (restoring a Prisma delegate method would leave it undefined).
const realJobFind = prisma.job.findUnique.bind(prisma.job);
const jobFindSpy = vi
  .spyOn(prisma.job, 'findUnique')
  .mockImplementation(realJobFind as unknown as typeof prisma.job.findUnique);
const realInvFind = prisma.jobInvitation.findUnique.bind(prisma.jobInvitation);
const invFindSpy = vi
  .spyOn(prisma.jobInvitation, 'findUnique')
  .mockImplementation(realInvFind as unknown as typeof prisma.jobInvitation.findUnique);

const realWorkshopFindMany = prisma.workshop.findMany.bind(prisma.workshop);
const workshopFindManySpy = vi
  .spyOn(prisma.workshop, 'findMany')
  .mockImplementation(realWorkshopFindMany as unknown as typeof prisma.workshop.findMany);

/** Runs `write` right after matching has loaded the workshops it evaluates. */
function afterNextMatchingRead(write: () => Promise<unknown>) {
  workshopFindManySpy.mockImplementationOnce((async (args: Parameters<typeof realWorkshopFindMany>[0]) => {
    const snapshot = await realWorkshopFindMany(args);
    await write();
    return snapshot;
  }) as unknown as typeof prisma.workshop.findMany);
}

function afterNextJobRead(write: () => Promise<unknown>) {
  jobFindSpy.mockImplementationOnce((async (args: Parameters<typeof realJobFind>[0]) => {
    const snapshot = await realJobFind(args);
    await write();
    return snapshot;
  }) as unknown as typeof prisma.job.findUnique);
}

function afterNextInvitationRead(write: () => Promise<unknown>) {
  invFindSpy.mockImplementationOnce((async (args: Parameters<typeof realInvFind>[0]) => {
    const snapshot = await realInvFind(args);
    await write();
    return snapshot;
  }) as unknown as typeof prisma.jobInvitation.findUnique);
}

const cancelJob = async () =>
  request(app).put(`/api/jobs/${BRACKETS}`).set(auth(await tokenFor(ASHA))).send({ status: 'CANCELLED' });
const invite = async (workshopId: string) =>
  request(app).post(`/api/jobs/${BRACKETS}/invitations`).set(auth(await tokenFor(ASHA))).send({ workshopId });
const respond = async (id: string, workshopId: string, response: 'ACCEPTED' | 'DECLINED') =>
  request(app).post(`/api/invitations/${id}/respond`).set(auth(await tokenFor(owner(workshopId)))).send({ response });

beforeEach(async () => {
  tokenFor = await seededSession();
  // Log in before any race so logins don't interleave with the injected writes.
  for (const id of [ASHA, owner(PRECISION), owner(TALEGAON), owner(MUMBAI)]) await tokenFor(id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('invitation concurrency', () => {
  it('parallel duplicate invites create exactly one invitation', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => invite(PRECISION)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    // Losers either see the existing invitation (200) or lost the job-version race (409).
    expect(statuses.every((s) => s === 201 || s === 200 || s === 409)).toBe(true);
    expect(await prisma.jobInvitation.count({ where: { jobId: BRACKETS, workshopId: PRECISION } })).toBe(1);
    const ids = new Set(results.filter((r) => r.status !== 409).map((r) => r.body.data.invitation.id));
    expect(ids.size).toBe(1);
  });

  it('parallel invites of different workshops never leave an orphan invitation', async () => {
    const results = await Promise.all([invite(TALEGAON), invite(MUMBAI)]);
    const created = results.filter((r) => r.status === 201).length;
    expect(created).toBeGreaterThanOrEqual(1);
    for (const r of results.filter((x) => x.status !== 201)) {
      expect(r.status).toBe(409);
      expect(r.body.message).toBe('Job was modified, please retry');
    }
    expect(await prisma.jobInvitation.count({ where: { jobId: BRACKETS } })).toBe(created);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } })).status).toBe('MATCHED');
  });

  it('an invite racing a job cancellation is rejected and rolled back', async () => {
    afterNextJobRead(() => prisma.job.update({ where: { id: BRACKETS }, data: { status: 'CANCELLED' } }));
    const res = await invite(PRECISION);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Job was modified, please retry');
    expect(await prisma.jobInvitation.count({ where: { jobId: BRACKETS } })).toBe(0);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } })).status).toBe('CANCELLED');
  });

  it('an invite racing a buyer edit of the job is rejected', async () => {
    afterNextJobRead(() => prisma.job.update({ where: { id: BRACKETS }, data: { quantity: 400 } }));
    const res = await invite(PRECISION);
    expect(res.status).toBe(409);
    expect(await prisma.jobInvitation.count({ where: { jobId: BRACKETS } })).toBe(0);
  });

  it('parallel accept and decline: exactly one wins', async () => {
    const id = (await invite(PRECISION)).body.data.invitation.id;
    const [a, b] = await Promise.all([respond(id, PRECISION, 'ACCEPTED'), respond(id, PRECISION, 'DECLINED')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    const final = await prisma.jobInvitation.findUniqueOrThrow({ where: { id } });
    expect(final.status).toBe(winner.body.data.invitation.status);
  });

  it('a response racing a job cancellation (which expires invitations) is rejected', async () => {
    const id = (await invite(PRECISION)).body.data.invitation.id;
    afterNextInvitationRead(async () => {
      await prisma.job.update({ where: { id: BRACKETS }, data: { status: 'CANCELLED' } });
      await prisma.jobInvitation.updateMany({
        where: { jobId: BRACKETS, status: { in: ['INVITED', 'ACCEPTED'] } },
        data: { status: 'EXPIRED' },
      });
    });
    const res = await respond(id, PRECISION, 'ACCEPTED');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Invitation has expired: the job is no longer open (CANCELLED)');
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
  });

  it('a response racing expiry is rejected', async () => {
    const id = (await invite(PRECISION)).body.data.invitation.id;
    afterNextInvitationRead(() =>
      prisma.jobInvitation.update({ where: { id }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000) } }),
    );
    const res = await respond(id, PRECISION, 'DECLINED');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Invitation has expired');
  });

  it('a response racing another response is rejected and does not overwrite it', async () => {
    const id = (await invite(PRECISION)).body.data.invitation.id;
    afterNextInvitationRead(() =>
      prisma.jobInvitation.update({ where: { id }, data: { status: 'ACCEPTED', respondedAt: new Date() } }),
    );
    const res = await respond(id, PRECISION, 'DECLINED');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Invitation has already been accepted');
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status).toBe('ACCEPTED');
  });

  // ---------- Fix 2: verification race ----------

  it('an invite racing a verification downgrade is rejected (workshop row re-checked under lock)', async () => {
    afterNextMatchingRead(() =>
      prisma.workshop.update({ where: { id: PRECISION }, data: { verificationStatus: 'PENDING' } }),
    );
    const res = await invite(PRECISION);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Workshop was modified, please retry');
    expect(await prisma.jobInvitation.count({ where: { workshopId: PRECISION } })).toBe(0);
    // Job untouched: still OPEN, nothing half-done.
    expect((await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } })).status).toBe('OPEN');
  });

  it('an invite racing any other edit of the target workshop is rejected too', async () => {
    afterNextMatchingRead(() =>
      prisma.workshop.update({ where: { id: PRECISION }, data: { businessName: 'Precision Works (renamed)' } }),
    );
    expect((await invite(PRECISION)).status).toBe(409);
  });

  it('a change to a DIFFERENT workshop does not block the invite (only the target row is locked)', async () => {
    afterNextMatchingRead(() =>
      prisma.workshop.update({ where: { id: MUMBAI }, data: { description: 'Unrelated edit' } }),
    );
    expect((await invite(PRECISION)).status).toBe(201);
  });

  it('a downgrade issued while the invite holds the lock waits, and is applied after the invite', async () => {
    let downgrade: Promise<unknown> | undefined;
    // Start the downgrade right after matching read; it must wait for the invite's row lock or
    // commit first - either way the final state is consistent (never an invite of a PENDING shop
    // that was PENDING when the invite committed).
    afterNextMatchingRead(async () => {
      downgrade = prisma.workshop.updateMany({ where: { id: PRECISION }, data: { verificationStatus: 'PENDING' } });
    });
    const res = await invite(PRECISION);
    await downgrade;
    const workshop = await prisma.workshop.findUniqueOrThrow({ where: { id: PRECISION } });
    expect(workshop.verificationStatus).toBe('PENDING');
    const invitations = await prisma.jobInvitation.count({ where: { workshopId: PRECISION } });
    if (res.status === 201) expect(invitations).toBe(1); // invite committed first, downgrade after
    else {
      expect(res.status).toBe(409); // downgrade committed first, invite refused
      expect(invitations).toBe(0);
    }
  });

  // ---------- Fix 3: invites for different workshops on an already MATCHED job ----------

  it('two different workshops invited simultaneously on a MATCHED job both succeed', async () => {
    expect((await invite(PRECISION)).status).toBe(201); // first invite: OPEN -> MATCHED
    const before = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });

    const [a, b] = await Promise.all([invite(TALEGAON), invite(MUMBAI)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await prisma.jobInvitation.count({ where: { jobId: BRACKETS } })).toBe(3);

    // Subsequent invites do not touch the job (no version bump).
    const after = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
    expect(after).toEqual(before);
  });

  it('an invite on a MATCHED job racing a cancellation is rejected and leaves nothing', async () => {
    expect((await invite(PRECISION)).status).toBe(201);
    afterNextJobRead(async () => {
      await prisma.job.update({ where: { id: BRACKETS }, data: { status: 'CANCELLED' } });
      await prisma.jobInvitation.updateMany({ where: { jobId: BRACKETS, status: { in: ['INVITED', 'ACCEPTED'] } }, data: { status: 'EXPIRED' } });
    });
    const res = await invite(TALEGAON);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Job was modified, please retry');
    expect(await prisma.jobInvitation.count({ where: { jobId: BRACKETS, workshopId: TALEGAON } })).toBe(0);
  });

  it('a real cancellation in parallel with invites never leaves an answerable invitation', async () => {
    expect((await invite(PRECISION)).status).toBe(201);
    const [cancel, i1, i2] = await Promise.all([cancelJob(), invite(TALEGAON), invite(MUMBAI)]);
    expect(cancel.status).toBe(200); // invites on a MATCHED job no longer bump the version
    for (const r of [i1, i2]) expect([201, 409]).toContain(r.status);
    const rows = await prisma.jobInvitation.findMany({ where: { jobId: BRACKETS } });
    expect(rows.every((r) => r.status === 'EXPIRED')).toBe(true);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } })).status).toBe('CANCELLED');
  });
});
