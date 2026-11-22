import { z } from 'zod';

export const quoteIdParamsSchema = z.object({
  quoteId: z.string().min(1),
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});

/** Award takes no body: the server derives everything from the quote (any field -> 400). */
export const awardBodySchema = z.object({}).strict();
