import { z } from 'zod';

/** M10 admin directory lists: page >= 1, limit 1-100 (default 50). Unknown keys -> 400. */
export const adminListQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type AdminListQuery = z.infer<typeof adminListQuery>;
