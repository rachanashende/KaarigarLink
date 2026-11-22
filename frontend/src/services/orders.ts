import { z } from 'zod';
import type { AuditEvent, Inspection, Job, Order, PaymentRecord, Quote, Review, Workshop } from '@/types';

export interface BuyerOrderData {
  order: Order; job: Job; quote: Quote; workshop: Workshop;
  inspections: Inspection[]; review: Review | null; activity: AuditEvent[];
  canReview: boolean; reviewReason: string;
  /** Live mode only: simulated payment history and totals (INR). */
  payments?: PaymentRecord[]; paymentSummary?: PaymentSummary;
}
export interface PaymentSummary { agreedPrice: number; paid: number; pending: number; remaining: number; refunded: number; refundDue: number }
export const paymentInputSchema = z.strictObject({
  amount: z.number({ error: 'Enter a payment amount.' }).positive('Amount must be greater than 0.').multipleOf(0.01, 'Use no more than two decimal places.'),
  description: z.string().trim().max(500, 'Use no more than 500 characters.').optional(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export const cancelOrderSchema = z.strictObject({ reason: z.string().trim().min(3, 'Give a reason of at least 3 characters.').max(1000, 'Use no more than 1000 characters.') });
export const reviewSchema = z.strictObject({
  rating: z.number({ error: 'Choose a workshop rating.' }).int().min(1, 'Choose a rating from 1 to 5.').max(5, 'Choose a rating from 1 to 5.'),
  comment: z.string().trim().min(10, 'Write at least 10 characters of feedback.').max(2000, 'Use no more than 2000 characters.'),
});
export type ReviewInput = z.infer<typeof reviewSchema>;
export interface BuyerOrderService {
  listOrders(buyerId: string): Promise<BuyerOrderData[]>;
  getOrder(buyerId: string, orderId: string): Promise<BuyerOrderData>;
  submitReview(buyerId: string, orderId: string, input: ReviewInput): Promise<Review>;
  // Optional order commands: implemented by the live adapter only; the UI hides them otherwise.
  completeOrder?(buyerId: string, orderId: string): Promise<void>;
  cancelOrder?(buyerId: string, orderId: string, reason: string): Promise<void>;
  approveMilestone?(buyerId: string, milestoneId: string): Promise<void>;
  createPayment?(buyerId: string, orderId: string, input: PaymentInput): Promise<void>;
  simulatePayment?(buyerId: string, paymentId: string, outcome: 'SUCCEEDED' | 'FAILED'): Promise<void>;
}

/**
 * M13 (BUG-02): the payment summary from a payment list, with exactly the backend's rules
 * (backend/src/services/payment.service.ts summaryView): paid = succeeded and not refunded;
 * remaining = agreed price - paid - pending; refund due = paid once the order is cancelled.
 * Computed in paise so sums are exact. Returns null when amounts are unknown (mock records).
 */
export function derivePaymentSummary(agreedPrice: number | undefined, orderStatus: Order['backendStatus'], payments: PaymentRecord[]): PaymentSummary | null {
  if (agreedPrice === undefined || payments.some(item => item.amount === undefined)) return null;
  const paise = (value: number) => Math.round(value * 100);
  const total = (status: PaymentRecord['simulationStatus']) => payments.filter(item => item.simulationStatus === status).reduce((sum, item) => sum + paise(item.amount!), 0);
  const paid = total('SIMULATED_PAID'); const pending = total('PENDING'); const refunded = total('SIMULATED_REFUNDED');
  const agreed = paise(agreedPrice);
  return {
    agreedPrice: agreed / 100, paid: paid / 100, pending: pending / 100, remaining: (agreed - paid - pending) / 100,
    refunded: refunded / 100, refundDue: orderStatus === 'CANCELLED' ? paid / 100 : 0,
  };
}

/** One label for the payment position, shared by the buyer and workshop views. */
export function paymentStatusLabel(summary: PaymentSummary): string {
  if (summary.refundDue > 0) return 'Refund due';
  if (summary.paid === 0 && summary.refunded > 0) return 'Refunded';
  if (summary.paid >= summary.agreedPrice && summary.agreedPrice > 0) return 'Paid in full';
  if (summary.paid > 0) return summary.pending > 0 ? 'Partly paid, more pending' : 'Partly paid';
  return summary.pending > 0 ? 'Payment pending' : 'Unpaid';
}
