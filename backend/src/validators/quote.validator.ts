
import { z } from 'zod';

export const createQuoteBodySchema = z.object({
  totalPrice: z.coerce.number().positive(),
  estimatedDays: z.number().int().positive(),
  notes: z.string().trim().max(2000).optional(),
  validUntil: z.coerce.date().optional(),
});

export const updateQuoteBodySchema = z.object({
  totalPrice: z.coerce.number().positive().optional(),
  estimatedDays: z.number().int().positive().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
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
