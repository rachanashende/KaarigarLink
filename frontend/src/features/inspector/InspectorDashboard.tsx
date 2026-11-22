import { Link } from 'react-router';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { DemoDataNotice } from '@/components/DemoDataNotice';
import { useInspections } from './queries';
import { InspectionTable } from './InspectionTable';
import { dateLabel, filterInspections, followUpDate, inspectionHistory, inspectionStats, qcLabels } from './model';
import { todayInIndia } from '@/services/jobs';

export function InspectorDashboard() {
  const query = useInspections();
  const header = <WorkspaceHeader label="Inspector / Independent quality" title="Inspector workspace" description="Record human inspection findings, review quality requirements and follow up on rework." action={<Button asChild variant="outline"><Link to="/inspector/inspections">All inspections</Link></Button>} />;
  if (query.isPending) return <>{header}<LoadingState label="Loading assigned inspections…" /></>;
  if (query.isError) return <>{header}<ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /></>;
  const data = query.data; const stats = inspectionStats(data);
  const attention = filterInspections(data, '', 'all').filter(item => item.inspection.decision !== 'ACCEPTED');
  const upcoming = attention.filter(item => (followUpDate(item) ?? '') >= todayInIndia()).slice(0, 4);
  const completed = inspectionHistory(data).slice(0, 4);
  const activity = data.flatMap(item => item.activity).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 5);
  return <>{header}<p className="role-intro">Independent findings.<br />Accountable <em>quality decisions.</em></p><DemoDataNotice />
    <nav aria-label="Inspection priorities" className="role-task-nav"><Link to="/inspector/inspections?status=PENDING">Review pending inspections</Link><Link to="/inspector/inspections?status=overdue">Inspect overdue assignments</Link><Link to="/inspector/rework">Follow up on rework</Link><Link to="/inspector/history">Read submitted decisions</Link></nav>
    <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Total assigned inspections" value={stats.total} detail="Your assignments only" />
      <StatCard label="Pending inspections" value={stats.pending} detail="Awaiting human findings" />
      <StatCard label="Accepted inspections" value={stats.accepted} detail="Submitted QC acceptance" />
      <StatCard label="Rework requested" value={stats.rework} detail="Workshop follow-up needed" />
      <StatCard label="Overdue inspections" value={stats.overdue} detail="Inspection or rework date passed" />
    </div>
    <section aria-labelledby="attention" className="mb-8"><h2 id="attention" className="mb-4 text-lg font-semibold">Assignments requiring attention</h2>{attention.length ? <InspectionTable items={attention} caption="Inspections requiring attention" /> : <EmptyState title="No inspections need attention" description="Your assigned pending inspections and rework follow-ups will appear here." />}</section>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section aria-labelledby="upcoming-qc" className="rounded-lg border bg-card p-6"><h2 id="upcoming-qc" className="text-lg font-semibold">Upcoming inspection & rework deadlines</h2>{upcoming.length ? <ul className="mt-4 divide-y">{upcoming.map(item => <li key={item.inspection.id} className="py-3"><Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline" to={'/inspector/inspections/' + item.inspection.id}>{item.job.title}</Link><p className="text-xs text-muted-foreground">{dateLabel(followUpDate(item))} · {qcLabels[item.inspection.decision]}</p></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No upcoming deadlines recorded.</p>}</section>
      <section aria-labelledby="completed-qc" className="rounded-lg border bg-card p-6"><h2 id="completed-qc" className="text-lg font-semibold">Recently completed inspections</h2>{completed.length ? <ul className="mt-4 divide-y">{completed.map(item => <li key={item.record.id} className="py-3"><Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline" to={'/inspector/inspections/' + item.inspection.id}>{item.job.title}</Link><p className="text-xs text-muted-foreground">{qcLabels[item.record.decision]} · {dateLabel(item.record.submittedAt)}</p></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No submitted decisions yet.</p>}</section>
      <section aria-labelledby="followup-qc" className="rounded-lg border bg-card p-6"><h2 id="followup-qc" className="text-lg font-semibold">Rework requiring follow-up</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{stats.rework} assigned rework cases. Workshop execution and reinspection are not available in this demo.</p><Link className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline" to="/inspector/rework">View rework cases</Link></section>
      <section aria-labelledby="qc-activity" className="rounded-lg border bg-card p-6"><h2 id="qc-activity" className="text-lg font-semibold">Recent QC activity</h2>{activity.length ? <ul className="mt-4 divide-y">{activity.map(event => <li key={event.id} className="py-3 text-sm"><p>{event.action === 'MOCK_QC_ACCEPTED' ? 'Mock QC acceptance recorded' : 'Mock rework request recorded'}</p><p className="mt-2 text-xs text-muted-foreground">{event.entityId} · {dateLabel(event.occurredAt)}</p></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No new QC activity. Historical decisions are available in Inspection history.</p>}<Link className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline" to="/inspector/history">Inspection history</Link></section>
    </div>
  </>;
}
