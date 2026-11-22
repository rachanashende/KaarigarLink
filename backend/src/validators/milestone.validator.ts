import { z } from 'zod';
import { dateInput } from './common';

const title = z
  .string({ required_error: 'title is required', invalid_type_error: 'title must be a string' })
  .trim()
  .min(1, 'title is required')
  .max(200, 'title must be at most 200 characters');
const description = z.string().trim().max(2000, 'description must be at most 2000 characters');
const sequence = z
  .number({ required_error: 'sequence is required', invalid_type_error: 'sequence must be a number' })
  .int('sequence must be an integer')
  .min(1, 'sequence must be at least 1')
  .max(1000, 'sequence must be at most 1000');
const dueDate = dateInput({ endOfDay: true });

export const createMilestoneBodySchema = z
  .object({ title, description: description.optional(), sequence, dueDate: dueDate.optional() })
  .strict();

/** Only PENDING milestones can be edited; status is changed through the transition endpoints. */
export const updateMilestoneBodySchema = z
  .object({
    title: title.optional(),
    description: description.nullable().optional(),
    sequence: sequence.optional(),
    dueDate: dueDate.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export const milestoneIdParamsSchema = z.object({ milestoneId: z.string().min(1) });

export type CreateMilestoneInput = z.infer<typeof createMilestoneBodySchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneBodySchema>;
