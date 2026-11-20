import { z } from 'zod';

export const matchesQuery = z
  .object({
    /** Optional hard distance limit in km; omit to rank by distance without excluding. */
    maxDistanceKm: z.coerce
      .number({ invalid_type_error: 'maxDistanceKm must be a number' })
      .positive('maxDistanceKm must be greater than 0')
      .max(20_000)
      .optional(),
  })
  .strict();

export type MatchesQuery = z.infer<typeof matchesQuery>;
