import type { Collections, Order } from '@/types';
import { ServiceError } from '../contracts';
import { reviewSchema, type BuyerOrderData, type BuyerOrderService } from '../orders';
import type { MockStore } from '../mock/store';
import { ownedJob, requireBuyer } from './mockBuyerAccess';

function ownedOrder(state: Collections, buyerId: string, id: string): Order {
  requireBuyer(state, buyerId);
  const order = state.orders.find(order => order.id === id && order.buyerId === buyerId);
  if (!order || !state.jobs.some(job => job.id === order.jobId && job.buyerId === buyerId)) throw new ServiceError('NOT_FOUND', 'This order is unavailable.');
  return order;
}
function tracking(state: Collections, buyerId: string, order: Order): BuyerOrderData {
  const job = ownedJob(state, buyerId, order.jobId);
  const quote = state.quotes.find(quote => quote.id === order.quoteId && quote.jobId === job.id && quote.workshopId === order.workshopId);
  const workshop = state.workshops.find(workshop => workshop.id === order.workshopId);
  if (!quote || !workshop) throw new ServiceError('SERVER', 'Order references are incomplete. Reset demo data or contact support.');
  const review = state.reviews.find(review => review.orderId === order.id) ?? null;
  const canReview = order.status === 'CLOSED' && !review;
  return {
    order, job, quote, workshop, review, canReview,
    reviewReason: review ? 'A review has already been recorded for this order.' : canReview ? 'Mock-only: closed orders may receive one review.' : 'Mock-only: reviews are available only for CLOSED orders. Payment status alone does not qualify.',
    inspections: state.inspections.filter(inspection => inspection.orderId === order.id).map(inspection => { const visible = { ...inspection }; delete visible.draft; return visible; }),
    activity: state.auditEvents.filter(event => event.entityType === 'Order' && event.entityId === order.id).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
  };
}
export function createMockOrders(store: MockStore): BuyerOrderService {
  return {
    async listOrders(buyerId) {
      const state = store.snapshot(); requireBuyer(state, buyerId);
      return state.orders.filter(order => order.buyerId === buyerId && state.jobs.some(job => job.id === order.jobId && job.buyerId === buyerId)).map(order => tracking(state, buyerId, order));
    },
    async getOrder(buyerId, id) {
      const state = store.snapshot();
      return tracking(state, buyerId, ownedOrder(state, buyerId, id));
    },
    async submitReview(buyerId, id, input) {
      const parsed = reviewSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check your review.');
      let review!: Collections['reviews'][number];
      store.commit(state => {
        const order = ownedOrder(state, buyerId, id);
        const data = tracking(state, buyerId, order);
        if (!data.canReview) throw new ServiceError('CONFLICT', data.reviewReason);
        review = { id: 'review-' + crypto.randomUUID(), orderId: id, ...parsed.data };
        state.reviews.push(review);
        state.auditEvents.push({ id: 'event-' + crypto.randomUUID(), actorId: buyerId, entityId: id, entityType: 'Order', action: 'MOCK_REVIEW_SUBMITTED', occurredAt: new Date().toISOString() });
      });
      return structuredClone(review);
    },
  };
}
