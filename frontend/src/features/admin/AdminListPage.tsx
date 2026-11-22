import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { controlClass } from '@/components/FormField';
import { useAdminOverview } from './queries';
import { sectionTitles, usersRows, workshopRows, jobsRows, ordersRows, qualityRows, statusLabel, type AdminSection } from './model';
import { UsersTable, WorkshopsTable, JobsTable, OrdersTable, QualityTable } from './AdminTables';

export function AdminListPage({ section }: { section: AdminSection }) {
  const query = useAdminOverview(); const [params, setParams] = useSearchParams();
  const names = section === 'users' || section === 'workshops';
  const filters = { search: params.get('q') ?? '', filter: params.get('filter') ?? 'all', sort: params.get('sort') ?? (names ? 'name' : section === 'quality' ? 'deadline' : 'newest') };
  function update(key: string, value: string) {
    setParams(previous => { const next = new URLSearchParams(previous); if (value && value !== 'all') next.set(key, value); else next.delete(key); return next; }, { replace: true });
  }
  const header = <PageHeader title={sectionTitles[section]} description="Platform-wide operational records. Administrative business actions await approved contracts." action={<Button variant="outline" onClick={() => { void query.refetch(); }}>Refresh data</Button>} />;
  if (query.isPending) return <>{header}<LoadingState label="Loading platform records…" /></>;
  if (query.isError) return <>{header}<ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /></>;
  const data = query.data;
  const choices = section === 'users' ? [...new Set(data.users.map(item => item.role))] : section === 'workshops' ? [...new Set(data.workshops.flatMap(item => item.capabilities))] : section === 'jobs' ? [...new Set(data.jobs.map(item => item.status))] : section === 'orders' ? [...new Set(data.orders.map(item => item.status))] : ['PENDING', 'ACCEPTED', 'REWORK', 'overdue'];
  const filterLabel = section === 'users' ? 'Role' : section === 'workshops' ? 'Capability' : section === 'quality' ? 'QC status' : 'Lifecycle status';
  const total = section === 'quality' ? data.inspections.length : data[section].length;
  let count = 0; let table;
  if (section === 'users') { const rows = usersRows(data, filters); count = rows.length; table = <UsersTable rows={rows} data={data} />; }
  if (section === 'workshops') { const rows = workshopRows(data, filters); count = rows.length; table = <WorkshopsTable rows={rows} data={data} />; }
  if (section === 'jobs') { const rows = jobsRows(data, filters); count = rows.length; table = <JobsTable rows={rows} data={data} />; }
  if (section === 'orders') { const rows = ordersRows(data, filters); count = rows.length; table = <OrdersTable rows={rows} data={data} />; }
  if (section === 'quality') { const rows = qualityRows(data, filters); count = rows.length; table = <QualityTable rows={rows} data={data} />; }
  return <>{header}
    <div role="search" aria-label={'Filter ' + sectionTitles[section]} className="mb-5 grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
      <div><label htmlFor="admin-search" className="mb-2 block text-sm font-medium">Search {section === 'quality' ? 'inspections' : section}</label><input id="admin-search" className={controlClass} type="search" value={filters.search} onChange={event => update('q', event.target.value)} /></div>
      <div><label htmlFor="admin-filter" className="mb-2 block text-sm font-medium">{filterLabel}</label><select id="admin-filter" className={controlClass} value={filters.filter} onChange={event => update('filter', event.target.value)}><option value="all">All {section === 'workshops' ? 'capabilities' : section === 'users' ? 'roles' : 'statuses'}</option>{choices.sort().map(value => <option key={value} value={value}>{value === 'overdue' ? 'Overdue rework' : section === 'workshops' ? value : statusLabel(value)}</option>)}</select></div>
      <div><label htmlFor="admin-sort" className="mb-2 block text-sm font-medium">Sort records</label><select id="admin-sort" className={controlClass} value={filters.sort} onChange={event => update('sort', event.target.value)}>{names ? <><option value="name">Name: A–Z</option><option value="name-desc">Name: Z–A</option></> : <>{section !== 'quality' && <><option value="newest">Newest first</option><option value="oldest">Oldest first</option></>}<option value="deadline">Deadline: soonest</option><option value="deadline-desc">Deadline: latest</option></>}</select></div>
    </div>
    <p role="status" className="mb-4 text-sm text-muted-foreground">{count} of {total} records</p>
    {count ? table : <EmptyState title="No records found" description={total ? 'Try another search or clear the filters.' : 'Records will appear here when present in the shared demo store.'} action={<Button variant="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />}
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{section === 'users' ? 'Account status and registration dates are not supplied. No role changes, deletion or suspension is available.' : section === 'workshops' ? 'Published capacity is shown per slot and unit. Verification status and suspension are not supported.' : section === 'quality' ? 'QC is read-only here. Deadline sorting uses inspection dates, or rework deadlines for rework cases. Draft findings are excluded.' : 'Current lifecycle states are shown as recorded. No status changes or award execution are available.'} Tables scroll horizontally on smaller screens.</p>
  </>;
}
