import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/DataTable';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { useAdminOverview } from './queries';
import { sectionTitles, dateLabel, moneyLabel, statusLabel, operationalAlerts, type AdminSection } from './model';
import { AdminBadge, JobsTable, OrdersTable, QualityTable, RecordLink, ProductionProgress } from './AdminTables';
import { OperationalAlerts } from './OperationalAlerts';
import { InspectorAssignment, WorkshopVerification } from './AdminCommands';
import { DocumentList } from '@/components/DocumentList';
import { OrderHistory } from '@/components/OrderHistory';
import { placeLabel } from '@/components/utils';

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="role-facts grid gap-6 text-sm sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 break-words leading-relaxed">{value}</dd></div>)}</dl>;
}
function Missing({ section }: { section: AdminSection }) {
  return <><WorkspaceHeader label="Admin / Platform operations" title="Record unavailable" description="No matching record exists in the current platform snapshot." /><Button asChild variant="outline"><Link to={'/admin/' + section}>Return to {sectionTitles[section].toLowerCase()}</Link></Button></>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section aria-label={title} className="role-surface border bg-card"><h2 className="mb-5 text-lg font-semibold">{title}</h2>{children}</section>;
}
export function AdminDetailPage({ section }: { section: AdminSection }) {
  const { id = '' } = useParams(); const query = useAdminOverview();
  if (query.isPending) return <LoadingState label="Loading platform record…" />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} />;
  const data = query.data; const alerts = operationalAlerts(data);
  let title = ''; let content: ReactNode;
  if (section === 'users') {
    const user = data.users.find(item => item.id === id); if (!user) return <Missing section={section} />;
    title = user.name;
    const ownedWorkshops = data.workshops.filter(item => item.ownerId === id);
    content = <div className="space-y-6"><Section title="Account information"><Facts rows={[
      ['User ID', user.id], ['Email', user.email], ['Role', <AdminBadge status={user.role} />],
      ['Account status', 'Not supplied by the current contract'], ['Registration date', 'Not recorded'],
      ['Related workshops', ownedWorkshops.length ? ownedWorkshops.map(item => <RecordLink key={item.id} section="workshops" id={item.id}>{item.name}</RecordLink>) : 'Not applicable'],
    ]} /><p className="mt-5 text-xs text-muted-foreground">Role changes, deletion and suspension are unavailable until approved backend contracts exist.</p></Section>
      {user.role === 'buyer' && <Section title="Buyer manufacturing jobs"><JobsTable rows={data.jobs.filter(job => job.buyerId === id)} data={data} /></Section>}
      {(user.role === 'buyer' || ownedWorkshops.length > 0) && <Section title="Related orders"><OrdersTable rows={data.orders.filter(order => order.buyerId === id || ownedWorkshops.some(workshop => workshop.id === order.workshopId))} data={data} /></Section>}
      {user.role === 'inspector' && <Section title="Assigned quality inspections"><QualityTable rows={data.inspections.filter(item => item.inspectorId === id)} data={data} /></Section>}
    </div>;
  }
  if (section === 'workshops') {
    const workshop = data.workshops.find(item => item.id === id); if (!workshop) return <Missing section={section} />;
    title = workshop.name;
    const jobIds = new Set([...data.matches, ...data.invitations, ...data.quotes, ...data.orders].filter(item => item.workshopId === id).map(item => item.jobId));
    content = <div className="space-y-6"><Section title="Published workshop profile"><Facts rows={[
      ['Workshop ID', id], ['Location', placeLabel(workshop.location)],
      ['Owner', <RecordLink section="users" id={workshop.ownerId}>{data.users.find(user => user.id === workshop.ownerId)!.name}</RecordLink>],
      ['Capabilities', workshop.capabilities.join(', ') || 'Not provided'], ['Rating', workshop.rating ?? 'Not recorded'],
      ['Verification status', workshop.verificationStatus ? statusLabel(workshop.verificationStatus) : 'Not supplied; no verification or suspension command exists'],
      ['Machinery', workshop.machines.length ? <ul className="space-y-2">{workshop.machines.map(machine => <li key={machine.id}>{machine.name} · {machine.process}</li>)}</ul> : 'Not provided'],
      ['Published capacity', workshop.capacitySlots.length ? <ul className="space-y-2">{workshop.capacitySlots.map(slot => <li key={slot.id}>{slot.availableQuantity} {slot.unit} · {dateLabel(slot.startsOn)} – {dateLabel(slot.endsOn)}</li>)}</ul> : 'Not provided'],
    ]} /></Section>
      <WorkshopVerification workshop={workshop} />
      <Section title="Related jobs and marketplace activity"><JobsTable rows={data.jobs.filter(job => jobIds.has(job.id))} data={data} /></Section>
      <Section title="Workshop orders"><OrdersTable rows={data.orders.filter(order => order.workshopId === id)} data={data} /></Section>
      <OperationalAlerts alerts={alerts.filter(alert => alert.workshopId === id)} />
    </div>;
  }
  if (section === 'jobs') {
    const job = data.jobs.find(item => item.id === id); if (!job) return <Missing section={section} />;
    title = job.title;
    content = <div className="space-y-6"><Section title="Manufacturing brief"><Facts rows={[
      ['Job ID', id], ['Buyer', <RecordLink section="users" id={job.buyerId}>{data.users.find(user => user.id === job.buyerId)!.name}</RecordLink>],
      ['Lifecycle status', <AdminBadge status={job.backendStatus ?? job.status} />], ['Capability', job.capability], ['Quantity', job.quantity + ' ' + job.unit],
      ['Material', job.material], ['Requirements', job.processes.join(', ')], ['Specification', job.specification || 'Not provided'],
      ['Description', job.description], ['Delivery deadline', dateLabel(job.deadline)], ['Created', dateLabel(job.createdAt)],
      ['Delivery location', job.location.city + ', ' + job.location.state],
    ]} /></Section>
      <Section title={data.assignments ? 'Invitation match snapshots (scores stored when each invitation was sent)' : 'Matching records'}><DataTable caption="Job match records" rows={data.matches.filter(item => item.jobId === id)} rowKey={item => item.workshopId} columns={[
        { key: 'workshop', header: 'Workshop', cell: item => <RecordLink section="workshops" id={item.workshopId}>{data.workshops.find(workshop => workshop.id === item.workshopId)!.name}</RecordLink> },
        { key: 'score', header: 'Supplied score', cell: item => item.score },
        { key: 'eligibility', header: 'Eligibility / explanations', cell: item => <div className="min-w-56"><p>{item.eligibility.eligible ? 'Eligible match' : 'Ineligible match'}</p><ul className="mt-2 space-y-2 text-xs text-muted-foreground">{[...item.explanations, ...item.eligibility.reasons].map((reason, index) => <li key={index}>{reason}</li>)}</ul></div> },
      ]} /></Section>
      <Section title="Invitations"><DataTable caption="Job invitations" rows={data.invitations.filter(item => item.jobId === id)} rowKey={item => item.id} columns={[
        { key: 'id', header: 'Invitation', cell: item => item.id },
        { key: 'workshop', header: 'Workshop', cell: item => <RecordLink section="workshops" id={item.workshopId}>{data.workshops.find(workshop => workshop.id === item.workshopId)!.name}</RecordLink> },
        { key: 'status', header: 'Status', cell: item => <AdminBadge status={item.status} /> },
      ]} /></Section>
      <Section title="Quotations"><DataTable caption="Job quotations" rows={data.quotes.filter(item => item.jobId === id)} rowKey={item => item.id} columns={[
        { key: 'quote', header: 'Quote / workshop', cell: item => <div className="min-w-44"><p>{item.id}</p><RecordLink section="workshops" id={item.workshopId}>{data.workshops.find(workshop => workshop.id === item.workshopId)!.name}</RecordLink></div> },
        { key: 'amount', header: 'Value / delivery', cell: item => <div className="min-w-32"><p>{moneyLabel(item.amount)}</p><p className="mt-2 text-xs">{dateLabel(item.estimatedDelivery)}</p></div> },
        { key: 'status', header: 'Status', cell: item => <AdminBadge status={item.status} /> },
        { key: 'notes', header: 'Terms', cell: item => <p className="min-w-56 max-w-md whitespace-pre-wrap text-sm leading-relaxed">{item.notes}</p> },
      ]} /><p className="mt-4 text-xs text-muted-foreground">Read-only quotation terms. Award execution remains disabled pending backend approval.</p></Section>
      <Section title="Related orders"><OrdersTable rows={data.orders.filter(order => order.jobId === id)} data={data} /></Section>
      <OperationalAlerts alerts={alerts.filter(alert => alert.href === '/admin/jobs/' + encodeURIComponent(id))} />
    </div>;
  }
  if (section === 'orders') {
    const order = data.orders.find(item => item.id === id); if (!order) return <Missing section={section} />;
    title = order.id; const job = data.jobs.find(item => item.id === order.jobId)!; const quote = data.quotes.find(item => item.id === order.quoteId)!;
    const inspections = data.inspections.filter(item => item.orderId === id);
    content = <div className="space-y-6"><Section title="Order overview"><Facts rows={[
      ['Manufacturing job', <RecordLink section="jobs" id={job.id}>{job.title}</RecordLink>],
      ['Buyer', <RecordLink section="users" id={order.buyerId}>{data.users.find(user => user.id === order.buyerId)!.name}</RecordLink>],
      ['Workshop', <RecordLink section="workshops" id={order.workshopId}>{data.workshops.find(workshop => workshop.id === order.workshopId)!.name}</RecordLink>],
      ['Order production status', <AdminBadge status={order.status} />], ['Latest QC summary', order.qcStatus ? <AdminBadge status={order.qcStatus} /> : 'Not recorded'],
      ['Order value', moneyLabel(quote.amount)], ['Delivery commitment', dateLabel(quote.estimatedDelivery)], ['Created', dateLabel(order.createdAt)],
      ['Production progress', <ProductionProgress order={order} />], ['Quotation', quote.id], ['Commercial terms', quote.notes],
    ]} /></Section>
      <InspectorAssignment order={order} data={data} />
      <DocumentList scope="order" id={order.id} title="Inspection evidence" />
      <DocumentList scope="job" id={order.jobId} title="Design files" />
      <OrderHistory orderId={order.id} />
      <Section title="Production milestones">{order.milestones.length ? <ol className="divide-y">{order.milestones.map(step => <li key={step.id} className="py-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">{step.title}</h3><AdminBadge status={step.stage ?? step.status} /></div><p className="mt-3 text-xs text-muted-foreground">Planned {dateLabel(step.dueOn)} · Completed {dateLabel(step.completedAt)}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{step.notes ?? step.description ?? 'No supporting notes.'}</p></li>)}</ol> : <p className="text-sm text-muted-foreground">No production milestones recorded.</p>}<p className="mt-4 text-xs text-muted-foreground">Workshop-owned production data is read-only. Completion does not imply QC acceptance, payment or closure.</p></Section>
      <Section title="Related quality inspections"><QualityTable rows={inspections} data={data} /></Section>
      <OperationalAlerts alerts={alerts.filter(alert => alert.href === '/admin/orders/' + encodeURIComponent(id) || inspections.some(inspection => alert.href === '/admin/quality/' + encodeURIComponent(inspection.id)))} />
    </div>;
  }
  if (section === 'quality') {
    const inspection = data.inspections.find(item => item.id === id); if (!inspection) return <Missing section={section} />;
    title = inspection.id; const order = data.orders.find(item => item.id === inspection.orderId)!;
    const history = [...(inspection.history ?? [])].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    content = <div className="space-y-6"><Section title="Quality inspection overview"><Facts rows={[
      ['Order', <RecordLink section="orders" id={order.id} />], ['Manufacturing job', <RecordLink section="jobs" id={order.jobId}>{data.jobs.find(job => job.id === order.jobId)!.title}</RecordLink>],
      ['Workshop', <RecordLink section="workshops" id={order.workshopId}>{data.workshops.find(workshop => workshop.id === order.workshopId)!.name}</RecordLink>],
      ['Assigned inspector', <RecordLink section="users" id={inspection.inspectorId}>{data.users.find(user => user.id === inspection.inspectorId)!.name}</RecordLink>],
      ['Inspection QC status', <AdminBadge status={inspection.decision} />], ['Order production status', <AdminBadge status={order.status} />],
      ['Inspection deadline', dateLabel(inspection.dueOn)], ['Rework deadline', dateLabel(inspection.reworkDeadline)],
      ['Last updated', dateLabel(inspection.updatedAt)], ['Submitted notes', inspection.notes || 'No submitted notes'],
    ]} /><p className="mt-5 text-xs text-muted-foreground">Submitted findings only. Drafts and evidence metadata are excluded. Admin cannot decide QC, change assignments or schedule reinspection.</p></Section>
      <Section title="Inspection history & rework findings">{history.length ? <ol className="space-y-5">{history.map(record => <li key={record.id} className="rounded-md border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><AdminBadge status={record.decision} /><time className="text-xs text-muted-foreground" dateTime={record.submittedAt}>{dateLabel(record.submittedAt)}</time></div><RecordLink section="users" id={record.inspectorId}>{data.users.find(user => user.id === record.inspectorId)?.name ?? record.inspectorId}</RecordLink><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.findings.summary}</p>{record.decision === 'REWORK' && <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">Rework reason</dt><dd className="mt-1 whitespace-pre-wrap">{record.reason}</dd></div><div><dt className="text-xs text-muted-foreground">Corrective action</dt><dd className="mt-1 whitespace-pre-wrap">{record.correctiveAction}</dd></div><div><dt className="text-xs text-muted-foreground">Rework deadline</dt><dd className="mt-1">{dateLabel(record.reworkDeadline)}</dd></div></dl>}<ul className="mt-4 divide-y">{record.findings.items.map(finding => <li key={finding.id} className="py-3 text-sm"><p className="font-medium">{inspection.checklist?.find(check => check.id === finding.id)?.label ?? finding.id}: {statusLabel(finding.result)}</p><p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{finding.notes || 'No additional notes.'}</p></li>)}</ul></li>)}</ol> : <EmptyState title="No submitted decisions" description="Pending inspection findings remain private to the assigned inspector until submitted." />}</Section>
      <OperationalAlerts alerts={alerts.filter(alert => alert.href === '/admin/quality/' + encodeURIComponent(id))} />
    </div>;
  }
  return <><WorkspaceHeader label="Admin / Platform operations" title={title} description="Read-only platform record" action={<Button asChild variant="outline"><Link to={'/admin/' + section}>Back to {sectionTitles[section].toLowerCase()}</Link></Button>} />{content}</>;
}
