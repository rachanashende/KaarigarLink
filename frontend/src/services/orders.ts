import { z } from 'zod';
import type { AuditEvent, Inspection, Job, Order, Quote, Review, Workshop } from '@/types';

export interface BuyerOrderData {
  order: Order; job: Job; quote: Quote; workshop: Workshop;
  inspections: Inspection[]; review: Review | null; activity: AuditEvent[];
  canReview: boolean; reviewReason: string;
}
export const reviewSchema = z.strictObject({
  rating: z.number({ error: 'Choose a workshop rating.' }).int().min(1, 'Choose a rating from 1 to 5.').max(5, 'Choose a rating from 1 to 5.'),
  comment: z.string().trim().min(10, 'Write at least 10 characters of feedback.').max(2000, 'Use no more than 2000 characters.'),
});
export type ReviewInput = z.infer<typeof reviewSchema>;
export interface BuyerOrderService {
  listOrders(buyerId: string): Promise<BuyerOrderData[]>;
  getOrder(buyerId: string, orderId: string): Promise<BuyerOrderData>;
  submitReview(buyerId: string, orderId: string, input: ReviewInput): Promise<Review>;
}
