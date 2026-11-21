import { WorkshopInvitationActions, WorkshopQuoteActions } from './WorkshopActions';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/feedback';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { controlClass } from '@/components/FormField';
import type { WorkshopSection } from '@/app/roles';
import type { WorkshopInvitationData, WorkshopJob, WorkshopOrderData, WorkshopQuotationData, WorkshopWorkspace } from '@/services/workshop';
import { dateLabel, moneyLabel, quantityLabel } from '@/features/buyer/model';
import { OrderProgress } from '@/features/buyer/OrderProgress';

function State({ value }: { value: string | undefined }) {
  return <StatusBadge tone={value === 'REWORK' ? 'warning' : 'neutral'}>{value?.replaceAll('_', ' ') ?? 'Not supplied'}</StatusBadge>;
}
function RecordLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="inline-flex min-h-11 items-center break-words font-medium text-primary underline-offset-4 hover:underline" to={to}>{children}</Link>;
}
function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="role-facts grid gap-5 border bg-card sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 break-words text-sm font-medium">{value}</dd></div>)}</dl>;
}
function JobDetails({ job }: { job: WorkshopJob }) {
  return <Facts rows={[
    ['Job', job.title], ['Manufacturing capability', job.capability], ['Job ID', job.id], ['Buyer ID', job.buyerId], ['Description', job.description],
    ['Quantity', quantityLabel(job)], ['Material', job.material], ['Specification', job.specification || 'Not supplied'],
    ['Processes', job.processes.join(', ') || 'Not supplied'], ['Delivery location', job.location.city + ', ' + job.location.state],
    ['Job deadline', dateLabel(job.deadline)], ['Job created', dateLabel(job.createdAt)],
    ['Buyer budget', job.budget === undefined ? 'Not supplied' : moneyLabel(job.budget)],
  ]} />;
}
function Quotes({ rows }: { rows: WorkshopQuotationData[] }) {
  return <DataTable caption="Workshop quotation history" rows={rows} rowKey={row => row.quote.id} emptyTitle="No quotations recorded" emptyDescription="No canonical quotations are assigned to this workshop." columns={[
    { key: 'id', header: 'Quote', cell: row => row.quote.id },
    { key: 'job', header: 'Job / buyer', cell: row => <div className="min-w-44"><p>{row.job.title}</p><p className="mt-2 text-xs text-muted-foreground">{row.job.capability}</p><p className="mt-2 text-xs text-muted-foreground">{row.buyer.name}</p></div> },
    { key: 'price', header: 'Quoted total', cell: row => <span className="whitespace-nowrap">{moneyLabel(row.quote.amount)}</span> },
    { key: 'date', header: 'Estimated delivery', cell: row => <span className="whitespace-nowrap">{dateLabel(row.quote.estimatedDelivery)}</span> },
    { key: 'status', header: 'Quotation status', cell: row => <State value={row.quote.status} /> },
    { key: 'notes', header: 'Notes', cell: row => <p className="min-w-52">{row.quote.notes || 'Not supplied'}</p> },
    { key: 'commands', header: 'Local mock commands', cell: row => <WorkshopQuoteActions row={row} /> },
  ]} />;
}
function Invitations({ rows }: { rows: WorkshopInvitationData[] }) {
  return <DataTable caption="Workshop invitations" rows={rows} rowKey={row => row.invitation.id} emptyTitle="No invitations recorded" emptyDescription="No canonical invitations match this view for your workshop." columns={[
    { key: 'id', header: 'Invitation', cell: row => <RecordLink to={'/workshop/invitations/' + row.invitation.id}>{row.invitation.id}</RecordLink> },
    { key: 'job', header: 'Job / buyer', cell: row => <div className="min-w-48"><p>{row.job.title}</p><p className="mt-2 text-xs text-muted-foreground">{row.job.capability}</p><p className="mt-2 text-xs text-muted-foreground">{row.buyer.name}</p></div> },
    { key: 'quantity', header: 'Quantity', cell: row => <span className="whitespace-nowrap">{quantityLabel(row.job)}</span> },
    { key: 'date', header: 'Job deadline', cell: row => <span className="whitespace-nowrap">{dateLabel(row.job.deadline)}</span> },
    { key: 'status', header: 'Invitation status', cell: row => <State value={row.invitation.status} /> },
    { key: 'quotes', header: 'Own quotations', cell: row => row.quotes.length },
  ]} />;
}
function Orders({ rows }: { rows: WorkshopOrderData[] }) {
  return <DataTable caption="Workshop orders" rows={rows} rowKey={row => row.order.id} emptyTitle="No assigned orders" emptyDescription="No canonical orders match this view for your workshop." columns={[
    { key: 'id', header: 'Order', cell: row => <RecordLink to={'/workshop/orders/' + row.order.id}>{row.order.id}</RecordLink> },
    { key: 'job', header: 'Job / buyer', cell: row => <div className="min-w-48"><p>{row.job.title}</p><p className="mt-2 text-xs text-muted-foreground">{row.job.capability}</p><p className="mt-2 text-xs text-muted-foreground">{row.buyer.name}</p></div> },
    { key: 'state', header: 'Order lifecycle', cell: row => <State value={row.order.status} /> },
    { key: 'qc', header: 'QC summary', cell: row => <State value={row.order.qcStatus} /> },
    { key: 'progress', header: 'Milestone progress', cell: row => <OrderProgress milestones={row.order.milestones} /> },
    { key: 'payment', header: 'Payment simulation', cell: row => row.payments.length ? row.payments.map(payment => <p key={payment.id}>{payment.simulationStatus}</p>) : 'No payment record supplied' },
  ]} />;
}
function OrderDetails({ row }: { row: WorkshopOrderData }) {
  return <div className="space-y-6">
    <Facts rows={[
      ['Order ID', row.order.id], ['Buyer', row.buyer.name], ['Order lifecycle', <State value={row.order.status} />],
      ['QC summary', <State value={row.order.qcStatus} />], ['Created', dateLabel(row.order.createdAt)],
      ['Awarded quotation', row.quote.id], ['Quoted total', moneyLabel(row.quote.amount)],
      ['Estimated delivery', dateLabel(row.quote.estimatedDelivery)],
      ['Payment simulation', row.payments.length ? row.payments.map(item => item.simulationStatus).join(', ') : 'No payment record supplied'],
    ]} />
    <JobDetails job={row.job} />
    <section aria-label="Production milestones" className="space-y-4">
      <h2 className="text-lg font-semibold">Production milestones</h2>
      <OrderProgress milestones={row.order.milestones} />
      <DataTable caption="Workshop production milestones" rows={row.order.milestones} rowKey={step => step.id} emptyTitle="No milestones recorded" emptyDescription="Progress is unavailable until a milestone plan is supplied." columns={[
        { key: 'title', header: 'Milestone', cell: step => step.title },
        { key: 'state', header: 'Status', cell: step => <State value={step.status} /> },
        { key: 'due', header: 'Planned', cell: step => dateLabel(step.dueOn) },
        { key: 'completed', header: 'Completed', cell: step => dateLabel(step.completedAt) },
        { key: 'notes', header: 'Notes', cell: step => step.notes ?? 'Not supplied' },
      ]} />
    </section>
    <section aria-label="QC decisions and rework" className="space-y-4">
      <h2 className="text-lg font-semibold">QC decisions and rework</h2>
      <p className="text-sm text-muted-foreground">Submitted inspector records are read-only. Production, QC and payment states are separate.</p>
      {!row.inspections.length && <p className="text-sm">No inspection records supplied.</p>}
      {row.inspections.map(inspection => <article key={inspection.id} className="space-y-4 rounded-lg border bg-card p-5">
        <h3 className="font-semibold">{inspection.id}</h3>
        <Facts rows={[[ 'QC decision', <State value={inspection.decision} /> ], ['Inspector ID', inspection.inspectorId], ['Inspection due', dateLabel(inspection.dueOn)], ['Rework deadline', dateLabel(inspection.reworkDeadline)], ['Notes', inspection.notes || 'Not supplied']]} />
        {!inspection.history.length && <p className="text-sm text-muted-foreground">No submitted decision history.</p>}
        {inspection.history.map(record => <div key={record.id} className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">{record.decision} · {dateLabel(record.submittedAt)}</p>
          <p className="text-sm">{record.findings.summary}</p>
          {record.decision === 'REWORK' && <Facts rows={[[ 'Rework reason', record.reason ], ['Corrective action', record.correctiveAction], ['Rework due', dateLabel(record.reworkDeadline)]]} />}
          <ul className="space-y-2 text-sm">{record.findings.items.map(item => <li key={item.id}>{item.id}: {item.result.replaceAll('_', ' ')}{item.notes ? ' · ' + item.notes : ''}</li>)}</ul>
        </div>)}
      </article>)}
    </section>
  </div>;
}
export function WorkshopRecords({ data, section, invitationId, orderId }: { data: WorkshopWorkspace; section: WorkshopSection; invitationId?: string; orderId?: string }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  if (!data.profile) return <div className="space-y-5"><EmptyState title="Workshop profile required" description="Your authenticated account has no canonical workshop profile. Shared registration and profile creation are not enabled yet." /><Facts rows={[[ 'Account', data.account.name ], ['Email', data.account.email], ['Account ID', data.account.id]]} /></div>;
  const profile = data.profile;
  if (invitationId) {
    const row = data.invitations.find(item => item.invitation.id === invitationId);
    return row ? <div className="space-y-6"><Facts rows={[[ 'Invitation ID', row.invitation.id ], ['Invitation status', <State value={row.invitation.status} />], ['Buyer', row.buyer.name], ['Workshop ID', row.invitation.workshopId]]} /><JobDetails job={row.job} /><WorkshopInvitationActions row={row} /><Quotes rows={data.quotations.filter(item => item.quote.jobId === row.job.id)} /></div> : <EmptyState title="Invitation unavailable" description="This invitation does not exist or is not addressed to your workshop." />;
  }
  if (orderId) {
    const row = data.orders.find(item => item.order.id === orderId);
    return row ? <OrderDetails row={row} /> : <EmptyState title="Order unavailable" description="This order does not exist or is not assigned to your workshop." />;
  }
  if (section === 'profile' || section === 'onboarding') return <div className="space-y-6">
    {section === 'onboarding' && <Facts rows={[[ 'Onboarding status', 'Canonical profile linked' ], ['Profile ID', profile.id], ['Owner account ID', profile.ownerId]]} />}
    <Facts rows={[[ 'Workshop', profile.name ], ['Profile ID', profile.id], ['Location', profile.location.city + ', ' + profile.location.state], ['Capabilities', profile.capabilities.join(', ') || 'Not supplied'], ['Rating', profile.rating === undefined ? 'Not supplied' : profile.rating]]} />
    <section aria-label="Workshop machinery inventory" className="role-task-panel"><h2 className="mb-6">Machinery inventory</h2><DataTable caption="Workshop machinery" rows={profile.machines} rowKey={machine => machine.id} emptyTitle="No machinery supplied" emptyDescription="No machines are recorded on this canonical profile." columns={[{ key: 'machine', header: 'Machine', cell: machine => machine.name }, { key: 'process', header: 'Process', cell: machine => machine.process }]} />
    </section><section aria-label="Published capacity windows" className="role-task-panel"><h2 className="mb-6">Published capacity windows</h2><DataTable caption="Published workshop capacity" rows={profile.capacitySlots} rowKey={slot => slot.id} emptyTitle="No capacity supplied" emptyDescription="No published capacity windows are recorded." columns={[{ key: 'quantity', header: 'Available quantity', cell: slot => slot.availableQuantity.toLocaleString('en-IN') + ' ' + slot.unit }, { key: 'starts', header: 'Starts', cell: slot => dateLabel(slot.startsOn) }, { key: 'ends', header: 'Ends', cell: slot => dateLabel(slot.endsOn) }]} />
    </section><p className="text-sm text-muted-foreground">Published capacity is shown per source window and unit. Utilization and availability percentages are not supplied.</p>
  </div>;
  if (section === 'settings') return <Facts rows={[[ 'Account', data.account.name ], ['Email', data.account.email], ['Account ID', data.account.id], ['Role', data.account.role], ['Workshop', profile.name], ['Workshop ID', profile.id], ['Notification preferences', 'Not supported by the shared contract']]} />;
  if (section === 'dashboard') {
    const responses = data.invitations.filter(row => row.actions.respond);
    const readyToQuote = data.invitations.filter(row => row.actions.submitQuote);
    const opportunities = data.invitations.filter(row => row.actions.respond || row.actions.submitQuote);
    const attention = data.orders.filter(row => row.order.qcStatus === 'REWORK' || row.order.qcStatus === 'PENDING' || row.inspections.some(item => item.decision === 'REWORK' || item.decision === 'PENDING'));
    const activity = data.orders.flatMap(row => row.inspections.flatMap(inspection => inspection.history.map(record => ({ orderId: row.order.id, record })))).sort((a, b) => b.record.submittedAt.localeCompare(a.record.submittedAt)).slice(0, 4);
    return <div className="space-y-6">
    <div><p className="kl-micro mb-3 text-primary">Your manufacturing workshop</p><h2 className="role-intro">{profile.name}</h2></div>
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[
      ['Total invitations', data.summary.invitations], ['Available invitation responses', responses.length], ['Ready to quote', readyToQuote.length], ['Submitted quotations', data.summary.submittedQuotes],
      ['Active orders', data.summary.activeOrders], ['Pending inspections', data.summary.pendingInspections],
      ['Open rework requests', data.summary.openRework], ['Closed orders', data.summary.closedOrders],
    ].map(([label, value]) => <StatCard key={String(label)} label={String(label)} value={value} />)}</div>
    <div className="role-task-grid">
      <section aria-label="Workshop opportunity actions" className="role-task-panel"><h2>Opportunities to respond to</h2><p>Only invitations with an authorized response or quote action appear here. Responses do not create orders.</p>
        {opportunities.length ? opportunities.map(row => <div key={row.invitation.id} className="role-task-row"><div><RecordLink to={'/workshop/invitations/' + row.invitation.id}>{row.job.title}</RecordLink><p>{row.buyer.name} / {quantityLabel(row.job)} / {dateLabel(row.job.deadline)}</p></div><State value={row.actions.respond ? 'RESPONSE_AVAILABLE' : 'READY_TO_QUOTE'} /></div>) : <p>No invitation response or new quotation is currently required. Review submitted quotation history from Invitations.</p>}
      </section>
      <section aria-label="Workshop quality attention" className="role-task-panel"><h2>Quality and rework attention</h2><p>Assigned orders with pending or rework inspection records. Inspector decisions remain read-only.</p>
        {attention.length ? attention.map(row => <div key={row.order.id} className="role-task-row"><div><RecordLink to={'/workshop/orders/' + row.order.id}>{row.job.title}</RecordLink><p>{row.order.id}</p></div><State value={row.order.qcStatus} /></div>) : <p>No assigned order has an open inspection or rework record.</p>}
      </section>
    </div>
    <h2 className="text-lg font-semibold">Recent invitations</h2><Invitations rows={data.invitations.slice(0, 3)} />
    <h2 className="text-lg font-semibold">Assigned orders</h2><Orders rows={data.orders.slice(0, 3)} />
    <section aria-label="Recent workshop QC activity" className="role-task-panel"><h2>Recent submitted inspection activity</h2><p>Recorded inspector outcomes on your orders, ordered by submission date. Invitation and quote timestamps are not supplied.</p>
      {activity.length ? activity.map(({ orderId, record }) => <div key={record.id} className="role-task-row"><div><RecordLink to={'/workshop/orders/' + orderId}>{orderId}</RecordLink><p>{record.findings.summary}</p></div><p>{record.decision} / {dateLabel(record.submittedAt)}</p></div>) : <p>No submitted inspection history on your assigned orders.</p>}
    </section>
  </div>;
  }
  const term = search.trim().toLowerCase();
  const controls = <div role="search" aria-label={'Filter workshop ' + section} className="flex flex-wrap gap-4 border-y">
    <label className="min-w-0 basis-full text-sm sm:flex-1">Search {section}<input className={controlClass + ' mt-2'} value={search} onChange={event => setSearch(event.target.value)} /></label>
    <label className="min-w-0 basis-full text-sm sm:basis-auto">Record status<select className={controlClass + ' mt-2'} value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{[...new Set(section === 'invitations' ? data.invitations.map(item => item.invitation.status) : data.orders.map(item => item.order.status))].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
  </div>;
  return <div className="space-y-6">{controls}{section === 'invitations' ? <>
    <Invitations rows={data.invitations.filter(row => [row.invitation.id, row.job.title, row.buyer.name].join(' ').toLowerCase().includes(term) && (status === 'all' || row.invitation.status === status))} />
    <h2 className="text-lg font-semibold">All quotations for this workshop</h2><Quotes rows={data.quotations} />
  </> : <Orders rows={data.orders.filter(row => [row.order.id, row.job.title, row.buyer.name].join(' ').toLowerCase().includes(term) && (status === 'all' || row.order.status === status))} />}</div>;
}
