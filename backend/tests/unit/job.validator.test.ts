import { describe, expect, it } from 'vitest';
import { createJobSchema, updateJobSchema } from '../../src/validators/job.validator';

const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

const valid = {
  title: 'Aluminium brackets',
  material: ' Aluminum ',
  manufacturingProcess: 'CNC_MACHINING',
  quantity: 500,
  deadline: daysAhead(30),
};

const issues = (r: { success: boolean; error?: { issues: { path: (string | number)[]; message: string }[] } }) =>
  r.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? [];

describe('createJobSchema', () => {
  it('accepts a minimal valid job and applies defaults + normalisation', () => {
    const r = createJobSchema.parse(valid);
    expect(r).toMatchObject({ material: 'aluminium', quantityUnit: 'UNITS', status: 'OPEN', requirements: [] });
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['fractional', 2.5],
    ['string', '100'],
  ])('rejects %s quantity', (_label, quantity) => {
    expect(createJobSchema.safeParse({ ...valid, quantity }).success).toBe(false);
  });

  it('rejects a deadline in the past', () => {
    expect(createJobSchema.safeParse({ ...valid, deadline: '2020-01-01' }).success).toBe(false);
  });

  it('rejects a deadline less than 24 hours ahead', () => {
    const r = createJobSchema.safeParse({ ...valid, deadline: new Date(Date.now() + 2 * 3_600_000).toISOString() });
    expect(issues(r).join()).toMatch(/at least 24 hours/);
  });

  it('rejects a deadline more than 730 days ahead', () => {
    expect(createJobSchema.safeParse({ ...valid, deadline: daysAhead(800) }).success).toBe(false);
  });

  it('rejects an unparseable deadline', () => {
    expect(createJobSchema.safeParse({ ...valid, deadline: 'next friday' }).success).toBe(false);
  });

  it('treats a date-only deadline as end of that day', () => {
    const date = daysAhead(10).slice(0, 10);
    expect(createJobSchema.parse({ ...valid, deadline: date }).deadline.toISOString()).toBe(`${date}T23:59:59.999Z`);
  });

  it('rejects system-managed and unsupported fields (buyerId, status MATCHED, budget)', () => {
    expect(createJobSchema.safeParse({ ...valid, buyerId: 'someone-else' }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...valid, status: 'MATCHED' }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...valid, budget: 50000 }).success).toBe(false);
  });

  it('requires coordinates as a pair', () => {
    expect(createJobSchema.safeParse({ ...valid, latitude: 18.5 }).success).toBe(false);
  });
});

describe('job requirements', () => {
  const withReqs = (requirements: unknown[]) => createJobSchema.safeParse({ ...valid, requirements });

  it('normalises each requirement by type', () => {
    const r = createJobSchema.parse({
      ...valid,
      requirements: [
        { requirementType: 'MACHINE_TYPE', requirementValue: 'cnc_mill' },
        { requirementType: 'TOLERANCE_MM', requirementValue: '0.05' },
        { requirementType: 'PART_SIZE_MM', requirementValue: 450 },
        { requirementType: 'CERTIFICATION', requirementValue: 'iso 9001', isMandatory: false },
        { requirementType: 'OTHER', requirementValue: ' Anodised finish ' },
      ],
    });
    expect(r.requirements.map((x) => [x.requirementType, x.requirementValue, x.isMandatory])).toEqual([
      ['MACHINE_TYPE', 'CNC_MILL', true],
      ['TOLERANCE_MM', '0.05', true],
      ['PART_SIZE_MM', '450', true],
      ['CERTIFICATION', 'ISO_9001', false],
      ['OTHER', 'Anodised finish', true],
    ]);
  });

  it('rejects an unknown machine type', () => {
    expect(withReqs([{ requirementType: 'MACHINE_TYPE', requirementValue: 'WARP_DRIVE' }]).success).toBe(false);
  });

  it.each(['0', '-1', 'abc', ''])('rejects non-positive / non-numeric tolerance "%s"', (v) => {
    expect(withReqs([{ requirementType: 'TOLERANCE_MM', requirementValue: v }]).success).toBe(false);
  });

  it('rejects an unknown requirement type', () => {
    expect(withReqs([{ requirementType: 'COLOUR', requirementValue: 'red' }]).success).toBe(false);
  });

  it('rejects two TOLERANCE_MM requirements', () => {
    const r = withReqs([
      { requirementType: 'TOLERANCE_MM', requirementValue: 0.1 },
      { requirementType: 'TOLERANCE_MM', requirementValue: 0.2 },
    ]);
    expect(issues(r).join()).toMatch(/Only one TOLERANCE_MM/);
  });

  it('rejects duplicate certification after normalisation', () => {
    const r = withReqs([
      { requirementType: 'CERTIFICATION', requirementValue: 'ISO 9001' },
      { requirementType: 'CERTIFICATION', requirementValue: 'iso-9001' },
    ]);
    expect(issues(r).join()).toMatch(/Duplicate requirement/);
  });

  it('allows two different machine types', () => {
    expect(
      withReqs([
        { requirementType: 'MACHINE_TYPE', requirementValue: 'CNC_MILL' },
        { requirementType: 'MACHINE_TYPE', requirementValue: 'CNC_LATHE' },
      ]).success,
    ).toBe(true);
  });

  it('rejects more than 20 requirements', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ requirementType: 'OTHER', requirementValue: `note ${i}` }));
    expect(withReqs(many).success).toBe(false);
  });
});

describe('updateJobSchema', () => {
  it('rejects an empty update', () => {
    expect(updateJobSchema.safeParse({}).success).toBe(false);
  });

  it('only allows buyer-settable statuses', () => {
    expect(updateJobSchema.safeParse({ status: 'CANCELLED' }).success).toBe(true);
    expect(updateJobSchema.safeParse({ status: 'MATCHED' }).success).toBe(false);
    expect(updateJobSchema.safeParse({ status: 'COMPLETED' }).success).toBe(false);
  });

  it('rejects ownership and system fields', () => {
    for (const field of ['buyerId', 'matchedAt', 'createdAt', 'id']) {
      expect(updateJobSchema.safeParse({ [field]: 'x' }).success, field).toBe(false);
    }
  });
});
