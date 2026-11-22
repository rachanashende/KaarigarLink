import { Link, useSearchParams } from 'react-router';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import { ErrorState, LoadingState, EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/DataTable';
import { controlClass } from '@/components/FormField';
import { useInspections } from './queries';
import { InspectionTable, QCBadge } from './InspectionTable';
import { dateLabel, filterInspections, inspectionHistory, isOverdue, qcLabels } from './model';

export function InspectionsPage({ view = 'list' }: { view?: 'list' | 'rework' | 'history' }) {
  const query = useInspections(); const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? ''; const status = params.get('status') ?? 'all'; const descending = params.get('sort') === 'latest';
  function update(key: string, value: string) {
    setParams(previous => { const next = new URLSearchParams(previous); if (value && value !== 'all' && value !== 'soonest') next.set(key, value); else next.delete(key); return next; }, { replace: true });
  }
  const title = view === 'rework' ? 'Rework follow-up' : view === 'history' ? 'Inspection history' : 'Assigned inspections';
  const header = <WorkspaceHeader label="Inspector / Independent quality" title={title} description={view === 'rework' ? 'Track corrective work without changing workshop-owned tasks. Reinspection remains pending backend support.' : view === 'history' ? 'Submitted human decisions remain separate from draft findings.' : 'Review only the inspections assigned to your account.'} />;
  if (query.isPending) return <>{header}<LoadingState label="Loading assigned inspections…" /></>;
  if (query.isError) return <>{header}<ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /></>;
  const source = query.data.filter(item => view !== 'rework' || item.inspection.decision === 'REWORK');
  const rows = filterInspections(source, search, status, descending);
  const history = inspectionHistory(rows);
  if (view === 'history' && params.get('sort') === 'oldest') history.reverse();
  return <>{header}
    {view === 'history' && <aside aria-label="Submitted record policy" className="role-boundary mb-6 text-sm">Immutable submitted decisions. Open an inspection to read its full findings and evidence metadata; this history has no editing action.</aside>}
    <div role="search" aria-label="Filter inspections" className="mb-5 grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
      <div><label className="mb-2 block text-sm font-medium" htmlFor="qc-search">Search inspections, orders, jobs or workshops</label><input id="qc-search" type="search" className={controlClass} value={search} onChange={event => update('q', event.target.value)} /></div>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="qc-filter">{view === 'rework' ? 'Follow-up status' : 'QC status'}</label><select id="qc-filter" className={controlClass} value={status} onChange={event => update('status', event.target.value)}><option value="all">All {view === 'rework' ? 'rework cases' : 'statuses'}</option>{view !== 'rework' && Object.entries(qcLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}{view !== 'history' && <option value="overdue">Overdue</option>}</select></div>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="qc-sort">{view === 'history' ? 'Sort decisions' : 'Sort deadlines'}</label><select id="qc-sort" className={controlClass} value={view === 'history' ? (params.get('sort') === 'oldest' ? 'oldest' : 'newest') : descending ? 'latest' : 'soonest'} onChange={event => update('sort', event.target.value)}>{view === 'history' ? <><option value="newest">Newest first</option><option value="oldest">Oldest first</option></> : <><option value="soonest">Soonest first</option><option value="latest">Latest first</option></>}</select></div>
    </div>
    <p role="status" className="mb-4 text-sm text-muted-foreground">{view === 'history' ? history.length + ' submitted decisions' : rows.length + ' of ' + source.length + (view === 'rework' ? ' rework cases' : ' inspections')}</p>
    {!(view === 'history' ? history.length : rows.length) ? <EmptyState title={view === 'history' ? 'No submitted decisions found' : 'No inspections found'} description="Try another search or clear the filters. Only your assignments appear here." action={<Button variant="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} /> :
    view === 'list' ? <InspectionTable items={rows} /> :
    view === 'rework' ? <DataTable caption="Assigned rework cases" rows={rows} rowKey={item => item.inspection.id} columns={[
      { key: 'order', header: 'Order / workshop', cell: item => <div className="min-w-48"><Link className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline" to={'/inspector/inspections/' + item.inspection.id}>{item.order.id}</Link><p className="text-xs text-muted-foreground">{item.workshop.name}</p></div> },
      { key: 'reason', header: 'Rework reason', cell: item => { const latest = item.inspection.history?.at(-1); return <div className="min-w-56 max-w-md whitespace-pre-wrap text-sm leading-relaxed"><p>{latest?.decision === 'REWORK' ? latest.reason : item.inspection.notes}</p>{latest?.decision === 'REWORK' && <p className="mt-3 text-xs text-muted-foreground"><strong>Corrective action:</strong> {latest.correctiveAction}</p>}</div>; } },
      { key: 'date', header: 'Requested', cell: item => dateLabel(item.inspection.history?.at(-1)?.submittedAt) },
      { key: 'deadline', header: 'Rework deadline', cell: item => <div className="min-w-28"><p>{dateLabel(item.inspection.reworkDeadline)}</p>{isOverdue(item) && <p className="mt-2 font-medium text-destructive">Overdue</p>}</div> },
      { key: 'followup', header: 'Current status / next inspection', cell: () => <p className="min-w-56 text-sm leading-relaxed">Awaiting workshop corrective work. Follow-up inspection required; scheduling is pending backend support.</p> },
    ]} /> : <DataTable caption="Submitted inspection decisions" rows={history} rowKey={item => item.record.id} columns={[
      { key: 'order', header: 'Order / workshop', cell: item => <div className="min-w-44"><Link className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline" to={'/inspector/inspections/' + item.inspection.id}>{item.order.id}</Link><p className="text-xs text-muted-foreground">{item.workshop.name}</p></div> },
      { key: 'inspector', header: 'Inspector', cell: item => item.inspector.name },
      { key: 'decision', header: 'Decision / date', cell: item => <div className="min-w-32"><QCBadge status={item.record.decision} /><p className="mt-2 text-xs text-muted-foreground">{dateLabel(item.record.submittedAt)}</p></div> },
      { key: 'findings', header: 'Findings / rework reason', cell: item => <div className="min-w-64 max-w-md whitespace-pre-wrap text-sm leading-relaxed"><p>{item.record.findings.summary}</p>{item.record.decision === 'REWORK' && <p className="mt-2 text-muted-foreground">{item.record.reason}</p>}<p className="mt-2 text-xs text-muted-foreground">{item.record.findings.items.filter(finding => finding.result === 'FAIL').length} failed findings · open inspection for full record</p></div> },
    ]} />}
    <p className="mt-4 text-xs text-muted-foreground">Dates use India time. Deadline sorting uses the inspection date, or the rework date for rework cases. Tables scroll horizontally on smaller screens.</p>
  </>;
}
