import { z } from 'zod';
import { dateInput } from './common';

/**
 * Money is kept exact end to end: accepted as a JSON number or a decimal
 * string, validated on its decimal text and passed to Prisma as a string for
 * the Decimal(12, 2) column (never through floating-point arithmetic).
 */
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const moneySchema = z
  .union([z.number(), z.string().trim()], {
    errorMap: () => ({ message: 'totalPrice must be a number or a decimal string' }),
  })
  .transform((v) => (typeof v === 'number' ? String(v) : v))
  .refine((s) => MONEY.test(s), 'totalPrice must have at most 2 decimal places and at most 10 digits before the point')
  .refine((s) => Number(s) > 0, 'totalPrice must be greater than 0');

const estimatedDaysSchema = z.number().int().positive().max(3650, 'estimatedDays must be at most 3650');

/** Optional quote expiry: an ISO date/datetime that must still be in the future. */
const validUntilSchema = dateInput({ endOfDay: true }).refine(
  (d) => d.getTime() > Date.now(),
  'validUntil must be in the future',
);

export const createQuoteBodySchema = z
  .object({
    totalPrice: moneySchema,
    estimatedDays: estimatedDaysSchema,
    notes: z.string().trim().max(2000).optional(),
    validUntil: validUntilSchema.optional(),
  })
  .strict();

/** An ISO date-time as returned in a quote updatedAt. */
const expectedVersion = z.string().datetime({ offset: true, message: 'expectedUpdatedAt must be an ISO date-time' });

/** M11: POST /api/quotes/:quoteId/withdraw (body optional). */
export const withdrawQuoteBodySchema = z.object({ expectedUpdatedAt: expectedVersion.optional() }).strict();

export const updateQuoteBodySchema = z
  .object({
    totalPrice: moneySchema.optional(),
    estimatedDays: estimatedDaysSchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    validUntil: validUntilSchema.nullable().optional(),
    /** M11 optimistic concurrency: the quote updatedAt the client last read. Stale -> 409. */
    expectedUpdatedAt: expectedVersion.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).some((key) => key !== 'expectedUpdatedAt'), {
    message: 'At least one field must be provided',
  });

export const quoteIdParamsSchema = z.object({
  quoteId: z.string().min(1),
});

export const invitationIdParamsSchema = z.object({
  invitationId: z.string().min(1),
});

export const jobIdParamsSchema = z.object({
  jobId: z.string().min(1),
});

export type CreateQuoteInput = z.infer<typeof createQuoteBodySchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteBodySchema>;
