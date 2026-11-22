import { z } from 'zod';

export const submitRatingBodySchema = z
  .object({
    score: z
      .number({ required_error: 'score is required', invalid_type_error: 'score must be a number' })
      .int('score must be a whole number')
      .min(1, 'score must be between 1 and 5')
      .max(5, 'score must be between 1 and 5'),
    review: z.string().trim().max(2000, 'review must be at most 2000 characters').optional(),
  })
  .strict();

export type SubmitRatingInput = z.infer<typeof submitRatingBodySchema>;

/** B5: GET /workshops/:id/ratings pagination (defaults keep small histories on one page). */
export const ratingHistoryQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type RatingHistoryQuery = z.infer<typeof ratingHistoryQuery>;
