import type { WorkshopQuote } from '@/services/marketplace';
export type QuoteSort = 'amount' | 'amount-desc' | 'delivery';
export const quoteLabels = { SUBMITTED: 'Submitted', AWARDED: 'Awarded', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' };
export function sortQuotes(quotations: WorkshopQuote[], sort: QuoteSort) {
  return [...quotations].sort((a, b) => (sort === 'delivery' ? a.quote.estimatedDelivery.localeCompare(b.quote.estimatedDelivery) : (a.quote.amount - b.quote.amount) * (sort === 'amount-desc' ? -1 : 1)) || a.quote.id.localeCompare(b.quote.id));
}
