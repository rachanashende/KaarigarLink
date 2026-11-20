import { describe, expect, it } from 'vitest';
import { distanceBetween, hasValidCoordinates, haversineKm } from '../../src/services/matching/distance';
import { capacityBetween, productionFinishDate } from '../../src/services/matching/capacity';
import {
  evaluateWorkshop,
  matchWorkshops,
  type MatchJobInput,
  type MatchWorkshopInput,
} from '../../src/services/matching/matchEngine';

const DAY = 86_400_000;
const NOW = new Date('2026-11-20T00:00:00.000Z');
const day = (n: number) => new Date(NOW.getTime() + n * DAY);
const PUNE = { latitude: 18.5204, longitude: 73.8567 };
const MUMBAI = { latitude: 19.076, longitude: 72.8777 };

function job(overrides: Partial<MatchJobInput> = {}): MatchJobInput {
  return {
    id: 'job-1',
    material: 'aluminium',
    manufacturingProcess: 'CNC_MACHINING',
    quantity: 500,
    quantityUnit: 'UNITS',
    deadline: day(30),
    ...PUNE,
    requirements: [],
    ...overrides,
  };
}

/** A workshop that satisfies the default job. */
function workshop(overrides: Partial<MatchWorkshopInput> = {}): MatchWorkshopInput {
  return {
    id: 'ws-a',
    businessName: 'Alpha Works',
    city: 'Pune',
    latitude: 18.6,
    longitude: 73.85,
    certifications: ['ISO_9001'],
    verificationStatus: 'VERIFIED',
    rating: 4.5,
    ratingCount: 10,
    totalCompletedJobs: 10,
    machines: [{ machineType: 'CNC_MILL', quantity: 2, operationalStatus: 'OPERATIONAL' }],
    capabilities: [
      {
        manufacturingProcess: 'CNC_MACHINING',
        supportedMaterials: ['aluminium', 'mild steel'],
        specifications: { minToleranceMm: 0.02, maxPartSizeMm: 500 },
        leadTimeDays: 2,
      },
    ],
    capacities: [{ availableCapacity: 3000, capacityUnit: 'UNITS', startDate: day(0), endDate: day(30) }],
    ...overrides,
  };
}

const evaluate = (j: MatchJobInput, w: MatchWorkshopInput, extra: { maxDistanceKm?: number } = {}) =>
  evaluateWorkshop(j, w, { now: NOW, ...extra });
const reasons = (r: { eligibility: { reasons: string[] } }) => r.eligibility.reasons.join(' | ');

describe('distance', () => {
  it('computes Haversine distance (Pune to Mumbai is about 120 km)', () => {
    expect(haversineKm(PUNE, MUMBAI)).toBeGreaterThan(115);
    expect(haversineKm(PUNE, MUMBAI)).toBeLessThan(125);
    expect(haversineKm(PUNE, PUNE)).toBe(0);
  });

  it('is symmetric', () => {
    expect(haversineKm(PUNE, MUMBAI)).toBeCloseTo(haversineKm(MUMBAI, PUNE), 9);
  });

  it('treats missing or invalid coordinates as unknown', () => {
    expect(hasValidCoordinates({ latitude: null, longitude: 73 })).toBe(false);
    expect(hasValidCoordinates({ latitude: Number.NaN, longitude: 73 })).toBe(false);
    expect(hasValidCoordinates({ latitude: 91, longitude: 73 })).toBe(false);
    expect(hasValidCoordinates({ latitude: 18, longitude: -181 })).toBe(false);
    expect(distanceBetween(PUNE, { latitude: null, longitude: null })).toBeNull();
  });
});

describe('capacity', () => {
  const windows = [{ availableCapacity: 300, capacityUnit: 'UNITS' as const, startDate: day(0), endDate: day(30) }];

  it('pro-rates capacity by overlap with the time window', () => {
    expect(capacityBetween(windows, 'UNITS', day(0), day(30))).toBeCloseTo(300, 6);
    expect(capacityBetween(windows, 'UNITS', day(0), day(15))).toBeCloseTo(150, 6);
    expect(capacityBetween(windows, 'UNITS', day(10), day(40))).toBeCloseTo(200, 6);
  });

  it('ignores windows outside the period and windows in another unit', () => {
    expect(capacityBetween(windows, 'UNITS', day(31), day(60))).toBe(0);
    expect(capacityBetween(windows, 'KG', day(0), day(30))).toBe(0);
  });

  it('finds the production finish date across consecutive windows', () => {
    const two = [
      { availableCapacity: 100, capacityUnit: 'UNITS' as const, startDate: day(0), endDate: day(10) },
      { availableCapacity: 100, capacityUnit: 'UNITS' as const, startDate: day(20), endDate: day(30) },
    ];
    expect(productionFinishDate(two, 'UNITS', 50, NOW)!.getTime()).toBe(day(5).getTime());
    expect(productionFinishDate(two, 'UNITS', 150, NOW)!.getTime()).toBe(day(25).getTime());
    expect(productionFinishDate(two, 'UNITS', 201, NOW)).toBeNull();
  });

  it('finishes exactly at the window end when the window holds exactly the quantity', () => {
    const one = [{ availableCapacity: 500, capacityUnit: 'UNITS' as const, startDate: day(0), endDate: new Date(day(31).getTime() - 1) }];
    expect(productionFinishDate(one, 'UNITS', 500, NOW)).not.toBeNull();
  });
});

describe('eligibility', () => {
  it('a fully compatible workshop is eligible, scored 0-100 and explained', () => {
    const r = evaluate(job(), workshop());
    expect(r.eligibility).toEqual({ eligible: true, reasons: [] });
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.scoreBreakdown).toMatchObject({
      weights: { rating: 0.35, capacityHeadroom: 0.25, distance: 0.2, deadlineSlack: 0.15, experience: 0.05 },
    });
    expect(r.explanations).toEqual(
      expect.arrayContaining(['Verified workshop', 'Offers CNC_MACHINING', 'Supports aluminium for CNC_MACHINING']),
    );
    expect(r.estimatedCompletion).not.toBeNull();
  });

  it('excludes a workshop without the process capability', () => {
    const r = evaluate(job(), workshop({ capabilities: [] }));
    expect(r.eligibility.eligible).toBe(false);
    expect(reasons(r)).toMatch(/No CNC_MACHINING capability/);
    expect(r.score).toBeNull();
  });

  it('excludes an incompatible material and lists supported materials', () => {
    const r = evaluate(job({ material: 'titanium' }), workshop());
    expect(reasons(r)).toMatch(/Does not support titanium .*aluminium, mild steel/);
  });

  it('normalises material aliases (Aluminum == aluminium)', () => {
    expect(evaluate(job({ material: 'Aluminum' }), workshop()).eligibility.eligible).toBe(true);
  });

  it('excludes a workshop without any suitable machine', () => {
    const r = evaluate(job(), workshop({ machines: [{ machineType: 'LASER_CUTTER', quantity: 1, operationalStatus: 'OPERATIONAL' }] }));
    expect(reasons(r)).toMatch(/No machine suitable for CNC_MACHINING/);
  });

  it('excludes a workshop whose suitable machines are not operational', () => {
    const r = evaluate(job(), workshop({ machines: [{ machineType: 'CNC_MILL', quantity: 3, operationalStatus: 'MAINTENANCE' }] }));
    expect(reasons(r)).toMatch(/No operational machine for CNC_MACHINING \(CNC_MILL MAINTENANCE\)/);
  });

  it('enforces a mandatory MACHINE_TYPE requirement', () => {
    const j = job({ requirements: [{ requirementType: 'MACHINE_TYPE', requirementValue: 'CNC_LATHE', isMandatory: true }] });
    expect(reasons(evaluate(j, workshop()))).toMatch(/No CNC_LATHE machine/);
  });

  it('enforces tolerance: looser, or not specified, excludes', () => {
    const tight = job({ requirements: [{ requirementType: 'TOLERANCE_MM', requirementValue: '0.01', isMandatory: true }] });
    expect(reasons(evaluate(tight, workshop()))).toMatch(/±0.02 mm is looser than required ±0.01 mm/);
    const unspecified = workshop({
      capabilities: [{ manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium'], specifications: null, leadTimeDays: 0 }],
    });
    expect(reasons(evaluate(tight, unspecified))).toMatch(/Tolerance not specified/);
    const ok = job({ requirements: [{ requirementType: 'TOLERANCE_MM', requirementValue: '0.05', isMandatory: true }] });
    expect(evaluate(ok, workshop()).eligibility.eligible).toBe(true);
  });

  it('enforces part size', () => {
    const big = job({ requirements: [{ requirementType: 'PART_SIZE_MM', requirementValue: '800', isMandatory: true }] });
    expect(reasons(evaluate(big, workshop()))).toMatch(/Maximum part size 500 mm is smaller than required 800 mm/);
  });

  it('enforces certification with normalisation', () => {
    const iso = job({ requirements: [{ requirementType: 'CERTIFICATION', requirementValue: 'iso 9001', isMandatory: true }] });
    expect(evaluate(iso, workshop()).eligibility.eligible).toBe(true);
    const as = job({ requirements: [{ requirementType: 'CERTIFICATION', requirementValue: 'AS9100', isMandatory: true }] });
    expect(reasons(evaluate(as, workshop()))).toMatch(/Lacks required AS9100 certification/);
  });

  it('optional requirements never exclude but are explained', () => {
    const j = job({ requirements: [{ requirementType: 'CERTIFICATION', requirementValue: 'AS9100', isMandatory: false }] });
    const r = evaluate(j, workshop());
    expect(r.eligibility.eligible).toBe(true);
    expect(r.explanations).toContain('Optional requirement not met: Lacks required AS9100 certification');
  });

  it('ignores OTHER requirements for filtering', () => {
    const j = job({ requirements: [{ requirementType: 'OTHER', requirementValue: 'Deburr edges', isMandatory: true }] });
    expect(evaluate(j, workshop()).eligibility.eligible).toBe(true);
  });

  it('excludes REJECTED workshops even if otherwise perfect', () => {
    const r = evaluate(job(), workshop({ verificationStatus: 'REJECTED' }));
    expect(r.eligibility).toEqual({ eligible: false, reasons: ['Workshop verification was rejected by an admin'] });
    expect(r.verificationStatus).toBe('REJECTED');
  });

  it('excludes PENDING workshops even if otherwise perfect, and never labels them verified', () => {
    const r = evaluate(job(), workshop({ verificationStatus: 'PENDING' }));
    expect(r.eligibility).toEqual({
      eligible: false,
      reasons: ['Workshop is not yet verified (verification PENDING); only verified workshops are eligible'],
    });
    expect(r).toMatchObject({ verificationStatus: 'PENDING', score: null, scoreBreakdown: null });
    expect(r.explanations).not.toContain('Verified workshop');
  });

  it('only VERIFIED workshops are eligible', () => {
    const statuses = ['VERIFIED', 'PENDING', 'REJECTED'] as const;
    expect(statuses.map((s) => evaluate(job(), workshop({ verificationStatus: s })).eligibility.eligible)).toEqual([true, false, false]);
  });

  it('excludes insufficient capacity in the job window', () => {
    const r = evaluate(job(), workshop({ capacities: [{ availableCapacity: 400, capacityUnit: 'UNITS', startDate: day(0), endDate: day(30) }] }));
    expect(reasons(r)).toMatch(/Insufficient capacity: about 400 UNITS free before the deadline, job needs 500 UNITS/);
  });

  it('excludes capacity that only exists after the deadline, naming the next window', () => {
    const r = evaluate(job(), workshop({ capacities: [{ availableCapacity: 9999, capacityUnit: 'UNITS', startDate: day(40), endDate: day(60) }] }));
    expect(reasons(r)).toMatch(/next capacity window starts 2026-12-30/);
  });

  it('does not count capacity in a different unit', () => {
    const r = evaluate(job(), workshop({ capacities: [{ availableCapacity: 9999, capacityUnit: 'KG', startDate: day(0), endDate: day(30) }] }));
    expect(reasons(r)).toMatch(/No free UNITS capacity/);
  });

  it('excludes a workshop that cannot finish before the deadline (lead time)', () => {
    const slow = workshop({
      capabilities: [{ manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium'], specifications: {}, leadTimeDays: 26 }],
    });
    // 500 of 3000 units over 30 days = 5 days production + 26 days lead > 30-day deadline.
    const r = evaluate(job(), slow);
    expect(reasons(r)).toMatch(/Cannot meet deadline: estimated completion .* incl. 26-day lead time/);
  });

  it('finishing exactly on the deadline counts as on time', () => {
    const exact = workshop({
      capabilities: [{ manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium'], specifications: {}, leadTimeDays: 25 }],
    });
    expect(evaluate(job(), exact).eligibility.eligible).toBe(true);
  });

  it('excludes everyone when the deadline has passed', () => {
    expect(reasons(evaluate(job({ deadline: day(-1) }), workshop()))).toMatch(/deadline has already passed/);
  });

  it('reports every failure, not just the first', () => {
    const r = evaluate(job({ material: 'titanium' }), workshop({ verificationStatus: 'REJECTED', machines: [] }));
    expect(r.eligibility.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe('distance handling in matching', () => {
  // Without distance the other weights (0.8 in total) are scaled to sum to 1.
  const RENORMALISED = { rating: 0.4375, capacityHeadroom: 0.3125, distance: 0, deadlineSlack: 0.1875, experience: 0.0625 };

  it('job without a location: eligible, distance omitted and weights re-normalised', () => {
    const r = evaluate(job({ latitude: null, longitude: null }), workshop());
    expect(r.eligibility.eligible).toBe(true);
    expect(r.distanceKm).toBeNull();
    expect(r.scoreBreakdown).toMatchObject({ distanceScore: null, effectiveWeights: RENORMALISED });
    expect(r.explanations).toContain('Job has no location, so distance is not scored');
  });

  it('workshop without a location: eligible, distance omitted and weights re-normalised', () => {
    const r = evaluate(job(), workshop({ latitude: null, longitude: null }));
    expect(r.eligibility.eligible).toBe(true);
    expect(r.scoreBreakdown).toMatchObject({ distanceScore: null, effectiveWeights: RENORMALISED });
    expect(r.explanations).toContain('Workshop has no location on its profile, so distance is not scored');
  });

  it('treats invalid coordinates like missing ones (never excluded)', () => {
    const r = evaluate(job(), workshop({ latitude: Number.NaN, longitude: 200 }));
    expect(r.eligibility.eligible).toBe(true);
    expect(r.distanceKm).toBeNull();
  });

  it('re-normalised score = weighted sum of the other four factors / 0.8', () => {
    // rating 90, headroom 100, slack 76.67, experience 60.99:
    // (0.35*90 + 0.25*100 + 0.15*76.67 + 0.05*60.99) / 0.8 = 88.8
    const r = evaluate(job(), workshop({ latitude: null, longitude: null }));
    expect(r.score).toBe(88.8);
    const w = r.scoreBreakdown!.effectiveWeights;
    expect(w.rating + w.capacityHeadroom + w.distance + w.deadlineSlack + w.experience).toBeCloseTo(1, 9);
  });

  it('maxDistanceKm excludes farther workshops but never ones with unknown distance', () => {
    expect(reasons(evaluate(job(), workshop(MUMBAI), { maxDistanceKm: 50 }))).toMatch(/beyond the 50 km limit/);
    const unknown = evaluate(job(), workshop({ latitude: null, longitude: null }), { maxDistanceKm: 50 });
    expect(unknown.eligibility.eligible).toBe(true);
    expect(unknown.explanations).toContain('Distance unknown (no workshop location), so the 50 km limit was not applied');
    expect(evaluate(job(), workshop(), { maxDistanceKm: 50 }).eligibility.eligible).toBe(true);
  });

  it('a workshop beyond the zero-score distance is still eligible with distance score 0', () => {
    const far = workshop({ latitude: 28.6, longitude: 77.2 }); // Delhi
    const r = evaluate(job(), far);
    expect(r.eligibility.eligible).toBe(true);
    expect(r.scoreBreakdown!.distanceScore).toBe(0);
  });
});

describe('scoring (five factors)', () => {
  it('applies rating 35% + headroom 25% + distance 20% + deadline slack 15% + experience 5%', () => {
    // Workshop at the job location: distance 0 km -> 100; rating 4.5 -> 90;
    // 3000 units vs 500 needed -> headroom capped 100;
    // 100 units/day -> 5 days + 2-day lead time = day 7 of 30 -> slack 23/30 = 76.67;
    // 10 completed jobs -> ln(11)/ln(51) = 60.99.
    const r = evaluate(job(), workshop({ ...PUNE }));
    expect(r.scoreBreakdown).toMatchObject({
      ratingScore: 90,
      capacityHeadroomScore: 100,
      distanceScore: 100,
      deadlineSlackScore: 76.7,
      experienceScore: 61,
      effectiveWeights: { rating: 0.35, capacityHeadroom: 0.25, distance: 0.2, deadlineSlack: 0.15, experience: 0.05 },
    });
    // 31.5 + 25 + 20 + 11.5 + 3.05 = 91.05 -> 91
    expect(r.score).toBe(91);
  });

  it('gives unrated workshops a neutral rating score of 60 and caps ratings at 0-100', () => {
    expect(evaluate(job(), workshop({ rating: 0, ratingCount: 0 })).scoreBreakdown!.ratingScore).toBe(60);
    expect(evaluate(job(), workshop({ rating: 5, ratingCount: 3 })).scoreBreakdown!.ratingScore).toBe(100);
  });

  it('capacity headroom: exactly enough = 0, 1.5x = 50, 2x or more = 100', () => {
    const withCapacity = (units: number) =>
      evaluate(
        job(),
        workshop({
          capacities: [{ availableCapacity: units, capacityUnit: 'UNITS', startDate: day(0), endDate: day(30) }],
          capabilities: [{ manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium'], specifications: {}, leadTimeDays: 0 }],
        }),
      );
    const exact = withCapacity(500);
    // Exactly enough capacity is still eligible (no floating-point under-count).
    expect(exact.eligibility.eligible).toBe(true);
    expect(exact.availableCapacity).toBe(500);
    expect(exact.scoreBreakdown!.capacityHeadroomScore).toBe(0);
    expect(withCapacity(750).scoreBreakdown!.capacityHeadroomScore).toBe(50);
    expect(withCapacity(1000).scoreBreakdown!.capacityHeadroomScore).toBe(100);
    expect(withCapacity(9000).scoreBreakdown!.capacityHeadroomScore).toBe(100);
  });

  it('deadline slack: finishing on the deadline = 0, more spare time = higher', () => {
    const lead = (days: number) =>
      workshop({
        capabilities: [{ manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium'], specifications: {}, leadTimeDays: days }],
      });
    // 5 days production + 25 lead = day 30 = deadline -> slack 0.
    expect(evaluate(job(), lead(25)).scoreBreakdown!.deadlineSlackScore).toBe(0);
    // 5 days production + 0 lead -> 25/30 spare.
    expect(evaluate(job(), lead(0)).scoreBreakdown!.deadlineSlackScore).toBe(83.3);
    expect(evaluate(job(), lead(0)).explanations.join(' ')).toMatch(/25 days before the 2026-12-20 deadline/);
  });

  it('experience: log scale, 0 jobs = 0, 50+ jobs = 100, monotonic', () => {
    const exp = (n: number) => evaluate(job(), workshop({ totalCompletedJobs: n })).scoreBreakdown!.experienceScore;
    expect(exp(0)).toBe(0);
    expect(exp(50)).toBe(100);
    expect(exp(500)).toBe(100);
    const series = [0, 1, 5, 10, 25, 50].map(exp);
    expect([...series].sort((a, b) => a - b)).toEqual(series);
    expect(exp(5)).toBeGreaterThan(exp(1));
  });

  it('does not give verification any ranking points (it is a filter only)', () => {
    const r = evaluate(job(), workshop());
    expect(Object.keys(r.scoreBreakdown!.weights).sort()).toEqual(['capacityHeadroom', 'deadlineSlack', 'distance', 'experience', 'rating']);
  });

  it('every eligible score stays within 0-100', () => {
    for (const ws of [workshop(), workshop({ rating: 5, ratingCount: 99, totalCompletedJobs: 999, ...PUNE }), workshop({ rating: 0.5, ratingCount: 1, totalCompletedJobs: 0, latitude: 28.6, longitude: 77.2 })]) {
      const score = evaluate(job(), ws).score!;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe('ranking', () => {
  const near = workshop({ id: 'ws-near', businessName: 'Near', ...PUNE, rating: 4, ratingCount: 5 });
  const mid = workshop({ id: 'ws-mid', businessName: 'Mid', latitude: 18.75, longitude: 73.86, rating: 4, ratingCount: 5 });
  const far = workshop({ id: 'ws-far', businessName: 'Far', ...MUMBAI, rating: 4, ratingCount: 5 });
  const rejected = workshop({ id: 'ws-rej', businessName: 'Rejected', verificationStatus: 'REJECTED' });
  const incapable = workshop({ id: 'ws-inc', businessName: 'Incapable', capabilities: [] });

  it('ranks eligible workshops by score, then lists excluded ones by name', () => {
    const results = matchWorkshops(job(), [far, rejected, mid, incapable, near], { now: NOW });
    expect(results.map((r) => r.workshopId)).toEqual(['ws-near', 'ws-mid', 'ws-far', 'ws-inc', 'ws-rej']);
    expect(results.map((r) => r.rank)).toEqual([1, 2, 3, null, null]);
    const scores = results.filter((r) => r.score !== null).map((r) => r.score!);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('is deterministic regardless of input order', () => {
    const a = matchWorkshops(job(), [near, mid, far, rejected, incapable], { now: NOW });
    const b = matchWorkshops(job(), [incapable, far, rejected, near, mid], { now: NOW });
    expect(b).toEqual(a);
  });

  it('breaks score ties by distance, then by name and id', () => {
    const twinA = workshop({ id: 'ws-2', businessName: 'Twin', ...PUNE });
    const twinB = workshop({ id: 'ws-1', businessName: 'Twin', ...PUNE });
    const nearer = workshop({ id: 'ws-3', businessName: 'Zed', latitude: 18.5205, longitude: 73.8567 });
    const results = matchWorkshops(job(), [twinA, nearer, twinB], { now: NOW });
    expect(results[0].score).toBe(results[1].score);
    expect(results.map((r) => r.workshopId)).toEqual(['ws-1', 'ws-2', 'ws-3']);
  });

  it('returns no eligible matches when nothing qualifies', () => {
    const results = matchWorkshops(job(), [rejected, incapable], { now: NOW });
    expect(results.every((r) => !r.eligibility.eligible && r.score === null && r.rank === null)).toBe(true);
  });

  it('handles an empty workshop list', () => {
    expect(matchWorkshops(job(), [], { now: NOW })).toEqual([]);
  });
});
