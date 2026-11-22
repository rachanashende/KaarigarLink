import type { WorkshopQuote } from '@/services/marketplace';
export type QuoteSort = 'amount' | 'amount-desc' | 'delivery';
export const quoteLabels = { SUBMITTED: 'Submitted', AWARDED: 'Awarded', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' };
export function sortQuotes(quotations: WorkshopQuote[], sort: QuoteSort) {
  return [...quotations].sort((a, b) => (sort === 'delivery' ? a.quote.estimatedDelivery.localeCompare(b.quote.estimatedDelivery) : (a.quote.amount - b.quote.amount) * (sort === 'amount-desc' ? -1 : 1)) || a.quote.id.localeCompare(b.quote.id));
}

// Delivery commitments are dates; the contract has no quote creation time for lead-time arithmetic.
export function quoteRange(quotations: WorkshopQuote[]) {
  if (!quotations.length) return null;
  const amounts = quotations.map(entry => entry.quote.amount);
  const deliveries = quotations.map(entry => entry.quote.estimatedDelivery).sort();
  return { min: Math.min(...amounts), max: Math.max(...amounts), earliest: deliveries[0]!, latest: deliveries.at(-1)! };
}
