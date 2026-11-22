import { z } from 'zod';

/**
 * Same money rules as quotes: a JSON number or decimal string, validated on its
 * text, at most 2 decimals and 10 integer digits, > 0. Passed on as a string to
 * Prisma.Decimal (never through floating-point arithmetic).
 */
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const amountSchema = z
  .union([z.number(), z.string().trim()], {
    errorMap: () => ({ message: 'amount must be a number or a decimal string' }),
  })
  .transform((v) => (typeof v === 'number' ? String(v) : v))
  .refine((s) => MONEY.test(s), 'amount must have at most 2 decimal places and at most 10 digits before the point')
  .refine((s) => Number(s) > 0, 'amount must be greater than 0');

export const createPaymentBodySchema = z
  .object({
    amount: amountSchema,
    description: z.string().trim().max(500, 'description must be at most 500 characters').optional(),
  })
  .strict();

/** Simulated gateway result (mock; no real payment provider is called). */
export const simulatePaymentBodySchema = z
  .object({
    outcome: z.enum(['SUCCEEDED', 'FAILED'], { errorMap: () => ({ message: 'outcome must be SUCCEEDED or FAILED' }) }),
  })
  .strict();

export const paymentIdParamsSchema = z.object({ paymentId: z.string().min(1) });

export type CreatePaymentInput = z.infer<typeof createPaymentBodySchema>;
export type SimulatePaymentInput = z.infer<typeof simulatePaymentBodySchema>;
