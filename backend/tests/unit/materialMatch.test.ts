import { describe, expect, it } from 'vitest';
import { materialMatch } from '../../src/utils/normalize';
import { evaluateWorkshop, type MatchJobInput, type MatchWorkshopInput } from '../../src/services/matching/matchEngine';

/** M13 BUG-04: grades and forms of a supported material match; different materials do not. */
describe('materialMatch', () => {
  it.each([
    ['aluminium', 'aluminium', 'exact'],
    ['Aluminum', 'aluminium', 'exact'],
    ['  ALUMINIUM ', 'aluminium', 'exact'],
    ['ss', 'stainless steel', 'exact'],
  ] as const)('%s vs %s -> %s', (job, supported, expected) => expect(materialMatch(job, supported)).toBe(expected));

  it.each([
    ['Aluminium 6061', 'aluminium'],
    ['aluminium 6061-T6', 'aluminium'],
    ['Aluminum 7075', 'aluminium'],
    ['stainless steel 304', 'stainless steel'],
    ['Stainless Steel 316L', 'stainless steel'],
    ['SS 304', 'stainless steel'],
    ['mild steel sheet', 'mild steel'],
    ['MS plate', 'mild steel'],
    ['mild steel IS2062', 'mild steel'],
    ['brass rod', 'brass'],
    ['nylon 66', 'nylon'],
    ['cast iron grade 20', 'cast iron'],
  ])('%s is a grade or form of %s', (job, supported) => expect(materialMatch(job, supported)).toBe('variant'));

  it.each([
    ['titanium', 'aluminium'],
    ['stainless steel', 'mild steel'],
    ['stainless steel 304', 'mild steel'],
    ['mild steel', 'stainless steel'],
    ['steel', 'mild steel'],
    ['stainless steel', 'steel'],        // a different material, not a grade of "steel"
    ['aluminium bronze', 'aluminium'],   // an alloy family of its own
    ['aluminiumx 6061', 'aluminium'],    // no word boundary
    ['', 'aluminium'],
  ])('%s does not match %s', (job, supported) => expect(materialMatch(job, supported)).toBeNull());
});

describe('matching eligibility with material grades', () => {
  const NOW = new Date('2026-11-20T00:00:00.000Z');
  const job = (material: string): MatchJobInput => ({
    id: 'job-1', material, manufacturingProcess: 'CNC_MACHINING', quantity: 100, quantityUnit: 'UNITS',
    deadline: new Date(NOW.getTime() + 30 * 86_400_000), latitude: null, longitude: null, requirements: [],
  } as unknown as MatchJobInput);
  const ws = (): MatchWorkshopInput => ({
    id: 'ws-1', businessName: 'W', city: 'Pune', latitude: null, longitude: null, verificationStatus: 'VERIFIED',
    rating: 4.5, ratingCount: 10, totalCompletedJobs: 5, certifications: [],
    capabilities: [{ manufacturingProcess: 'CNC_MACHINING', supportedMaterials: ['aluminium', 'mild steel'], leadTimeDays: 2 }],
    machines: [{ machineType: 'CNC_MILL', operationalStatus: 'OPERATIONAL', quantity: 1 }],
    capacities: [{ availableCapacity: 1000, capacityUnit: 'UNITS', startDate: NOW, endDate: new Date(NOW.getTime() + 60 * 86_400_000) }],
  } as unknown as MatchWorkshopInput);
  const run = (material: string) => evaluateWorkshop(job(material), ws(), { now: NOW } as never);

  it('"aluminium 6061" is eligible at an aluminium workshop and the reason says why', () => {
    const r = run('aluminium 6061');
    expect(r.eligibility.eligible).toBe(true);
    expect(r.explanations).toContain('Supports aluminium for CNC_MACHINING (aluminium 6061 is a grade or form of aluminium)');
  });
  it('an unsupported material is still excluded', () => {
    const r = run('stainless steel 304');
    expect(r.eligibility.eligible).toBe(false);
    expect(r.eligibility.reasons.join(' ')).toMatch(/Does not support stainless steel 304/);
  });
  it('distance is reported honestly when the job has no coordinates', () => {
    expect(run('aluminium').explanations).toContain('Distance not scored: the job has no map coordinates (a delivery city and state are not converted to coordinates)');
  });
});
