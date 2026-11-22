import { useQuery } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { auditLabel } from '@/services/platform';

const timeLabel = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));

/** The order's recorded audit history (M12, live mode only; renders nothing in mock mode). */
export function OrderHistory({ orderId }: { orderId: string }) {
  const { audit } = useServices();
  const query = useQuery({ queryKey: ['order-history', orderId], queryFn: () => audit!.orderHistory(orderId), enabled: !!audit });
  if (!audit) return null;
  return <section aria-labelledby={'history-' + orderId} className="rounded-lg border bg-card p-5 sm:p-6">
    <h2 id={'history-' + orderId} className="text-lg font-semibold">Order history</h2>
    <p className="mt-1 text-xs text-muted-foreground">Recorded audit events, oldest first.</p>
    {query.isPending ? <p className="mt-4 text-sm text-muted-foreground">Loading history…</p>
      : query.isError ? <p role="alert" className="mt-4 text-sm text-destructive">{query.error.message}</p>
      : query.data.length ? <ol className="mt-4 divide-y">{query.data.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
        <span>{auditLabel(item.action)}{item.actorRole ? <span className="text-xs text-muted-foreground"> · by {item.actorRole.toLowerCase()}</span> : null}</span>
        <time className="text-xs text-muted-foreground" dateTime={item.createdAt}>{timeLabel(item.createdAt)}</time>
      </li>)}</ol> : <p className="mt-4 text-sm text-muted-foreground">No recorded events yet. Events are recorded from M12 onwards.</p>}
  </section>;
}
