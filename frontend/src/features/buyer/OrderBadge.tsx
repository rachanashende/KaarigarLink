import type { OrderStatus } from '@/types';
import { StatusBadge } from '@/components/StatusBadge';
import { orderStatuses } from './orderModel';
export function OrderBadge({ status }: { status: OrderStatus }) {
  return <StatusBadge tone={status === 'REWORK' ? 'danger' : status === 'QC_PENDING' ? 'warning' : status === 'IN_PRODUCTION' || status === 'AWARDED' ? 'info' : 'neutral'}>{orderStatuses[status]}</StatusBadge>;
}
