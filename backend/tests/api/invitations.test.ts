import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { registerUser } from '../helpers/auth';
import { seededSession } from '../helpers/seedSession';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86_400_000;

// Seed ids (see prisma/seed/data.ts and docs/SEED_DATA.md).
const ASHA = 'seed-user-buyer-asha';
const VIKRAM = 'seed-user-buyer-vikram';
const NEHA = 'seed-user-buyer-neha';
const ARJUN = 'seed-user-buyer-arjun';
const ADMIN = 'seed-user-admin';
const INSPECTOR = 'seed-user-inspector';
const BRACKETS = 'seed-job-alu-brackets'; // eligible: precision, mumbai, talegaon
const SHAFTS = 'seed-job-stainless-shafts'; // eligible: precision only
const DRAFT = 'seed-job-enclosures-draft';
const PRECISION = 'seed-ws-precision-works';
const TALEGAON = 'seed-ws-talegaon-tooling';
const MUMBAI = 'seed-ws-mumbai-metalcraft';
const COIMBATORE = 'seed-ws-coimbatore-castings';
const CHAKAN = 'seed-ws-chakan-cnc';
const NASHIK_PENDING = 'seed-ws-nashik-small-batch';
const HADAPSAR_REJECTED = 'seed-ws-hadapsar-fabricators';
const BENGALURU = 'seed-ws-bengaluru-additive';
const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;

let tokenFor: (userId: string) => Promise<string>;

const invite = async (jobId: string, workshopId: string, as = ASHA) =>
  request(app).post(`/api/jobs/${jobId}/invitations`).set(auth(await tokenFor(as))).send({ workshopId });
const respond = async (invitationId: string, workshopId: string, body: Record<string, unknown>) =>
  request(app).post(`/api/invitations/${invitationId}/respond`).set(auth(await tokenFor(owner(workshopId)))).send(body);
const myInvitations = async (workshopId: string, query = '') =>
  request(app).get(`/api/workshops/invitations${query}`).set(auth(await tokenFor(owner(workshopId))));
const jobInvitations = async (jobId: string, as = ASHA, query = '') =>
  request(app).get(`/api/jobs/${jobId}/invitations${query}`).set(auth(await tokenFor(as)));

beforeAll(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/jobs/:id/invitations - inviting', () => {
  let firstInvitationId: string;

  it('invites an eligible workshop: 201, snapshot stored, job moves to MATCHED', async () => {
    const matches = await request(app).get(`/api/jobs/${BRACKETS}/matches`).set(auth(await tokenFor(ASHA)));
    const expected = matches.body.data.results.find((r: { workshopId: string }) => r.workshopId === PRECISION);

    const res = await invite(BRACKETS, PRECISION);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Workshop invited');
    expect(res.body.data).toMatchObject({ created: true, jobStatus: 'MATCHED' });
    const inv = res.body.data.invitation;
    expect(inv).toMatchObject({
      jobId: BRACKETS,
      workshopId: PRECISION,
      status: 'INVITED',
      matchScore: expected.score,
      rank: expected.rank,
      distanceKm: expected.distanceKm,
      respondedAt: null,
      responseNote: null,
    });
    expect(inv.matchReasons).toEqual(expected.explanations);
    // expiresAt = min(createdAt + 7 days, deadline); the deadline is 30 days out.
    expect(new Date(inv.expiresAt).getTime() - new Date(inv.createdAt).getTime()).toBe(7 * DAY);
    firstInvitationId = inv.id;

    const job = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
    expect(job.status).toBe('MATCHED');
    expect(job.matchedAt).not.toBeNull();

    // Matching (still allowed for MATCHED jobs) shows the invitation.
    const after = await request(app).get(`/api/jobs/${BRACKETS}/matches`).set(auth(await tokenFor(ASHA)));
    const row = after.body.data.results.find((r: { workshopId: string }) => r.workshopId === PRECISION);
    expect(row.invitation).toEqual({ id: inv.id, status: 'INVITED' });
  });

  it('a second invitation keeps the job MATCHED and its matchedAt unchanged', async () => {
    const before = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
    expect((await invite(BRACKETS, TALEGAON)).status).toBe(201);
    const after = await prisma.job.findUniqueOrThrow({ where: { id: BRACKETS } });
    expect(after.status).toBe('MATCHED');
    expect(after.matchedAt!.getTime()).toBe(before.matchedAt!.getTime());
  });

  it('re-inviting an INVITED workshop returns 200 with the existing invitation', async () => {
    const res = await invite(BRACKETS, PRECISION);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Workshop already invited');
    expect(res.body.data).toMatchObject({ created: false, invitation: { id: firstInvitationId, status: 'INVITED' } });
    expect(await prisma.jobInvitation.count({ where: { jobId: BRACKETS, workshopId: PRECISION } })).toBe(1);
  });

  it('re-inviting an ACCEPTED workshop returns 200 with the existing invitation', async () => {
    expect((await respond(firstInvitationId, PRECISION, { response: 'ACCEPTED' })).status).toBe(200);
    const res = await invite(BRACKETS, PRECISION);
    expect(res.status).toBe(200);
    expect(res.body.data.invitation).toMatchObject({ id: firstInvitationId, status: 'ACCEPTED' });
  });

  it('re-inviting a DECLINED workshop is refused with 409', async () => {
    const created = await invite(BRACKETS, MUMBAI);
    expect(created.status).toBe(201);
    await respond(created.body.data.invitation.id, MUMBAI, { response: 'DECLINED', note: 'Fully booked' });
    const res = await invite(BRACKETS, MUMBAI);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('This workshop declined the invitation; re-invitation is not allowed');
  });

  it('re-inviting an EXPIRED workshop is refused with 409, even before expiry is persisted', async () => {
    const created = await invite(SHAFTS, PRECISION);
    expect(created.status).toBe(201);
    const id = created.body.data.invitation.id;
    // Overdue but still stored as INVITED: duplicate handling must use the effective status.
    await prisma.jobInvitation.update({ where: { id }, data: { createdAt: new Date(Date.now() - 8 * DAY) } });
    const res = await invite(SHAFTS, PRECISION);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The invitation to this workshop expired; re-invitation is not allowed');
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
  });

  it.each([
    [NASHIK_PENDING, /not yet verified/],
    [HADAPSAR_REJECTED, /verification was rejected/],
    [BENGALURU, /No CNC_MACHINING capability/],
    [CHAKAN, /Lacks required ISO_9001/],
  ])('refuses an ineligible workshop (%s) with 409 and the matcher reasons', async (workshopId, reason) => {
    const res = await invite(BRACKETS, workshopId);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Workshop is not eligible for this job');
    expect(res.body.errors.join(' | ')).toMatch(reason);
    expect(await prisma.jobInvitation.count({ where: { workshopId } })).toBe(0);
  });

  it('returns 404 for an unknown workshop and 400 for a bad body', async () => {
    expect((await invite(BRACKETS, 'no-such-workshop')).status).toBe(404);
    const token = await tokenFor(ASHA);
    expect((await request(app).post(`/api/jobs/${BRACKETS}/invitations`).set(auth(token)).send({})).status).toBe(400);
    const extra = await request(app)
      .post(`/api/jobs/${BRACKETS}/invitations`)
      .set(auth(token))
      .send({ workshopId: TALEGAON, rank: 1 });
    expect(extra.status).toBe(400);
  });

  it('refuses DRAFT and CANCELLED jobs with 409', async () => {
    const draft = await invite(DRAFT, MUMBAI, VIKRAM);
    expect(draft.status).toBe(409);
    expect(draft.body.message).toBe('Invitations can only be sent for OPEN or MATCHED jobs (this job is DRAFT)');

    await request(app).put('/api/jobs/seed-job-laser-panels').set(auth(await tokenFor(NEHA))).send({ status: 'CANCELLED' });
    expect((await invite('seed-job-laser-panels', MUMBAI, NEHA)).status).toBe(409);
  });

  it("returns 404 for another buyer's job; 403 for WORKSHOP, INSPECTOR, ADMIN; 401 without a token", async () => {
    expect((await invite(BRACKETS, TALEGAON, VIKRAM)).status).toBe(404);
    for (const userId of [owner(PRECISION), INSPECTOR, ADMIN]) {
      expect((await invite(BRACKETS, TALEGAON, userId)).status, userId).toBe(403);
    }
    expect((await request(app).post(`/api/jobs/${BRACKETS}/invitations`).send({ workshopId: TALEGAON })).status).toBe(401);
  });
});

describe('GET /api/jobs/:id/invitations - buyer view', () => {
  it('lists invitations by rank with snapshot and workshop summary, without emails', async () => {
    const res = await jobInvitations(BRACKETS);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ jobId: BRACKETS, jobStatus: 'MATCHED' });
    const items = res.body.data.items;
    expect(items.map((i: { workshopId: string }) => i.workshopId)).toEqual([PRECISION, MUMBAI, TALEGAON]);
    expect(items[0]).toMatchObject({
      status: 'ACCEPTED',
      workshop: { id: PRECISION, businessName: 'Precision Works', verificationStatus: 'VERIFIED' },
    });
    expect(items[0].matchScore).toEqual(expect.any(Number));
    expect(JSON.stringify(res.body)).not.toMatch(/@kaarigarlink\.test|"email"/);
  });

  it('filters by status and validates the filter', async () => {
    const res = await jobInvitations(BRACKETS, ASHA, '?status=DECLINED');
    expect(res.body.data.items.map((i: { workshopId: string }) => i.workshopId)).toEqual([MUMBAI]);
    expect((await jobInvitations(BRACKETS, ASHA, '?status=PENDING')).status).toBe(400);
  });

  it('admin can view; another buyer gets 404; workshops and inspectors get 403', async () => {
    expect((await jobInvitations(BRACKETS, ADMIN)).status).toBe(200);
    expect((await jobInvitations(BRACKETS, VIKRAM)).status).toBe(404);
    expect((await jobInvitations(BRACKETS, owner(PRECISION))).status).toBe(403);
    expect((await jobInvitations(BRACKETS, INSPECTOR)).status).toBe(403);
  });
});

describe('GET /api/workshops/invitations - workshop view', () => {
  it('shows only its own invitations with job and buyer name, never score, rank or competitors', async () => {
    const res = await myInvitations(TALEGAON);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    const item = res.body.data.items[0];
    expect(item).toMatchObject({
      jobId: BRACKETS,
      workshopId: TALEGAON,
      status: 'INVITED',
      buyer: { id: ASHA, name: 'Asha Rao' },
      job: { id: BRACKETS, material: 'aluminium', quantity: 500, status: 'MATCHED' },
    });
    expect(item.job.requirements.length).toBeGreaterThan(0);
    expect(item.expiresAt).toEqual(expect.any(String));
    for (const hidden of ['matchScore', 'rank', 'scoreBreakdown', 'matchReasons', 'distanceKm']) {
      expect(item, hidden).not.toHaveProperty(hidden);
    }
    expect(JSON.stringify(res.body)).not.toMatch(/@kaarigarlink\.test|"email"|matchScore|"rank"/);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it('supports status filter and pagination', async () => {
    const all = await myInvitations(PRECISION);
    expect(all.body.data.items).toHaveLength(2); // brackets (ACCEPTED) + shafts (EXPIRED)
    const accepted = await myInvitations(PRECISION, '?status=ACCEPTED');
    expect(accepted.body.data.items.map((i: { jobId: string }) => i.jobId)).toEqual([BRACKETS]);
    const page = await myInvitations(PRECISION, '?limit=1&page=2');
    expect(page.body.data.items).toHaveLength(1);
    expect(page.body.data.pagination).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });
  });

  it('is WORKSHOP-only', async () => {
    expect((await request(app).get('/api/workshops/invitations').set(auth(await tokenFor(ASHA)))).status).toBe(403);
    expect((await request(app).get('/api/workshops/invitations')).status).toBe(401);
  });

  it('a workshop with no invitations gets an empty list', async () => {
    const fresh = await registerUser('WORKSHOP');
    const res = await request(app).get('/api/workshops/invitations').set(auth(fresh.token));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });
});

describe('POST /api/invitations/:id/respond', () => {
  async function freshInvitation(jobId: string, workshopId: string, buyer = ASHA) {
    const res = await invite(jobId, workshopId, buyer);
    if (res.status !== 201) throw new Error(`invite failed ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data.invitation.id as string;
  }

  it('accepting changes only the invitation: job unchanged, nothing else created', async () => {
    const id = await freshInvitation('seed-job-turned-fittings', PRECISION);
    const jobBefore = await prisma.job.findUniqueOrThrow({ where: { id: 'seed-job-turned-fittings' } });
    const invitationsBefore = await prisma.jobInvitation.count();

    const res = await respond(id, PRECISION, { response: 'ACCEPTED', note: '  Can start Monday  ' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Invitation accepted');
    expect(res.body.data.invitation).toMatchObject({
      id,
      status: 'ACCEPTED',
      responseNote: 'Can start Monday',
      buyer: { id: ASHA, name: 'Asha Rao' },
    });
    expect(res.body.data.invitation.respondedAt).toEqual(expect.any(String));
    expect(res.body.data.invitation).not.toHaveProperty('matchScore');

    const jobAfter = await prisma.job.findUniqueOrThrow({ where: { id: 'seed-job-turned-fittings' } });
    expect(jobAfter).toEqual(jobBefore);
    expect(await prisma.jobInvitation.count()).toBe(invitationsBefore);
  });

  it('declining works and a second response is refused with 409', async () => {
    const id = await freshInvitation('seed-job-turned-fittings', COIMBATORE);
    const decline = await respond(id, COIMBATORE, { response: 'DECLINED' });
    expect(decline.status).toBe(200);
    expect(decline.body.message).toBe('Invitation declined');
    expect(decline.body.data.invitation).toMatchObject({ status: 'DECLINED', responseNote: null });
    const again = await respond(id, COIMBATORE, { response: 'ACCEPTED' });
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Invitation has already been declined');
  });

  it("404 for another workshop's invitation or unknown id; 403 for non-workshops; 400 for bad bodies", async () => {
    const id = await freshInvitation('seed-job-nashik-prototypes', CHAKAN, ARJUN);
    expect((await respond(id, TALEGAON, { response: 'ACCEPTED' })).status).toBe(404);
    expect((await respond('no-such-invitation', TALEGAON, { response: 'ACCEPTED' })).status).toBe(404);
    for (const userId of [ARJUN, ADMIN, INSPECTOR]) {
      const res = await request(app)
        .post(`/api/invitations/${id}/respond`)
        .set(auth(await tokenFor(userId)))
        .send({ response: 'ACCEPTED' });
      expect(res.status, userId).toBe(403);
    }
    expect((await request(app).post(`/api/invitations/${id}/respond`).send({ response: 'ACCEPTED' })).status).toBe(401);
    for (const body of [{}, { response: 'EXPIRED' }, { response: 'ACCEPTED', status: 'X' }, { response: 'ACCEPTED', note: 'x'.repeat(501) }]) {
      expect((await respond(id, CHAKAN, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status).toBe('INVITED');
  });

  it('a job moved outside OPEN/MATCHED (e.g. AWARDED by Member 2) expires INVITED only', async () => {
    const JOB = 'seed-job-nashik-prototypes';
    const invitedId = await freshInvitation(JOB, MUMBAI, ARJUN);
    const acceptedId = await freshInvitation(JOB, PRECISION, ARJUN);
    const declinedId = await freshInvitation(JOB, TALEGAON, ARJUN);
    expect((await respond(acceptedId, PRECISION, { response: 'ACCEPTED' })).status).toBe(200);
    expect((await respond(declinedId, TALEGAON, { response: 'DECLINED' })).status).toBe(200);

    // Simulates Member 2 advancing the job without calling the expiry helper.
    await prisma.job.update({ where: { id: JOB }, data: { status: 'AWARDED' } });

    // Response validation: the outstanding invitation is expired, not answerable.
    const res = await respond(invitedId, MUMBAI, { response: 'ACCEPTED' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Invitation has expired: the job is no longer open (AWARDED)');

    // Listings agree, and the lazy update persisted it. ACCEPTED and DECLINED are untouched.
    const list = await jobInvitations(JOB, ARJUN);
    const byId = Object.fromEntries(list.body.data.items.map((i: { id: string; status: string }) => [i.id, i.status]));
    expect(byId).toMatchObject({ [invitedId]: 'EXPIRED', [acceptedId]: 'ACCEPTED', [declinedId]: 'DECLINED' });
    const rows = await prisma.jobInvitation.findMany({ where: { id: { in: [invitedId, acceptedId, declinedId] } } });
    expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
      [invitedId]: 'EXPIRED',
      [acceptedId]: 'ACCEPTED',
      [declinedId]: 'DECLINED',
    });
    const workshopList = await myInvitations(PRECISION, '?status=ACCEPTED');
    expect(workshopList.body.data.items.map((i: { id: string }) => i.id)).toContain(acceptedId);

    // Duplicate handling uses the same status: EXPIRED -> 409, ACCEPTED -> 200.
    expect((await invite(JOB, MUMBAI, ARJUN)).status).toBe(409);
    const again = await invite(JOB, PRECISION, ARJUN);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ created: false, jobStatus: 'AWARDED', invitation: { status: 'ACCEPTED' } });
  });

  it('the job-status expiry is applied even before it is persisted (effective status)', async () => {
    const JOB = 'seed-job-welded-frames';
    const PIMPRI = 'seed-ws-pimpri-steelworks';
    const id = await freshInvitation(JOB, PIMPRI, ARJUN);
    await prisma.job.update({ where: { id: JOB }, data: { status: 'IN_PROGRESS' } });
    // Still stored as INVITED at this point; every read must already show EXPIRED.
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status).toBe('INVITED');
    const list = await myInvitations(PIMPRI);
    expect(list.body.data.items.find((i: { id: string }) => i.id === id).status).toBe('EXPIRED');
    await prisma.job.update({ where: { id: JOB }, data: { status: 'MATCHED' } });
  });
});

describe('expiry is consistent everywhere', () => {
  it('an overdue invitation shows EXPIRED in matches, buyer list and workshop list, and cannot be answered', async () => {
    const created = await invite('seed-job-cast-iron-pumps', COIMBATORE, ARJUN);
    expect(created.status).toBe(201);
    const id = created.body.data.invitation.id;
    await prisma.jobInvitation.update({ where: { id }, data: { createdAt: new Date(Date.now() - 7 * DAY - 1000) } });

    const matches = await request(app).get('/api/jobs/seed-job-cast-iron-pumps/matches').set(auth(await tokenFor(ARJUN)));
    const row = matches.body.data.results.find((r: { workshopId: string }) => r.workshopId === COIMBATORE);
    expect(row.invitation.status).toBe('EXPIRED');
    expect((await jobInvitations('seed-job-cast-iron-pumps', ARJUN)).body.data.items[0].status).toBe('EXPIRED');
    const workshopList = await myInvitations(COIMBATORE, '?status=EXPIRED');
    expect(workshopList.body.data.items.map((i: { id: string }) => i.id)).toContain(id);
    // Persisted, not just displayed.
    expect((await prisma.jobInvitation.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');

    const res = await respond(id, COIMBATORE, { response: 'ACCEPTED' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Invitation has expired');
  });

  it('expires at the job deadline when that comes before 7 days', async () => {
    const created = await invite('seed-job-titanium-drone', BENGALURU, VIKRAM);
    expect(created.status).toBe(201);
    const id = created.body.data.invitation.id;
    await prisma.job.update({ where: { id: 'seed-job-titanium-drone' }, data: { deadline: new Date(Date.now() - 60_000) } });

    const res = await respond(id, BENGALURU, { response: 'DECLINED' });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Invitation has expired');
    const list = await jobInvitations('seed-job-titanium-drone', VIKRAM);
    expect(list.body.data.items[0]).toMatchObject({ id, status: 'EXPIRED' });
    expect(new Date(list.body.data.items[0].expiresAt).getTime()).toBeLessThan(Date.now());
  });

  it('ACCEPTED invitations do not time out', async () => {
    const accepted = await prisma.jobInvitation.findFirstOrThrow({ where: { jobId: BRACKETS, workshopId: PRECISION } });
    await prisma.jobInvitation.update({ where: { id: accepted.id }, data: { createdAt: new Date(Date.now() - 30 * DAY) } });
    const list = await jobInvitations(BRACKETS);
    expect(list.body.data.items.find((i: { id: string }) => i.id === accepted.id).status).toBe('ACCEPTED');
  });

  it('cancelling the job still expires INVITED and ACCEPTED invitations (M5 behaviour preserved)', async () => {
    // Self-contained: its own buyer, job, three eligible VERIFIED workshops and invitations,
    // so it does not depend on state left by earlier tests.
    const buyer = await registerUser('BUYER');
    const createWorkshop = async (name: string, latitude: number, longitude: number) => {
      const ws = await registerUser('WORKSHOP', { workshop: { businessName: name, latitude, longitude } });
      const workshopId = ws.user.workshop.id as string;
      await prisma.machine.create({ data: { workshopId, machineName: 'Mill', machineType: 'CNC_MILL' } });
      await prisma.capability.create({
        data: { workshopId, manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium'], leadTimeDays: 1 },
      });
      await prisma.workshopCapacity.create({
        data: { workshopId, availableCapacity: 1000, startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + 40 * DAY) },
      });
      await prisma.workshop.update({ where: { id: workshopId }, data: { verificationStatus: 'VERIFIED' } });
      return { workshopId, token: ws.token };
    };
    const accepted = await createWorkshop('Cancel Test Accepted Works', 18.53, 73.86);
    const invited = await createWorkshop('Cancel Test Invited Works', 18.54, 73.87);
    const declined = await createWorkshop('Cancel Test Declined Works', 18.55, 73.88);

    const jobRes = await request(app)
      .post('/api/jobs')
      .set(auth(buyer.token))
      .send({
        title: 'Cancellation test job',
        material: 'aluminium',
        manufacturingProcess: 'CNC_MACHINING',
        quantity: 100,
        deadline: new Date(Date.now() + 30 * DAY).toISOString(),
        latitude: 18.52,
        longitude: 73.85,
      });
    expect(jobRes.status).toBe(201);
    const jobId = jobRes.body.data.job.id as string;

    const ids: Record<string, string> = {};
    for (const ws of [accepted, invited, declined]) {
      const created = await request(app).post(`/api/jobs/${jobId}/invitations`).set(auth(buyer.token)).send({ workshopId: ws.workshopId });
      expect(created.status).toBe(201);
      ids[ws.workshopId] = created.body.data.invitation.id;
    }
    const answer = (ws: { workshopId: string; token: string }, response: 'ACCEPTED' | 'DECLINED') =>
      request(app).post(`/api/invitations/${ids[ws.workshopId]}/respond`).set(auth(ws.token)).send({ response });
    expect((await answer(accepted, 'ACCEPTED')).status).toBe(200);
    expect((await answer(declined, 'DECLINED')).status).toBe(200);

    // Scenario check before cancelling: one ACCEPTED, one INVITED, one DECLINED.
    const before = await prisma.jobInvitation.findMany({ where: { jobId } });
    expect(Object.fromEntries(before.map((i) => [i.workshopId, i.status]))).toEqual({
      [accepted.workshopId]: 'ACCEPTED',
      [invited.workshopId]: 'INVITED',
      [declined.workshopId]: 'DECLINED',
    });

    const res = await request(app).put(`/api/jobs/${jobId}`).set(auth(buyer.token)).send({ status: 'CANCELLED' });
    expect(res.status).toBe(200);
    const rows = await prisma.jobInvitation.findMany({ where: { jobId } });
    expect(Object.fromEntries(rows.map((i) => [i.workshopId, i.status]))).toEqual({
      [accepted.workshopId]: 'EXPIRED',
      [invited.workshopId]: 'EXPIRED',
      [declined.workshopId]: 'DECLINED',
    });
    const late = await request(app)
      .post(`/api/invitations/${ids[invited.workshopId]}/respond`)
      .set(auth(invited.token))
      .send({ response: 'ACCEPTED' });
    expect(late.status).toBe(409);
    expect(late.body.message).toBe('Invitation has expired: the job is no longer open (CANCELLED)');
  });
});
