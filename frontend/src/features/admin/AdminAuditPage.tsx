import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useServices } from '@/app/services';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { controlClass } from '@/components/FormField';
import { auditLabel } from '@/services/platform';

const timeLabel = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));
const ENTITY_TYPES = ['Job', 'Invitation', 'Quote', 'Order', 'Milestone', 'Inspection', 'Payment', 'Rating', 'Workshop', 'InspectorAssignment', 'Document', 'User'];

/** M12: the platform audit history (ADMIN), paginated and filterable. Live mode only. */
export function AdminAuditPage() {
  const { audit } = useServices(); const [params, setParams] = useSearchParams();
  const filters = { action: params.get('action') ?? '', entityType: params.get('entityType') ?? '', actorId: params.get('actorId') ?? '', orderId: params.get('orderId') ?? '', page: Number(params.get('page') ?? '1') || 1 };
  const query = useQuery({ queryKey: ['admin', 'audit', filters], queryFn: () => audit!.list(filters), enabled: !!audit });
  // M13: React Router's functional setSearchParams sees the params of the last render, so two
  // filter changes before a re-render overwrote each other. Accumulate them until the next render.
  const pending = useRef<URLSearchParams | null>(null);
  useEffect(() => { pending.current = null; }, [params]);
  function update(key: string, value: string) {
    const next = new URLSearchParams(pending.current ?? params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    pending.current = next;
    setParams(next, { replace: true });
  }
  const header = <PageHeader title="Audit history" description="Append-only record of business actions: who did what, when. Records cannot be edited or deleted." action={<Button variant="outline" onClick={() => { void query.refetch(); }}>Refresh</Button>} />;
  if (!audit) return <>{header}<EmptyState title="Audit history needs the server" description="Recorded audit events are available when connected to the KaarigarLink server." /></>;
  return <>{header}
    <div role="search" aria-label="Filter audit history" className="mb-5 grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      <div><label htmlFor="audit-action" className="mb-2 block text-sm font-medium">Action</label><input id="audit-action" className={controlClass} placeholder="e.g. ORDER_COMPLETED" value={filters.action} onChange={event => update('action', event.target.value.trim().toUpperCase())} /></div>
      <div><label htmlFor="audit-entity" className="mb-2 block text-sm font-medium">Record type</label><select id="audit-entity" className={controlClass} value={filters.entityType} onChange={event => update('entityType', event.target.value)}><option value="">All record types</option>{ENTITY_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></div>
      <div><label htmlFor="audit-actor" className="mb-2 block text-sm font-medium">Actor user ID</label><input id="audit-actor" className={controlClass} value={filters.actorId} onChange={event => update('actorId', event.target.value.trim())} /></div>
      <div><label htmlFor="audit-order" className="mb-2 block text-sm font-medium">Order ID</label><input id="audit-order" className={controlClass} value={filters.orderId} onChange={event => update('orderId', event.target.value.trim())} /></div>
    </div>
    {query.isPending ? <LoadingState label="Loading audit history…" /> : query.isError ? <ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /> : <>
      <p role="status" className="mb-4 text-sm text-muted-foreground">{query.data.total} events · page {query.data.page} of {Math.max(1, query.data.totalPages)}</p>
      {query.data.items.length ? <DataTable caption="Audit events" rows={query.data.items} rowKey={item => item.id} columns={[
        { key: 'when', header: 'When', cell: item => <span className="whitespace-nowrap">{timeLabel(item.createdAt)}</span> },
        { key: 'action', header: 'Action', cell: item => <div className="min-w-44"><p className="font-medium">{auditLabel(item.action)}</p><p className="mt-1 text-xs text-muted-foreground">{item.action}</p></div> },
        { key: 'entity', header: 'Record', cell: item => <div className="min-w-44"><p>{item.entityType}</p><p className="mt-1 break-all text-xs text-muted-foreground">{item.entityId}</p>{item.orderId && <Link className="mt-1 inline-flex min-h-11 items-center text-xs text-primary hover:underline" to={'/admin/orders/' + encodeURIComponent(item.orderId)}>Open order</Link>}</div> },
        { key: 'actor', header: 'Actor', cell: item => item.actorId ? <div className="min-w-36"><Link className="text-primary hover:underline" to={'/admin/users/' + encodeURIComponent(item.actorId)}>{item.actorId}</Link><p className="mt-1 text-xs text-muted-foreground">{item.actorRole?.toLowerCase()}</p></div> : 'System' },
        { key: 'details', header: 'Details', cell: item => <code className="block min-w-48 max-w-sm whitespace-pre-wrap break-all text-xs">{item.metadata ? JSON.stringify(item.metadata) : '—'}</code> },
      ]} /> : <EmptyState title="No audit events" description="No events match these filters." action={<Button variant="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="outline" disabled={query.data.page <= 1} onClick={() => update('page', String(query.data.page - 1))}>Previous page</Button>
        <Button variant="outline" disabled={query.data.page >= query.data.totalPages} onClick={() => update('page', String(query.data.page + 1))}>Next page</Button>
      </div>
    </>}
  </>;
}
