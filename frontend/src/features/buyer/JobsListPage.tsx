import { Link, useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/feedback';
import { useBuyerJobs } from './queries';
import { filterJobs, jobStatuses, type JobSort } from './model';
import { JobsTable } from './JobsTable';
import { BuyerLoading } from './BuyerLoading';
import { jobControlClass } from './JobField';

export function JobsListPage() {
  const query = useBuyerJobs();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const requestedStatus = params.get('status') ?? 'all';
  const status = Object.hasOwn(jobStatuses, requestedStatus) ? requestedStatus : 'all';
  const requestedSort = params.get('sort') ?? 'newest';
  const sort: JobSort = requestedSort === 'oldest' || requestedSort === 'deadline' || requestedSort === 'deadline-desc' ? requestedSort : 'newest';
  function updateFilter(key: string, value: string) {
    setParams(previous => { const next = new URLSearchParams(previous); if (value && value !== 'all' && value !== 'newest') next.set(key, value); else next.delete(key); return next; }, { replace: true });
  }
  const action = <Button asChild><Link to="/buyer/jobs/new"><Plus aria-hidden="true" className="size-4" />Post a job</Link></Button>;
  const header = <PageHeader title="Manufacturing jobs" description="Manage the requirements posted by your account." action={action} />;
  if (query.isPending) return <>{header}<BuyerLoading label="Loading your manufacturing jobs…" /></>;
  if (query.isError) return <>{header}<ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /></>;
  const jobs = filterJobs(query.data, search, status, sort);
  return <>{header}
    <div role="search" aria-label="Filter manufacturing jobs" className="mb-5 grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
      <div><label htmlFor="job-search" className="mb-2 block text-sm font-medium">Search job titles</label><input id="job-search" type="search" className={jobControlClass} value={search} onChange={event => updateFilter('q', event.target.value)} /></div>
      <div><label htmlFor="job-status" className="mb-2 block text-sm font-medium">Status</label><select id="job-status" className={jobControlClass} value={status} onChange={event => updateFilter('status', event.target.value)}><option value="all">All statuses</option>{Object.entries(jobStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div><label htmlFor="job-sort" className="mb-2 block text-sm font-medium">Sort jobs</label><select id="job-sort" className={jobControlClass} value={sort} onChange={event => updateFilter('sort', event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="deadline">Deadline: soonest</option><option value="deadline-desc">Deadline: latest</option></select></div>
    </div>
    <p role="status" className="mb-4 text-sm text-muted-foreground">{jobs.length} of {query.data.length} jobs</p>
    {!query.data.length ? <EmptyState title="No manufacturing jobs yet" description="Post your first requirement to keep your manufacturing brief and delivery details together." action={action} /> : jobs.length ? <JobsTable jobs={jobs} /> : <EmptyState title="No jobs match these filters" description="Try another title or clear the filters to see your jobs." action={<Button variant="outline" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />}
    <p className="mt-5 text-xs text-muted-foreground">Mock workspace · development data is saved on this browser; production demo builds are memory-only. Reset demo data from Manufacturing orders.</p>
  </>;
}
