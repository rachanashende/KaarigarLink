import { Link, useParams } from 'react-router';
import { BuyerHeader as PageHeader } from './BuyerHeader';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/feedback';
import { StatusBadge } from '@/components/StatusBadge';
import { useBuyerOrder } from './queries';
import { useServices } from '@/app/services';
import { BuyerLoading } from './BuyerLoading';
import { dateLabel, moneyLabel, quantityLabel } from './model';
import { OrderBadge } from './OrderBadge';
import { OrderProgress } from './OrderProgress';
import { MilestoneTimeline } from './MilestoneTimeline';
import { OrderReview } from './OrderReview';
import { OrderActions, OrderPayments } from './OrderActions';
import { DocumentList } from '@/components/DocumentList';
import { placeLabel } from '@/components/utils';

export function OrderDetailPage({ reviewOnly = false }: { reviewOnly?: boolean }) {
  const live = !useServices().demo;
  const { id = '' } = useParams();
  const query = useBuyerOrder(id);
  if (query.isPending) return <BuyerLoading label="Loading order tracking…" />;
  if (query.isError) return <><PageHeader title="Order unavailable" description="This order may be missing or belong to another buyer." /><ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /><Button asChild variant="outline" className="mt-5"><Link to="/buyer/orders">Return to orders</Link></Button></>;
  const data = query.data;
  const { order, job, quote, workshop } = data;
  const back = <Button asChild variant="outline"><Link to={reviewOnly ? '/buyer/orders/' + encodeURIComponent(id) : '/buyer/orders'}>{reviewOnly ? 'Back to order' : 'All orders'}</Link></Button>;
  if (reviewOnly) return <><PageHeader title="Review your workshop" description={order.id + ' · ' + workshop.name} action={back} /><OrderReview key={id} data={data} /></>;
  const qcLabel = order.qcStatus === 'REWORK' ? 'Rework requested' : order.qcStatus === 'FAILED' ? 'Failed' : order.qcStatus === 'ACCEPTED' ? 'Accepted' : order.qcStatus === 'PENDING' ? 'QC pending' : 'No QC outcome recorded';
  return <><PageHeader title={order.id} description={job.title} action={back} />
    <div className="mb-6 rounded-lg border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4"><OrderBadge status={order.status} />{!live && <p className="text-xs text-muted-foreground">Historical demo snapshot · read-only lifecycle</p>}</div>
      <dl className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">Order value · INR</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{moneyLabel(quote.amount)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Delivery commitment</dt><dd className="mt-2 font-semibold">{dateLabel(quote.estimatedDelivery)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Created</dt><dd className="mt-2 font-semibold">{dateLabel(order.createdAt)}</dd></div>
        <div><dt className="mb-2 text-xs text-muted-foreground">Production completion</dt><dd><OrderProgress milestones={order.milestones} /></dd></div>
      </dl>
      {order.status === 'CANCELLED' && <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">This is a historical cancelled order. Remaining milestones are not an active delivery plan. {order.cancellationReason ? 'Cancellation reason: ' + order.cancellationReason : 'Cancellation date and reason were not provided.'}</p>}
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <MilestoneTimeline order={order} />
      <div className="min-w-0 space-y-6">
        <section aria-labelledby="order-requirements" className="rounded-lg border bg-card p-5 sm:p-6">
          <h2 id="order-requirements" className="text-lg font-semibold">Manufacturing brief</h2>
          <Link className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline" to={'/buyer/jobs/' + encodeURIComponent(job.id)}>{job.title}</Link>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{job.description}</p>
          <dl className="mt-5 space-y-4 text-sm">{[['Quantity', quantityLabel(job)], ['Material', job.material], ['Capability', job.capability], ['Requirements', job.processes.join(', ')], ['Specification', job.specification || 'Not provided'], ['Requested delivery', dateLabel(job.deadline)], ['Delivery location', job.location.city + ', ' + job.location.state]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words leading-relaxed">{value}</dd></div>)}</dl>
        </section>
        <section aria-labelledby="accepted-quotation" className="rounded-lg border bg-card p-5 sm:p-6">
          <h2 id="accepted-quotation" className="text-lg font-semibold">Assigned workshop & quotation</h2><p className="mt-4 text-sm font-semibold">{workshop.name}</p><p className="mt-1 text-xs text-muted-foreground">{placeLabel(workshop.location)}</p>
          <p className="mt-4 text-xs text-muted-foreground">{quote.id} · {quote.status === 'AWARDED' ? 'Awarded quotation' : quote.status}</p><p className="mt-2 text-sm font-medium">{moneyLabel(quote.amount)} · {dateLabel(quote.estimatedDelivery)}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{quote.notes}</p>
        </section>
      </div>
    </div>
    <section aria-labelledby="quality-check" className="mt-6 rounded-lg border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="quality-check" className="text-lg font-semibold">Quality & rework</h2><StatusBadge tone={order.qcStatus === 'REWORK' || order.qcStatus === 'FAILED' ? 'danger' : order.qcStatus === 'PENDING' ? 'warning' : 'neutral'}>{qcLabel}</StatusBadge></div>
      <p className="mt-2 text-xs text-muted-foreground">Inspector records · read-only. No approval or rework decisions can be made here.</p>
      {data.inspections.length ? <ul className="mt-5 divide-y">{data.inspections.map(inspection => <li key={inspection.id} className="py-4 first:pt-0 last:pb-0"><p className="text-sm font-semibold">{inspection.decision === 'REWORK' ? 'Rework requested' : inspection.decision === 'FAILED' ? 'Failed' : inspection.decision === 'ACCEPTED' ? 'Accepted' : 'QC pending'}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{inspection.notes || 'No inspector notes recorded.'}</p>{inspection.history?.at(-1)?.submittedAt && <p className="mt-3 text-xs text-muted-foreground">Decision recorded: {dateLabel(inspection.history.at(-1)?.submittedAt)}</p>}{inspection.reworkDeadline && <p className="mt-3 text-sm font-medium">Rework deadline: {dateLabel(inspection.reworkDeadline)}</p>}</li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No inspection records available.</p>}
      <p className="mt-4 text-xs text-muted-foreground">Latest QC outcome above comes from the order summary. Inspector findings are human-recorded; production status is separate. Draft findings are not shared with buyers.</p>
    </section>
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
      <DocumentList scope="order" id={order.id} title="Inspection evidence" description="Files the inspector attached to this order." />
      <DocumentList scope="job" id={job.id} title="Design files" />
    </div>
    <OrderActions data={data} />
    <OrderPayments data={data} />
    <div className="mt-6"><OrderReview key={id} data={data} /></div>
    <section aria-labelledby="order-activity" className="mt-6 rounded-lg border bg-card p-5 sm:p-6">
      <h2 id="order-activity" className="text-lg font-semibold">Order activity</h2>{data.paymentSummary && <p className="mt-1 text-xs text-muted-foreground">From the order's recorded audit history.</p>}
      {data.activity.length ? <ol className="mt-4 divide-y">{data.activity.map(event => <li key={event.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{event.action === 'MOCK_REVIEW_SUBMITTED' ? 'Demo review recorded' : event.action === 'DEMO_SNAPSHOT_RECORDED' ? 'Historical demo snapshot recorded' : event.action.replaceAll('_', ' ').toLowerCase()}</span><time className="text-xs text-muted-foreground" dateTime={event.occurredAt}>{dateLabel(event.occurredAt)}</time></li>)}</ol> : <p className="mt-4 text-sm text-muted-foreground">No activity recorded.</p>}
    </section>
  </>;
}
