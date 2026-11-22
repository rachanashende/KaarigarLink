import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma, resetDatabase } from '../helpers/db';
import { ALL_USERS, BUYERS, JOBS, WORKSHOPS } from '../../prisma/seed/data';
import { runSeed } from '../../prisma/seed/seeder';

/**
 * M6 seed scenarios as regression tests for the matching engine: every OPEN
 * seed job must produce exactly its expected eligible set, and every expected
 * exclusion must be excluded for the expected kind of reason.
 */
const SEED_PASSWORD = 'SeedTest-Passw0rd';
const tokens = new Map<string, string>();

/** Maps the category written in data.ts ("capacity: ...") to the engine's reason wording. */
const REASON_PATTERNS: Record<string, RegExp> = {
  certification: /certification/i,
  capacity: /capacity/i,
  verification: /not yet verified|verification was rejected/i,
  machine: /not operational|No operational machine/i,
  capability: /No [A-Z_]+ capability|No machine suitable/,
  deadline: /Cannot meet deadline/,
  material: /Does not support/,
  tolerance: /tolerance/i,
};
const categoryOf = (expected: string) => (expected.includes(':') ? expected.split(':')[0] : expected.split(' ')[0]).trim();

async function matchesFor(jobId: string, buyerId: string) {
  const res = await request(app).get(`/api/jobs/${jobId}/matches`).set('Authorization', `Bearer ${tokens.get(buyerId)}`);
  return res;
}

beforeAll(async () => {
  await resetDatabase();
  await runSeed(prisma, { password: SEED_PASSWORD });
  for (const u of BUYERS) {
    const res = await request(app).post('/api/auth/login').send({ email: u.email, password: SEED_PASSWORD });
    tokens.set(u.id, res.body.data.token);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('matching regression on M6 seed scenarios', () => {
  for (const job of JOBS.filter((j) => j.status === 'OPEN')) {
    it(`${job.id}: ${job.expected.scenario}`, async () => {
      const res = await matchesFor(job.id, job.buyerId);
      expect(res.status).toBe(200);
      const results = res.body.data.results as {
        workshopId: string;
        score: number | null;
        eligibility: { eligible: boolean; reasons: string[] };
      }[];

      // Every workshop is evaluated exactly once.
      expect(results).toHaveLength(WORKSHOPS.length);
      expect(new Set(results.map((r) => r.workshopId)).size).toBe(WORKSHOPS.length);

      const eligible = results.filter((r) => r.eligibility.eligible).map((r) => r.workshopId);
      expect(eligible.sort(), 'eligible set').toEqual([...job.expected.eligible].sort());

      for (const [workshopId, why] of Object.entries(job.expected.excluded)) {
        const r = results.find((x) => x.workshopId === workshopId)!;
        expect(r.eligibility.eligible, `${workshopId} should be excluded`).toBe(false);
        expect(r.score, `${workshopId} score`).toBeNull();
        const pattern = REASON_PATTERNS[categoryOf(why)];
        expect(pattern, `unknown category in data.ts: ${why}`).toBeDefined();
        expect(r.eligibility.reasons.join(' | '), `${workshopId}: expected ${why}`).toMatch(pattern);
      }
    });
  }

  it('refuses to match the DRAFT seed job with 409', async () => {
    const draft = JOBS.find((j) => j.status === 'DRAFT')!;
    const res = await matchesFor(draft.id, draft.buyerId);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/OPEN or MATCHED/);
  });

  // Rating (35%) and experience lift Mumbai Metalcraft (4.6, 55 jobs, ~108 km) above the
  // closer but lower-rated Talegaon Tooling (3.9, 24 jobs, ~17 km).
  it('ranks the brackets job deterministically: Precision Works, Mumbai Metalcraft, Talegaon Tooling', async () => {
    const job = JOBS.find((j) => j.id === 'seed-job-alu-brackets')!;
    const first = await matchesFor(job.id, job.buyerId);
    const order = first.body.data.results.filter((r: { rank: number | null }) => r.rank !== null).map((r: { workshopId: string }) => r.workshopId);
    expect(order).toEqual(['seed-ws-precision-works', 'seed-ws-mumbai-metalcraft', 'seed-ws-talegaon-tooling']);

    // Repeated calls give the same ranking and scores.
    const second = await matchesFor(job.id, job.buyerId);
    const pick = (b: typeof first.body) => b.data.results.map((r: { workshopId: string; score: number | null; rank: number | null }) => [r.workshopId, r.score, r.rank]);
    expect(pick(second.body)).toEqual(pick(first.body));
  });

  it('excludes the PENDING Nashik workshop although it is nearest and meets every other rule', async () => {
    const job = JOBS.find((j) => j.id === 'seed-job-nashik-prototypes')!;
    const res = await matchesFor(job.id, job.buyerId);
    const nashik = res.body.data.results.find((r: { workshopId: string }) => r.workshopId === 'seed-ws-nashik-small-batch');
    expect(nashik).toMatchObject({ verificationStatus: 'PENDING', score: null, rank: null, eligibility: { eligible: false } });
    // Verification is its ONLY failing rule, and it is never presented as verified.
    expect(nashik.eligibility.reasons).toEqual([
      'Workshop is not yet verified (verification PENDING); only verified workshops are eligible',
    ]);
    expect(nashik.explanations).not.toContain('Verified workshop');
    // Every eligible result is VERIFIED.
    const eligible = res.body.data.results.filter((r: { eligibility: { eligible: boolean } }) => r.eligibility.eligible);
    expect(eligible.every((r: { verificationStatus: string }) => r.verificationStatus === 'VERIFIED')).toBe(true);
  });

  it('scores a workshop without coordinates on the remaining re-normalised weights', async () => {
    const job = JOBS.find((j) => j.id === 'seed-job-welded-frames')!;
    const res = await matchesFor(job.id, job.buyerId);
    const pimpri = res.body.data.results.find((r: { workshopId: string }) => r.workshopId === 'seed-ws-pimpri-steelworks');
    expect(pimpri).toMatchObject({ distanceKm: null, rank: 1, eligibility: { eligible: true } });
    expect(pimpri.scoreBreakdown.distanceScore).toBeNull();
    expect(pimpri.scoreBreakdown.effectiveWeights).toEqual({
      rating: 0.4375,
      capacityHeadroom: 0.3125,
      distance: 0,
      deadlineSlack: 0.1875,
      experience: 0.0625,
    });
  });

  it('every result carries the frontend-agreed fields', async () => {
    const res = await matchesFor('seed-job-alu-brackets', 'seed-user-buyer-asha');
    for (const r of res.body.data.results) {
      expect(r).toEqual(
        expect.objectContaining({
          jobId: 'seed-job-alu-brackets',
          workshopId: expect.any(String),
          verificationStatus: expect.stringMatching(/^(VERIFIED|PENDING|REJECTED)$/),
          explanations: expect.any(Array),
          eligibility: { eligible: expect.any(Boolean), reasons: expect.any(Array) },
        }),
      );
      if (r.eligibility.eligible) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        expect(r.eligibility.reasons).toEqual([]);
      } else {
        expect(r).toMatchObject({ score: null, rank: null, scoreBreakdown: null });
        expect(r.eligibility.reasons.length).toBeGreaterThan(0);
      }
    }
    expect(ALL_USERS.length).toBeGreaterThan(0);
  });
});
