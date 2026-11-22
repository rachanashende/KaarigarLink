import { z } from 'zod';

export const quoteIdParamsSchema = z.object({
  quoteId: z.string().min(1),
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});

/** Award takes no body: the server derives everything from the quote (any field -> 400). */
export const awardBodySchema = z.object({}).strict();

/** Start and complete take no body (any field -> 400). */
export const emptyBodySchema = z.object({}).strict();

/** Cancellation needs a reason; it is stored on the order and never overwritten. */
export const cancelOrderBodySchema = z
  .object({
    reason: z
      .string({ required_error: 'reason is required', invalid_type_error: 'reason must be a string' })
      .trim()
      .min(3, 'reason must be at least 3 characters')
      .max(1000, 'reason must be at most 1000 characters'),
  })
  .strict();

export type CancelOrderInput = z.infer<typeof cancelOrderBodySchema>;
