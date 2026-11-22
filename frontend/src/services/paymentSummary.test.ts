import { describe, expect, it } from 'vitest';
import type { PaymentRecord } from '@/types';
import { derivePaymentSummary, paymentStatusLabel } from './orders';

/** M13 BUG-02: the workshop's payment position uses the backend's rules, so both views agree. */
const pay = (amount: number, simulationStatus: PaymentRecord['simulationStatus'], id = String(Math.random())): PaymentRecord => ({ id, orderId: 'o1', amount, simulationStatus });

describe('derivePaymentSummary', () => {
  it('the report case: ₹5,000 paid of ₹18,000 is partly paid with ₹13,000 remaining', () => {
    const summary = derivePaymentSummary(18000, 'IN_PROGRESS', [pay(5000, 'SIMULATED_PAID')])!;
    expect(summary).toEqual({ agreedPrice: 18000, paid: 5000, pending: 0, remaining: 13000, refunded: 0, refundDue: 0 });
    expect(paymentStatusLabel(summary)).toBe('Partly paid');
  });

  it('matches the server summary for the same payments (pending reserves; failed is ignored)', () => {
    const payments = [pay(5000, 'SIMULATED_PAID'), pay(2500.5, 'PENDING'), pay(999, 'SIMULATED_FAILED')];
    // What GET /orders/:id/payments returns for these payments (backend summaryView).
    const server = { agreedPrice: 18000, paid: 5000, pending: 2500.5, remaining: 10499.5, refunded: 0, refundDue: 0 };
    expect(derivePaymentSummary(18000, 'IN_PROGRESS', payments)).toEqual(server);
    expect(paymentStatusLabel(server)).toBe('Partly paid, more pending');
  });

  it('is exact with paise (no floating-point drift)', () => {
    const summary = derivePaymentSummary(100.3, 'CONFIRMED', [pay(0.1, 'SIMULATED_PAID'), pay(0.2, 'SIMULATED_PAID')])!;
    expect(summary.paid).toBe(0.3);
    expect(summary.remaining).toBe(100);
  });

  it('labels each payment position', () => {
    const label = (agreed: number, status: Parameters<typeof derivePaymentSummary>[1], payments: PaymentRecord[]) => paymentStatusLabel(derivePaymentSummary(agreed, status, payments)!);
    expect(label(18000, 'CONFIRMED', [])).toBe('Unpaid');
    expect(label(18000, 'CONFIRMED', [pay(18000, 'PENDING')])).toBe('Payment pending');
    expect(label(18000, 'IN_PROGRESS', [pay(10000, 'SIMULATED_PAID'), pay(8000, 'SIMULATED_PAID')])).toBe('Paid in full');
    expect(label(18000, 'CANCELLED', [pay(5000, 'SIMULATED_PAID')])).toBe('Refund due');
    expect(label(18000, 'CANCELLED', [pay(5000, 'SIMULATED_REFUNDED')])).toBe('Refunded');
  });

  it('a cancelled order owes back what was paid', () => {
    expect(derivePaymentSummary(18000, 'CANCELLED', [pay(5000, 'SIMULATED_PAID')])!.refundDue).toBe(5000);
  });

  it('returns null without live amounts (mock records keep their own display)', () => {
    expect(derivePaymentSummary(undefined, 'CONFIRMED', [])).toBeNull();
    expect(derivePaymentSummary(18000, 'CONFIRMED', [{ id: 'p', orderId: 'o1', simulationStatus: 'SIMULATED_PAID' }])).toBeNull();
  });
});
