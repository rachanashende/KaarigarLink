import { Link, useSearchParams } from 'react-router';
import { BuyerHeader as PageHeader } from './BuyerHeader';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { useBuyerOrders } from './queries';
import { BuyerLoading } from './BuyerLoading';
import { jobControlClass } from './JobField';
import { dateLabel, moneyLabel } from './model';
import { filterOrders, orderStatuses, type OrderSort } from './orderModel';
import { OrderBadge } from './OrderBadge';
import { OrderProgress } from './OrderProgress';
import { DemoDataNotice } from './DemoDataNotice';

export function OrdersListPage() {
  const query = useBuyerOrders();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const requested = params.get('status') ?? 'all';
  const status = Object.hasOwn(orderStatuses, requested) ? requested : 'all';
  const value = params.get('sort');
  const sort: OrderSort = value === 'oldest' || value === 'deadline' || value === 'deadline-desc' ? value : 'newest';
  function update(key: string, value: string) {
    setParams(previous => { const next = new URLSearchParams(previous); if (value && value !== 'all' && value !== 'newest') next.set(key, value); else next.delete(key); return next; }, { replace: true });
  }
  const header = <PageHeader title="Manufacturing orders" description="Track workshop production, delivery commitments and independent quality checks." />;
  if (query.isPending) return <>{header}<BuyerLoading label="Loading your orders…" /></>;
  if (query.isError) return <>{header}<DemoDataNotice /><ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /></>;
  const rows = filterOrders(query.data, search, status, sort);
  return <>{header}<DemoDataNotice />
    <div role="search" aria-label="Filter orders" className="mb-5 grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
      <div><label htmlFor="order-search" className="mb-2 block text-sm font-medium">Search orders, jobs or workshops</label><input id="order-search" type="search" className={jobControlClass} value={search} onChange={event => update('q', event.target.value)} /></div>
      <div><label htmlFor="order-status" className="mb-2 block text-sm font-medium">Order status</label><select id="order-status" className={jobControlClass} value={status} onChange={event => update('status', event.target.value)}><option value="all">All statuses</option>{Object.entries(orderStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div><label htmlFor="order-sort" className="mb-2 block text-sm font-medium">Sort orders</label><select id="order-sort" className={jobControlClass} value={sort} onChange={event => update('sort', event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="deadline">Delivery: soonest</option><option value="deadline-desc">Delivery: latest</option></select></div>
    </div>
    <p role="status" className="mb-4 text-sm text-muted-foreground">{rows.length} of {query.data.length} orders</p>
    {rows.length ? <DataTable caption="Buyer manufacturing orders" rows={rows} rowKey={item => item.order.id} columns={[
      { key: 'order', header: 'Order / job', cell: item => <div className="min-w-56"><Link className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline" to={'/buyer/orders/' + encodeURIComponent(item.order.id)}>{item.order.id}</Link><p className="text-xs leading-relaxed text-muted-foreground">{item.job.title}</p><p className="mt-2 text-xs text-muted-foreground">Created {dateLabel(item.order.createdAt)}</p></div> },
      { key: 'workshop', header: 'Workshop', cell: item => <span className="block min-w-36">{item.workshop.name}</span> },
      { key: 'value', header: 'Order value', cell: item => <span className="whitespace-nowrap font-medium tabular-nums">{moneyLabel(item.quote.amount)}</span> },
      { key: 'status', header: 'Status', cell: item => <OrderBadge status={item.order.status} /> },
      { key: 'quality', header: 'Quality inspection', cell: item => <span className="block min-w-32 text-xs">{item.order.qcStatus === 'REWORK' ? 'Rework requested' : item.order.qcStatus === 'ACCEPTED' ? 'Accepted' : item.order.qcStatus === 'PENDING' ? 'QC pending' : 'Not recorded'}</span> },
      { key: 'delivery', header: 'Expected delivery', cell: item => <span className="whitespace-nowrap">{dateLabel(item.quote.estimatedDelivery)}</span> },
      { key: 'progress', header: 'Production', cell: item => <OrderProgress milestones={item.order.milestones} /> },
    ]} /> : <EmptyState title={query.data.length ? 'No orders match these filters' : 'No orders yet'} description={query.data.length ? 'Search another order, job or workshop, or clear the filters.' : 'Orders will appear once an approved award workflow is available. Browse your manufacturing jobs.'} action={query.data.length ? <Button variant="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button> : <Button asChild variant="outline"><Link to="/buyer/jobs">View jobs</Link></Button>} />}
    <p className="mt-4 text-xs text-muted-foreground">Scroll the table horizontally on smaller screens. Production completion does not imply QC acceptance or delivery.</p>
  </>;
}
