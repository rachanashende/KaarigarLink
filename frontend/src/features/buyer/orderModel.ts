import type { Milestone, OrderStatus } from '@/types';
import type { BuyerOrderData } from '@/services/orders';
import { todayInIndia } from '@/services/jobs';

export const orderStatuses: Record<OrderStatus, string> = {
  POSTED: 'Posted', QUOTING: 'Quoting', AWARDED: 'Awarded', IN_PRODUCTION: 'In production',
  QC_PENDING: 'QC pending', ACCEPTED: 'Accepted', REWORK: 'Rework requested', PAID: 'Paid', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};
export function milestoneProgress(milestones: Milestone[]): number | null {
  return milestones.length ? Math.round(milestones.filter(milestone => milestone.status === 'COMPLETED').length / milestones.length * 100) : null;
}
export function milestoneLabel(milestone: Milestone, cancelled = false, today = todayInIndia()) {
  if (milestone.status === 'COMPLETED') return 'Completed';
  if (cancelled) return 'Not completed · order cancelled';
  const delayed = milestone.dueOn < today;
  return (delayed ? 'Delayed · ' : '') + (milestone.status === 'IN_PROGRESS' ? 'In progress' : 'Upcoming');
}
export type OrderSort = 'newest' | 'oldest' | 'deadline' | 'deadline-desc';
export function filterOrders(orders: BuyerOrderData[], search: string, status: string, sort: OrderSort) {
  const term = search.trim().toLocaleLowerCase('en-IN');
  return orders.filter(item => [item.order.id, item.job.title, item.workshop.name].some(value => value.toLocaleLowerCase('en-IN').includes(term)) && (status === 'all' || item.order.status === status)).sort((a, b) => {
    if (sort === 'deadline' || sort === 'deadline-desc') return a.quote.estimatedDelivery.localeCompare(b.quote.estimatedDelivery) * (sort === 'deadline' ? 1 : -1) || a.order.id.localeCompare(b.order.id);
    if (!a.order.createdAt && b.order.createdAt) return 1;
    if (!b.order.createdAt && a.order.createdAt) return -1;
    return (a.order.createdAt ?? '').localeCompare(b.order.createdAt ?? '') * (sort === 'oldest' ? 1 : -1) || a.order.id.localeCompare(b.order.id);
  });
}
