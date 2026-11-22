import { z } from 'zod';

export const createInspectionBodySchema = z
  .object({
    status: z.enum(['PASSED', 'FAILED', 'REWORK_REQUIRED'], {
      errorMap: () => ({ message: 'status must be PASSED, FAILED or REWORK_REQUIRED' }),
    }),
    findings: z.string().trim().min(1, 'findings cannot be empty').max(2000, 'findings must be at most 2000 characters').optional(),
  })
  .strict();

export type CreateInspectionInput = z.infer<typeof createInspectionBodySchema>;
