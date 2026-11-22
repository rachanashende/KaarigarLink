import { Link } from 'react-router';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import type { InspectorInspectionData } from '@/services/inspections';
import type { QCStatus } from '@/types';
import { dateLabel, isOverdue, qcLabels } from './model';

export function QCBadge({ status }: { status: QCStatus }) {
  return <StatusBadge tone={status === 'REWORK' || status === 'FAILED' ? 'danger' : status === 'PENDING' ? 'warning' : 'info'}>{qcLabels[status]}</StatusBadge>;
}
export function InspectionTable({ items, caption = 'Assigned inspections' }: { items: InspectorInspectionData[]; caption?: string }) {
  return <DataTable caption={caption} rows={items} rowKey={item => item.inspection.id} columns={[
    { key: 'id', header: 'Inspection / order', cell: item => <div className="min-w-40"><Link className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline" to={'/inspector/inspections/' + encodeURIComponent(item.inspection.id)}>{item.inspection.id}</Link><p className="text-xs text-muted-foreground">{item.order.id}</p></div> },
    { key: 'job', header: 'Manufacturing job', cell: item => <span className="block min-w-48">{item.job.title}</span> },
    { key: 'workshop', header: 'Workshop / inspector', cell: item => <div className="min-w-40"><p>{item.workshop.name}</p><p className="mt-2 text-xs text-muted-foreground">{item.inspector.name}</p></div> },
    { key: 'status', header: 'QC status', cell: item => <QCBadge status={item.inspection.decision} /> },
    { key: 'due', header: 'Inspection / rework deadline', cell: item => <div className="min-w-32"><p>{dateLabel(item.inspection.dueOn)}</p>{item.inspection.decision === 'REWORK' && <p className="mt-2 text-xs text-muted-foreground">Rework: {dateLabel(item.inspection.reworkDeadline)}</p>}{isOverdue(item) && <p className="mt-2 text-xs font-medium text-destructive">Overdue {item.inspection.decision === 'REWORK' ? 'rework' : 'inspection'}</p>}</div> },
    { key: 'updated', header: 'Last updated', cell: item => <span className="whitespace-nowrap">{dateLabel(item.inspection.updatedAt)}</span> },
  ]} />;
}
