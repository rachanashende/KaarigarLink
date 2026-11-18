import { describe, expect, it } from 'vitest';
import {
  createCapabilitySchema,
  createCapacitySchema,
  createMachineSchema,
  updateWorkshopSchema,
} from '../../src/validators/workshop.validator';
import { normalizeCertifications, normalizeMaterials } from '../../src/utils/normalize';

describe('normalize helpers', () => {
  it('normalises, aliases and de-duplicates materials', () => {
    expect(normalizeMaterials([' Aluminum', 'ALUMINIUM', 'Mild  Steel', 'ss'])).toEqual([
      'aluminium',
      'mild steel',
      'stainless steel',
    ]);
  });

  it('normalises certifications', () => {
    expect(normalizeCertifications(['iso 9001', 'ISO-9001', 'as9100'])).toEqual(['ISO_9001', 'AS9100']);
  });
});

describe('createCapacitySchema', () => {
  it('treats a date-only endDate as end of that day (inclusive)', () => {
    const r = createCapacitySchema.parse({ availableCapacity: 100, startDate: '2099-01-01', endDate: '2099-01-31' });
    expect(r.startDate.toISOString()).toBe('2099-01-01T00:00:00.000Z');
    expect(r.endDate.toISOString()).toBe('2099-01-31T23:59:59.999Z');
    expect(r.capacityUnit).toBe('UNITS');
  });

  it('rejects endDate before startDate', () => {
    expect(
      createCapacitySchema.safeParse({ availableCapacity: 10, startDate: '2099-02-01', endDate: '2099-01-01' }).success,
    ).toBe(false);
  });

  it('rejects windows entirely in the past', () => {
    expect(
      createCapacitySchema.safeParse({ availableCapacity: 10, startDate: '2020-01-01', endDate: '2020-01-31' }).success,
    ).toBe(false);
  });

  it('rejects zero or negative capacity', () => {
    expect(
      createCapacitySchema.safeParse({ availableCapacity: 0, startDate: '2099-01-01', endDate: '2099-01-02' }).success,
    ).toBe(false);
  });

  it('rejects invalid date strings', () => {
    expect(
      createCapacitySchema.safeParse({ availableCapacity: 5, startDate: 'tomorrow', endDate: '2099-01-02' }).success,
    ).toBe(false);
  });
});

describe('machine & capability schemas', () => {
  it('defaults machine quantity and status', () => {
    const r = createMachineSchema.parse({ machineName: 'Haas VF-2', machineType: 'CNC_MILL' });
    expect(r).toMatchObject({ quantity: 1, operationalStatus: 'OPERATIONAL' });
  });

  it('rejects unknown machine type', () => {
    expect(createMachineSchema.safeParse({ machineName: 'X', machineType: 'TIME_MACHINE' }).success).toBe(false);
  });

  it('requires at least one material for a capability', () => {
    expect(
      createCapabilitySchema.safeParse({ manufacturingProcess: 'CNC_MACHINING', supportedMaterials: [] }).success,
    ).toBe(false);
  });

  it('validates known capability spec keys and keeps extra keys', () => {
    const ok = createCapabilitySchema.parse({
      manufacturingProcess: 'CNC_MACHINING',
      supportedMaterials: ['aluminium'],
      specifications: { minToleranceMm: 0.01, finish: 'anodised' },
    });
    expect(ok.specifications).toMatchObject({ minToleranceMm: 0.01, finish: 'anodised' });
    expect(
      createCapabilitySchema.safeParse({
        manufacturingProcess: 'CNC_MACHINING',
        supportedMaterials: ['aluminium'],
        specifications: { minToleranceMm: -1 },
      }).success,
    ).toBe(false);
  });
});

describe('updateWorkshopSchema', () => {
  it('rejects an empty update', () => {
    expect(updateWorkshopSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown/protected fields such as rating', () => {
    expect(updateWorkshopSchema.safeParse({ rating: 5 }).success).toBe(false);
  });

  it('allows clearing coordinates with both null', () => {
    expect(updateWorkshopSchema.safeParse({ latitude: null, longitude: null }).success).toBe(true);
    expect(updateWorkshopSchema.safeParse({ latitude: null }).success).toBe(false);
  });
});
