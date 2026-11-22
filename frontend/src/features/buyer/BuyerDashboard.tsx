import { CalendarDays, FileText, ListChecks, MessageSquareText, Plus, Factory } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/feedback';
import { useAuth } from '@/features/auth/context';
import { useBuyerDashboard } from './queries';
import { dashboardStats, dateLabel, filterJobs, jobStatuses, upcomingJobs } from './model';
import { JobsTable } from './JobsTable';
import { BuyerLoading } from './BuyerLoading';

export function BuyerDashboard() {
  const { user } = useAuth();
  const query = useBuyerDashboard();
  const action = <Button asChild><Link to="/buyer/jobs/new"><Plus aria-hidden="true" className="size-4" />Post a job</Link></Button>;
  const header = <PageHeader title="Buyer workspace" description={'Welcome back, ' + user?.name.split(' ')[0] + '. Keep your manufacturing requirements in view.'} action={action} />;
  if (query.isPending) return <>{header}<BuyerLoading /></>;
  if (query.isError) return <>{header}<ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /></>;
  const data = query.data;
  const stats = dashboardStats(data);
  const upcoming = upcomingJobs(data.jobs);
  const activity = [...data.activity].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 5);
  return <>{header}
    <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total posted jobs" value={stats.total} detail="All jobs posted by your account" icon={<FileText className="size-4" />} />
      <StatCard label="Active jobs" value={stats.active} detail="Posted, quoting or awarded" icon={<ListChecks className="size-4" />} />
      <StatCard label="Pending quotations" value={stats.pendingQuotes} detail="Submitted quotes awaiting a decision" icon={<MessageSquareText className="size-4" />} />
      <StatCard label="Orders in production" value={stats.inProduction} detail="Read-only workshop production snapshots" icon={<Factory className="size-4" />} />
    </div>
    <Link className="mb-6 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline" to="/buyer/orders">Track manufacturing orders</Link>
    <section aria-labelledby="recent-jobs" className="mb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="recent-jobs" className="text-lg font-semibold">Recent manufacturing jobs</h2><Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline" to="/buyer/jobs">View all jobs</Link></div>
      {data.jobs.length ? <JobsTable jobs={filterJobs(data.jobs, '', 'all', 'newest').slice(0, 5)} caption="Recent manufacturing jobs" /> : <EmptyState title="Post your first manufacturing job" description="Describe the work, material and delivery requirements. Your job will appear here after posting." action={action} />}
    </section>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section aria-labelledby="job-overview" className="rounded-lg border bg-card p-6">
        <h2 id="job-overview" className="text-lg font-semibold">Job status overview</h2>
        <p className="mt-2 text-xs text-muted-foreground">Counts from your posted requirements</p>
        <dl className="mt-5 divide-y">{Object.entries(jobStatuses).map(([status, label]) => <div key={status} className="flex items-center justify-between gap-4 py-3 text-sm"><dt>{label}</dt><dd className="font-semibold tabular-nums">{data.jobs.filter(job => job.status === status).length}</dd></div>)}</dl>
      </section>
      <section aria-labelledby="delivery-deadlines" className="rounded-lg border bg-card p-6">
        <h2 id="delivery-deadlines" className="text-lg font-semibold">Upcoming delivery deadlines</h2>
        <p className="mt-2 text-xs text-muted-foreground">Requested dates on active jobs · India time</p>
        {upcoming.length ? <ul className="mt-5 divide-y">{upcoming.map(job => <li key={job.id} className="py-3"><Link to={'/buyer/jobs/' + encodeURIComponent(job.id)} className="group flex min-h-11 items-start gap-3 rounded-sm">
          <CalendarDays aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /><span className="min-w-0"><span className="block text-sm font-medium text-primary group-hover:underline">{job.title}</span><span className="mt-1 block text-xs text-muted-foreground">{dateLabel(job.deadline)} · {job.location.city}</span></span>
        </Link></li>)}</ul> : <p className="mt-6 text-sm text-muted-foreground">No upcoming delivery deadlines.</p>}
      </section>
    </div>
    <section aria-labelledby="recent-activity" className="mt-8 rounded-lg border bg-card p-6">
      <h2 id="recent-activity" className="text-lg font-semibold">Recent activity</h2>
      {activity.length ? <ul className="mt-4 divide-y">{activity.map(event => {
        const job = data.jobs.find(job => job.id === event.entityId);
        return <li key={event.id} className="flex flex-wrap justify-between gap-2 py-4 text-sm"><div><p className="font-medium">{event.action === 'JOB_POSTED' ? 'Manufacturing job posted' : event.action.replaceAll('_', ' ').toLowerCase()}</p>{job ? <Link className="mt-1 inline-flex min-h-11 items-center text-primary hover:underline" to={'/buyer/jobs/' + encodeURIComponent(job.id)}>{job.title}</Link> : <p className="mt-2 text-muted-foreground">Related order activity</p>}</div><time dateTime={event.occurredAt} className="text-xs text-muted-foreground">{dateLabel(event.occurredAt)}</time></li>;
      })}</ul> : <p className="mt-5 text-sm text-muted-foreground">No activity yet. Job posting events will appear here.</p>}
    </section>
  </>;
}
