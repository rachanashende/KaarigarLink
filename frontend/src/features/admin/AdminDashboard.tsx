import { Link } from 'react-router';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/feedback';
import { DemoDataNotice } from '@/components/DemoDataNotice';
import { useAdminOverview } from './queries';
import { metrics, operationalAlerts, jobsRows, ordersRows, sections, sectionTitles, dateLabel } from './model';
import { JobsTable, OrdersTable, QualityTable, RecordLink } from './AdminTables';
import { OperationalAlerts } from './OperationalAlerts';

export function AdminDashboard() {
  const query = useAdminOverview();
  const header = <WorkspaceHeader label="Admin / Platform operations" title="Admin workspace" description="A shared operational view of manufacturing demand, workshop activity and quality follow-up." action={<Button variant="outline" onClick={() => { void query.refetch(); }}>Refresh data</Button>} />;
  if (query.isPending) return <>{header}<LoadingState label="Loading platform operations…" /></>;
  if (query.isError) return <>{header}<ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /></>;
  const data = query.data; const counts = metrics(data); const alerts = operationalAlerts(data);
  const activity = [...data.activity].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 6);
  const needsAttention = data.workshops.filter(workshop => alerts.some(alert => alert.workshopId === workshop.id));
  return <>{header}<p className="role-intro">A clear view of<br /><em>manufacturing operations.</em></p><DemoDataNotice />
    <aside aria-label="Administrative authority" className="role-boundary mb-6 text-sm">Read-only platform oversight. Inspectors own QC decisions; workshops own their invitations and quotations. No moderation, award, production or payment command is available here.</aside>
    <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {[['Total registered users', counts.users, 'All demo roles'], ['Total buyers', counts.buyers, 'Registered buyer accounts'], ['Total workshops', counts.workshops, 'Published workshop profiles'], ['Active manufacturing jobs', counts.jobs, 'Posted, quoting or awarded'], ['Active orders', counts.orders, 'Excludes closed and cancelled'], ['Pending inspections', counts.pending, 'Awaiting inspector decisions'], ['Open rework cases', counts.rework, 'Current rework inspection records']].map(([label, value, detail]) => <StatCard key={String(label)} label={String(label)} value={value!} detail={String(detail)} />)}
    </div>
    <nav aria-label="Admin management" className="role-management mb-8 flex flex-wrap gap-3">{sections.map(section => <Button key={section} asChild variant="outline"><Link to={'/admin/' + section}>{sectionTitles[section]}</Link></Button>)}</nav><div className="mb-8"><OperationalAlerts alerts={alerts} /></div>
    <section aria-labelledby="marketplace-activity" className="mb-8 rounded-lg border bg-card p-5 sm:p-6"><h2 id="marketplace-activity" className="text-lg font-semibold">Platform activity overview</h2><dl className="mt-5 grid gap-5 sm:grid-cols-3">{[['Supplied match records', data.matches.length], ['Invitations recorded', data.invitations.length], ['Submitted quotations', data.quotes.filter(quote => quote.status === 'SUBMITTED').length]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{value}</dd></div>)}</dl><p className="mt-4 text-xs text-muted-foreground">Counts from stored records. Match scores and workshop ratings are shown as supplied.</p></section>
    <section aria-labelledby="recent-admin-jobs" className="mb-8"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="recent-admin-jobs" className="text-lg font-semibold">Recent manufacturing jobs</h2><Link to="/admin/jobs" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">All jobs</Link></div><JobsTable rows={jobsRows(data, { search: '', filter: 'all', sort: 'newest' }).slice(0, 3)} data={data} /></section>
    <section aria-labelledby="recent-admin-orders" className="mb-8"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="recent-admin-orders" className="text-lg font-semibold">Recent orders</h2><Link to="/admin/orders" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">All orders</Link></div><OrdersTable rows={ordersRows(data, { search: '', filter: 'all', sort: 'newest' }).slice(0, 3)} data={data} /></section>
    <section aria-labelledby="pending-admin-qc" className="mb-8"><h2 id="pending-admin-qc" className="mb-4 text-lg font-semibold">Pending QC issues</h2><QualityTable rows={data.inspections.filter(item => item.decision === 'PENDING' || item.decision === 'REWORK')} data={data} /></section>
    <div className="mb-8 grid items-start gap-6 lg:grid-cols-2">
      <section aria-labelledby="workshop-attention" className="rounded-lg border bg-card p-5 sm:p-6"><h2 id="workshop-attention" className="text-lg font-semibold">Workshops requiring attention</h2>{needsAttention.length ? <ul className="mt-4 divide-y">{needsAttention.map(workshop => <li key={workshop.id} className="py-3"><RecordLink section="workshops" id={workshop.id}>{workshop.name}</RecordLink><p className="text-xs text-muted-foreground">{alerts.filter(alert => alert.workshopId === workshop.id).length} operational alerts · view related records</p></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No workshop-linked operational alerts.</p>}</section>
      <section aria-labelledby="platform-audit" className="rounded-lg border bg-card p-5 sm:p-6"><h2 id="platform-audit" className="text-lg font-semibold">Recent platform activity</h2>{activity.length ? <ul className="mt-4 divide-y">{activity.map(event => <li key={event.id} className="py-3"><RecordLink section={event.entityType === 'Job' ? 'jobs' : 'orders'} id={event.entityId}>{event.action.replaceAll('_', ' ').toLowerCase()}</RecordLink><p className="text-xs text-muted-foreground">{event.entityId} · {dateLabel(event.occurredAt)} · {data.users.find(user => user.id === event.actorId)?.name ?? 'Actor not recorded'}</p></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No platform activity recorded.</p>}</section>
    </div>

  </>;
}
