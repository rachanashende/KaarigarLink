import { z } from 'zod';
import { createJobSchema } from '@/services/jobs';

export const jobFormSchema = createJobSchema.extend({
  processes: z.string().transform(value => value.split(',').map(item => item.trim()).filter(Boolean)).pipe(createJobSchema.shape.processes),
});
export type JobFormValues = z.input<typeof jobFormSchema>;
export type JobFormOutput = z.output<typeof jobFormSchema>;
