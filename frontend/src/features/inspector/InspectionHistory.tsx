import type { Inspection } from '@/types';
import { QCBadge } from './InspectionTable';
import { dateLabel } from './model';

export function InspectionHistory({ inspection, inspectorName }: { inspection: Inspection; inspectorName: string }) {
  const history = [...(inspection.history ?? [])].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return <section aria-labelledby="decision-history" className="rounded-lg border bg-card p-5 sm:p-6">
    <h2 id="decision-history" className="text-lg font-semibold">Previous QC decisions & rework history</h2>
    {!history.length ? <p className="mt-5 text-sm text-muted-foreground">No submitted decisions. Draft findings are not QC outcomes.</p> :
    <ol className="mt-5 space-y-5">{history.map(record => <li key={record.id} className="rounded-md border p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><QCBadge status={record.decision} /><time className="text-xs text-muted-foreground" dateTime={record.submittedAt} title={record.submittedAt}>{dateLabel(record.submittedAt)}</time></div>
      <p className="mt-3 text-xs text-muted-foreground">Recorded by {inspectorName} · {record.inspectorId}</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{record.findings.summary}</p>
      {record.decision === 'REWORK' && <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">Rework reason</dt><dd className="mt-1 whitespace-pre-wrap break-words">{record.reason}</dd></div><div><dt className="text-xs text-muted-foreground">Corrective action</dt><dd className="mt-1 whitespace-pre-wrap break-words">{record.correctiveAction}</dd></div><div><dt className="text-xs text-muted-foreground">Rework deadline</dt><dd className="mt-1 font-medium">{dateLabel(record.reworkDeadline)}</dd></div></dl>}
      <ul className="mt-5 divide-y">{record.findings.items.map(item => <li key={item.id} className="py-3 text-sm"><p className="font-medium">{inspection.checklist?.find(check => check.id === item.id)?.label ?? item.id}: {item.result.replaceAll('_', ' ').toLowerCase()}</p><p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{item.notes || 'No additional notes.'}</p>{item.evidence.length ? <ul className="mt-2">{item.evidence.map(file => <li key={file.id} className="break-all text-xs text-muted-foreground">{file.name} · {file.sizeBytes} bytes</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Evidence metadata unavailable in this session; attachments are not persisted.</p>}</li>)}</ul>
    </li>)}</ol>}
  </section>;
}
