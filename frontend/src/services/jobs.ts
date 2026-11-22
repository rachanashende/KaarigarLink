import type { BuyerOrderService } from './orders';
import type { BuyerMarketplaceService } from './marketplace';
import { z } from 'zod';
import type { AuditEvent, Job, Order, Quote } from '@/types';

export function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const text = (label: string, max: number) => z.string().trim().min(1, label + ' is required.').max(max, 'Use no more than ' + max + ' characters.');
export const createJobSchema = z.strictObject({
  title: text('Job title', 140),
  capability: text('Manufacturing capability', 120),
  description: text('Description', 4000),
  material: text('Material', 120),
  specification: z.string().trim().max(4000, 'Use no more than 4000 characters.'),
  quantity: z.number({ error: 'Enter a valid quantity.' }).positive('Quantity must be greater than 0.'),
  unit: text('Unit', 40),
  processes: z.array(text('Required machinery or capability', 120)).min(1, 'Enter at least one required machine or capability.').max(12, 'Use no more than 12 requirements.'),
  deadline: z.iso.date({ error: 'Enter a valid delivery date.' }).refine(date => date > todayInIndia(), 'Delivery deadline must be a future date (India time).'),
  location: z.strictObject({ city: text('Delivery city', 120), state: text('State or union territory', 120) }),
  budget: z.number({ error: 'Enter a valid budget.' }).positive('Budget must be greater than 0.').multipleOf(0.01, 'Use no more than two decimal places.').optional(),
  designFiles: z.array(z.strictObject({
    id: z.string().min(1), name: text('File name', 255), mediaType: z.string().min(1).max(255),
    sizeBytes: z.number().int().nonnegative(),
  })).max(5, 'Choose no more than 5 files.').refine(files => files.every(file => file.sizeBytes <= 10 * 1024 * 1024), 'Each design file must be 10 MB or smaller.'),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;
export interface BuyerDashboardData { jobs: Job[]; quotes: Quote[]; orders: Order[]; activity: AuditEvent[] }
export interface BuyerService extends BuyerMarketplaceService, BuyerOrderService {
  getDashboard(buyerId: string): Promise<BuyerDashboardData>;
  listJobs(buyerId: string): Promise<Job[]>;
  getJob(buyerId: string, jobId: string): Promise<Job>;
  createJob(buyerId: string, input: CreateJobInput): Promise<Job>;
  /** Live mode only (M12): publish a draft or cancel an unawarded job. */
  setJobStatus?(buyerId: string, jobId: string, status: 'OPEN' | 'CANCELLED'): Promise<void>;
}
