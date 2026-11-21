import { z } from 'zod';

export const quoteIdParamsSchema = z.object({
  quoteId: z.string().min(1),
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().min(1),
});