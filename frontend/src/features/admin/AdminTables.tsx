import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import type { AdminOverview } from '@/services/admin';
import type { Inspection, Job, Order, User, Workshop } from '@/types';
import { dateLabel, moneyLabel, progress, statusLabel } from './model';
import { placeLabel } from '@/components/utils';

export function RecordLink({ section, id, children }: { section: string; id: string; children?: ReactNode }) {
  return <Link className="block min-h-11 w-fit max-w-full break-words py-2.5 font-medium text-primary hover:underline" to={'/admin/' + section + '/' + encodeURIComponent(id)}>{children ?? id}</Link>;
}
export function AdminBadge({ status }: { status: string }) {
  return <StatusBadge tone={status === 'REWORK' || status === 'FAILED' || status === 'REJECTED' ? 'danger' : status === 'PENDING' || status === 'QC_PENDING' ? 'warning' : status === 'IN_PRODUCTION' || status === 'AWARDED' ? 'info' : 'neutral'}>{statusLabel(status)}</StatusBadge>;
}
export function ProductionProgress({ order }: { order: Order }) {
  const value = progress(order.milestones);
  return <div className="min-w-28"><p className="mb-2 text-xs text-muted-foreground">{value === null ? 'No milestones recorded' : value + '% completed'}</p>{value !== null && <progress aria-label={'Production progress for ' + order.id} value={value} max={100} className="block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary">{value}%</progress>}</div>;
}
export function UsersTable({ rows, data }: { rows: User[]; data: AdminOverview }) {
  return <DataTable caption="Platform users" rows={rows} rowKey={item => item.id} columns={[
    { key: 'name', header: 'User', cell: item => <div className="min-w-36"><RecordLink section="users" id={item.id}>{item.name}</RecordLink><p className="text-xs text-muted-foreground">{item.id}</p></div> },
    { key: 'email', header: 'Email', cell: item => <span className="block min-w-64 whitespace-nowrap">{item.email}</span> },
    { key: 'role', header: 'Role', cell: item => <AdminBadge status={item.role} /> },
    { key: 'workshop', header: 'Related workshop', cell: item => <div className="min-w-44">{data.workshops.some(workshop => workshop.ownerId === item.id) ? data.workshops.filter(workshop => workshop.ownerId === item.id).map(workshop => <RecordLink key={workshop.id} section="workshops" id={workshop.id}>{workshop.name}</RecordLink>) : 'Not applicable'}</div> },
  ]} />;
}
export function WorkshopsTable({ rows, data }: { rows: Workshop[]; data: AdminOverview }) {
  return <DataTable caption="Platform workshops" rows={rows} rowKey={item => item.id} columns={[
    { key: 'name', header: 'Workshop / location', cell: item => <div className="min-w-48"><RecordLink section="workshops" id={item.id}>{item.name}</RecordLink><p className="text-xs text-muted-foreground">{placeLabel(item.location)}</p></div> },
    { key: 'capability', header: 'Capabilities / machinery', cell: item => <div className="min-w-48"><p>{item.capabilities.join(', ') || 'Not provided'}</p><p className="mt-2 text-xs text-muted-foreground">{item.machines.map(machine => machine.name).join(', ') || 'No machinery provided'}</p></div> },
    { key: 'capacity', header: 'Published capacity', cell: item => <ul className="min-w-40 space-y-2 text-xs">{item.capacitySlots.length ? item.capacitySlots.map(slot => <li key={slot.id}>{slot.availableQuantity} {slot.unit}<span className="mt-1 block text-muted-foreground">{dateLabel(slot.startsOn)} – {dateLabel(slot.endsOn)}</span></li>) : <li>Not provided</li>}</ul> },
    { key: 'rating', header: 'Rating', cell: item => item.rating ?? 'Not recorded' },
    { key: 'activity', header: 'Activity', cell: item => <div className="min-w-28 text-xs"><p>{data.orders.filter(order => order.workshopId === item.id).length} orders</p><p className="mt-2">{data.quotes.filter(quote => quote.workshopId === item.id).length} quotations</p><p className="mt-2">{data.invitations.filter(invitation => invitation.workshopId === item.id).length} invitations</p></div> },
  ]} />;
}
export function JobsTable({ rows, data }: { rows: Job[]; data: AdminOverview }) {
  return <DataTable caption="Platform manufacturing jobs" rows={rows} rowKey={item => item.id} columns={[
    { key: 'job', header: 'Job / buyer', cell: item => <div className="min-w-56"><RecordLink section="jobs" id={item.id}>{item.title}</RecordLink><p className="text-xs text-muted-foreground">{item.id}</p><RecordLink section="users" id={item.buyerId}>{data.users.find(user => user.id === item.buyerId)!.name}</RecordLink></div> },
    { key: 'requirements', header: 'Capability / quantity', cell: item => <div className="min-w-36"><p>{item.capability}</p><p className="mt-2 text-xs text-muted-foreground">{item.quantity} {item.unit}</p></div> },
    { key: 'deadline', header: 'Deadline', cell: item => <span className="whitespace-nowrap">{dateLabel(item.deadline)}</span> },
    { key: 'status', header: 'Status', cell: item => <AdminBadge status={item.backendStatus ?? item.status} /> },
    { key: 'activity', header: 'Marketplace activity', cell: item => <div className="min-w-32 text-xs"><p>{data.matches.filter(match => match.jobId === item.id).length} matches</p><p className="mt-2">{data.invitations.filter(invitation => invitation.jobId === item.id).length} invitations</p><p className="mt-2">{data.quotes.filter(quote => quote.jobId === item.id).length} quotations</p></div> },
  ]} />;
}
export function OrdersTable({ rows, data }: { rows: Order[]; data: AdminOverview }) {
  return <DataTable caption="Platform manufacturing orders" rows={rows} rowKey={item => item.id} columns={[
    { key: 'order', header: 'Order / job', cell: item => <div className="min-w-48"><RecordLink section="orders" id={item.id} /><p className="text-xs text-muted-foreground">{data.jobs.find(job => job.id === item.jobId)!.title}</p></div> },
    { key: 'participants', header: 'Buyer / workshop', cell: item => <div className="min-w-44"><RecordLink section="users" id={item.buyerId}>{data.users.find(user => user.id === item.buyerId)!.name}</RecordLink><RecordLink section="workshops" id={item.workshopId}>{data.workshops.find(workshop => workshop.id === item.workshopId)!.name}</RecordLink></div> },
    { key: 'value', header: 'Value / delivery', cell: item => <div className="min-w-32 tabular-nums"><p>{moneyLabel(data.quotes.find(quote => quote.id === item.quoteId)!.amount)}</p><p className="mt-2 text-xs text-muted-foreground">{dateLabel(data.quotes.find(quote => quote.id === item.quoteId)!.estimatedDelivery)}</p></div> },
    { key: 'status', header: 'Production / QC', cell: item => <div className="min-w-40 space-y-2"><AdminBadge status={item.status} />{item.qcStatus && <p className="text-xs text-muted-foreground">QC: <AdminBadge status={item.qcStatus} /></p>}</div> },
    { key: 'progress', header: 'Production', cell: item => <ProductionProgress order={item} /> },
  ]} />;
}
export function QualityTable({ rows, data }: { rows: Inspection[]; data: AdminOverview }) {
  return <DataTable caption="Platform quality inspections" rows={rows} rowKey={item => item.id} columns={[
    { key: 'inspection', header: 'Inspection / order', cell: item => <div className="min-w-40"><RecordLink section="quality" id={item.id} /><RecordLink section="orders" id={item.orderId} /></div> },
    { key: 'workshop', header: 'Workshop / inspector', cell: item => {
      const order = data.orders.find(order => order.id === item.orderId)!;
      return <div className="min-w-44"><RecordLink section="workshops" id={order.workshopId}>{data.workshops.find(workshop => workshop.id === order.workshopId)!.name}</RecordLink><RecordLink section="users" id={item.inspectorId}>{data.users.find(user => user.id === item.inspectorId)!.name}</RecordLink></div>;
    } },
    { key: 'status', header: 'QC status', cell: item => <AdminBadge status={item.decision} /> },
    { key: 'deadline', header: 'Inspection / rework deadline', cell: item => <div className="min-w-32"><p>{dateLabel(item.dueOn)}</p>{item.decision === 'REWORK' && <p className="mt-2 text-xs text-muted-foreground">Rework: {dateLabel(item.reworkDeadline)}</p>}</div> },
    { key: 'history', header: 'Decision history', cell: item => <div className="min-w-32"><p className="text-xs">{item.history?.length ?? 0} submitted {(item.history?.length ?? 0) === 1 ? 'decision' : 'decisions'}</p><p className="mt-2 text-xs text-muted-foreground">Updated {dateLabel(item.updatedAt)}</p></div> },
  ]} />;
}
