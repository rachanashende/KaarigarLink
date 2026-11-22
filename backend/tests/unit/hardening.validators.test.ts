import { describe, expect, it } from 'vitest';
import {
  assignInspectorBodySchema,
  assignedOrdersQuery,
  createInspectionBodySchema,
  listInspectionsQuery,
} from '../../src/validators/inspection.validator';
import { createPaymentBodySchema, simulatePaymentBodySchema } from '../../src/validators/payment.validator';
import { ratingHistoryQuery, submitRatingBodySchema } from '../../src/validators/rating.validator';

describe('B1 assignment validators', () => {
  it('assign body: trimmed inspectorId required, nothing else', () => {
    expect(assignInspectorBodySchema.parse({ inspectorId: '  insp-1 ' })).toEqual({ inspectorId: 'insp-1' });
    for (const body of [{}, { inspectorId: '' }, { inspectorId: '   ' }, { inspectorId: 7 }, { inspectorId: 'x', active: true }]) {
      expect(assignInspectorBodySchema.safeParse(body).success).toBe(false);
    }
  });

  it('list queries coerce and bound page/limit and reject unknown keys', () => {
    expect(listInspectionsQuery.parse({})).toEqual({ page: 1, limit: 20 });
    expect(listInspectionsQuery.parse({ page: '2', limit: '100', status: 'PASSED' })).toEqual({ page: 2, limit: 100, status: 'PASSED' });
    for (const q of [{ limit: '101' }, { page: '0' }, { status: 'MAYBE' }, { sort: 'x' }]) {
      expect(listInspectionsQuery.safeParse(q).success).toBe(false);
    }
    expect(assignedOrdersQuery.safeParse({ status: 'PASSED' }).success).toBe(false);
  });
});

describe('B2 inspection body', () => {
  it('milestoneId only with REWORK_REQUIRED', () => {
    expect(createInspectionBodySchema.parse({ status: 'REWORK_REQUIRED', milestoneId: ' m1 ' })).toEqual({ status: 'REWORK_REQUIRED', milestoneId: 'm1' });
    expect(createInspectionBodySchema.parse({ status: 'REWORK_REQUIRED' })).toEqual({ status: 'REWORK_REQUIRED' });
    const bad = createInspectionBodySchema.safeParse({ status: 'PASSED', milestoneId: 'm1' });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]).toMatchObject({ path: ['milestoneId'], message: 'milestoneId is only allowed with status REWORK_REQUIRED' });
    expect(createInspectionBodySchema.safeParse({ status: 'REWORK_REQUIRED', milestoneId: '' }).success).toBe(false);
  });
});

describe('B3 payment validators', () => {
  it('amount keeps exact decimal text', () => {
    expect(createPaymentBodySchema.parse({ amount: 12500.5 }).amount).toBe('12500.5');
    expect(createPaymentBodySchema.parse({ amount: ' 0.01 ' }).amount).toBe('0.01');
    for (const amount of [0, '0.00', -1, '1.001', '12345678901', '1e3', null]) {
      expect(createPaymentBodySchema.safeParse({ amount }).success).toBe(false);
    }
  });

  it('simulation outcome cannot be REFUNDED (refunds are a separate, explicit operation)', () => {
    expect(simulatePaymentBodySchema.safeParse({ outcome: 'REFUNDED' }).success).toBe(false);
    expect(simulatePaymentBodySchema.safeParse({ outcome: 'SUCCEEDED' }).success).toBe(true);
  });
});

describe('B4/B5 rating validators', () => {
  it('score is an integer 1-5; history pagination is bounded', () => {
    for (const score of [1, 5]) expect(submitRatingBodySchema.safeParse({ score }).success).toBe(true);
    for (const score of [0, 6, 2.5, '3']) expect(submitRatingBodySchema.safeParse({ score }).success).toBe(false);
    expect(ratingHistoryQuery.parse({})).toEqual({ page: 1, limit: 20 });
    expect(ratingHistoryQuery.safeParse({ limit: '101' }).success).toBe(false);
  });
});
