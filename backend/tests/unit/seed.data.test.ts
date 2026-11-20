import { describe, expect, it } from 'vitest';
import {
  ADMINS,
  ALL_USERS,
  BUYERS,
  JOBS,
  SEED_EMAIL_DOMAIN,
  SEED_ID_PREFIX,
  WORKSHOPS,
} from '../../prisma/seed/data';
import { assertSeedAllowed, validateSeedPassword } from '../../prisma/seed/seeder';
import { jobRequirementSchema } from '../../src/validators/job.validator';
import { createCapabilitySchema, createMachineSchema } from '../../src/validators/workshop.validator';

const allIds = [
  ...ALL_USERS.map((u) => u.id),
  ...WORKSHOPS.flatMap((w) => [w.id, ...w.machines.map((m) => m.id), ...w.capabilities.map((c) => c.id), ...w.capacities.map((k) => k.id)]),
  ...JOBS.flatMap((j) => [j.id, ...j.requirements.map((r) => r.id)]),
];
const workshopIds = new Set(WORKSHOPS.map((w) => w.id));

describe('seed dataset integrity', () => {
  it('meets the minimum sizes', () => {
    expect(ADMINS.length).toBeGreaterThanOrEqual(1);
    expect(BUYERS.length).toBeGreaterThanOrEqual(4);
    expect(WORKSHOPS.length).toBeGreaterThanOrEqual(8);
    expect(JOBS.length).toBeGreaterThanOrEqual(8);
  });

  it('uses unique, seed-prefixed ids and reserved-domain emails', () => {
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.every((id) => id.startsWith(SEED_ID_PREFIX))).toBe(true);
    const emails = ALL_USERS.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
    expect(emails.every((e) => e.endsWith(`@${SEED_EMAIL_DOMAIN}`))).toBe(true);
  });

  it('references only existing buyers and workshops', () => {
    const buyerIds = new Set(BUYERS.map((b) => b.id));
    for (const j of JOBS) {
      expect(buyerIds.has(j.buyerId), j.id).toBe(true);
      for (const id of [...j.expected.eligible, ...Object.keys(j.expected.excluded)]) {
        expect(workshopIds.has(id), `${j.id} -> ${id}`).toBe(true);
      }
    }
    expect(WORKSHOPS.every((w) => w.owner.role === 'WORKSHOP')).toBe(true);
  });

  it('passes the same validation the API applies', () => {
    for (const w of WORKSHOPS) {
      for (const m of w.machines) expect(createMachineSchema.safeParse(m).success, m.id).toBe(true);
      for (const c of w.capabilities) {
        const { id: _id, ...input } = c;
        expect(createCapabilitySchema.safeParse(input).success, c.id).toBe(true);
      }
      expect(w.capabilities.length, w.id).toBe(new Set(w.capabilities.map((c) => c.manufacturingProcess)).size);
    }
    for (const j of JOBS) {
      for (const r of j.requirements) {
        const { id: _id, ...input } = r;
        const parsed = jobRequirementSchema.safeParse(input);
        expect(parsed.success, r.id).toBe(true);
        // Stored value is already in normalised form.
        expect(parsed.success && parsed.data.requirementValue).toBe(r.requirementValue);
      }
    }
  });

  it('has no overlapping capacity windows per workshop and unit', () => {
    for (const w of WORKSHOPS) {
      const windows = [...w.capacities].sort((a, b) => a.startDay - b.startDay);
      for (let i = 1; i < windows.length; i++) {
        const overlap = windows[i].capacityUnit === windows[i - 1].capacityUnit && windows[i].startDay <= windows[i - 1].endDay;
        expect(overlap, w.id).toBe(false);
      }
      expect(w.capacities.every((k) => k.endDay >= k.startDay)).toBe(true);
    }
  });

  it('covers every matching scenario needed for M7', () => {
    const statuses = new Set(WORKSHOPS.map((w) => w.verificationStatus));
    expect([...statuses].sort()).toEqual(['PENDING', 'REJECTED', 'VERIFIED']);

    // Different locations, including a workshop with no coordinates.
    expect(new Set(WORKSHOPS.map((w) => w.city)).size).toBeGreaterThanOrEqual(6);
    expect(WORKSHOPS.some((w) => w.latitude === null && w.longitude === null)).toBe(true);

    // A workshop whose machines are all non-operational.
    expect(WORKSHOPS.some((w) => w.machines.every((m) => m.operationalStatus !== 'OPERATIONAL'))).toBe(true);

    // A workshop whose only capacity is in the future.
    expect(WORKSHOPS.some((w) => w.capacities.every((k) => k.startDay > 30))).toBe(true);

    // Diverse processes, materials, certifications.
    expect(new Set(WORKSHOPS.flatMap((w) => w.capabilities.map((c) => c.manufacturingProcess))).size).toBeGreaterThanOrEqual(6);
    expect(new Set(WORKSHOPS.flatMap((w) => w.certifications)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(JOBS.map((j) => j.manufacturingProcess)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(JOBS.map((j) => j.material.toLowerCase())).size).toBeGreaterThanOrEqual(6);

    // Jobs: multiple / single / none eligible, DRAFT, no location, certification requirements.
    const eligibleCounts = JOBS.filter((j) => j.status === 'OPEN').map((j) => j.expected.eligible.length);
    expect(eligibleCounts.some((n) => n >= 3)).toBe(true);
    expect(eligibleCounts.some((n) => n === 1)).toBe(true);
    expect(eligibleCounts.some((n) => n === 0)).toBe(true);
    expect(JOBS.some((j) => j.status === 'DRAFT')).toBe(true);
    expect(JOBS.some((j) => j.latitude === null)).toBe(true);
    expect(JOBS.some((j) => j.requirements.some((r) => r.requirementType === 'CERTIFICATION'))).toBe(true);

    // Exclusion reasons represented.
    const reasons = JOBS.flatMap((j) => Object.values(j.expected.excluded)).join(' | ');
    for (const kind of ['certification', 'capacity', 'verification', 'machine', 'capability', 'deadline', 'material']) {
      expect(reasons, kind).toContain(kind);
    }
    // Only VERIFIED workshops may be expected eligible; a PENDING one is expected excluded somewhere.
    const statusById = new Map(WORKSHOPS.map((w) => [w.id, w.verificationStatus]));
    expect(JOBS.every((j) => j.expected.eligible.every((id) => statusById.get(id) === 'VERIFIED'))).toBe(true);
    const pendingIds = WORKSHOPS.filter((w) => w.verificationStatus === 'PENDING').map((w) => w.id);
    expect(JOBS.some((j) => pendingIds.some((id) => /PENDING/.test(j.expected.excluded[id] ?? '')))).toBe(true);
  });
});

describe('seed guards', () => {
  it('requires a seed password of 8-72 characters', () => {
    expect(() => validateSeedPassword(undefined)).toThrow(/SEED_DEFAULT_PASSWORD/);
    expect(() => validateSeedPassword('short')).toThrow();
    expect(validateSeedPassword('LongEnough1')).toBe('LongEnough1');
  });

  it('refuses production unless explicitly allowed', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(/production/);
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', SEED_ALLOW_PRODUCTION: 'true' })).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
  });
});
