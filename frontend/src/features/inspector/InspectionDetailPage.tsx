import { Link, useParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/feedback';
import { StatusBadge } from '@/components/StatusBadge';
import { useInspection } from './queries';
import { useServices } from '@/app/services';
import { DocumentList } from '@/components/DocumentList';
import { OrderHistory } from '@/components/OrderHistory';
import { QCBadge } from './InspectionTable';
import { dateLabel } from './model';
import { QCChecklist } from './QCChecklist';
import { InspectionHistory } from './InspectionHistory';

export function InspectionDetailPage() {
  const { id = '' } = useParams(); const query = useInspection(id); const { demo } = useServices();
  const back = <Button asChild variant="outline"><Link to="/inspector/inspections">All inspections</Link></Button>;
  if (query.isPending) return <LoadingState label="Loading inspection details…" />;
  if (query.isError) return <><PageHeader title="Inspection unavailable" description="This inspection may be missing or assigned to someone else." action={back} /><ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /></>;
  const data = query.data; const { inspection, order, job, workshop, buyer, inspector } = data;
  return <><PageHeader title={inspection.id} description={job.title} action={back} />
    <section aria-label="Inspection overview" className="mb-6 rounded-lg border bg-card p-5 sm:p-6">
      <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="mb-2 text-xs text-muted-foreground">Order production status</dt><dd><StatusBadge tone="info">{order.status.replaceAll('_', ' ').toLowerCase()}</StatusBadge></dd></div>
        <div><dt className="mb-2 text-xs text-muted-foreground">QC inspection status</dt><dd><QCBadge status={inspection.decision} /></dd></div>
        <div><dt className="mb-2 text-xs text-muted-foreground">Rework follow-up</dt><dd className="text-sm leading-relaxed">{inspection.decision === 'REWORK' ? 'Awaiting workshop corrective work. Reinspection scheduling is pending.' : 'No open rework request on this assignment.'}</dd></div>
        <div><dt className="mb-2 text-xs text-muted-foreground">Inspection deadline</dt><dd className="text-sm font-medium">{dateLabel(inspection.dueOn)}</dd></div>
      </dl>
      <p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">{demo ? 'Provisional mock QC workflow. Decisions update the separate QC summary while order production, payment and closure states remain unchanged.' : 'Each decision is recorded on the server. The latest decision must be PASSED before the buyer can complete the order; rework and failed outcomes can be re-inspected.'}</p>
    </section>
    <div className="mb-6 grid items-start gap-6 lg:grid-cols-2">
      <section aria-labelledby="qc-order" className="rounded-lg border bg-card p-5 sm:p-6"><h2 id="qc-order" className="text-lg font-semibold">Order & manufacturing requirements</h2><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">{[
        ['Order', order.id], ['Buyer', buyer.name], ['Workshop', workshop.name], ['Assigned inspector', inspector.name],
        ['Material', job.material], ['Quantity', new Intl.NumberFormat('en-IN').format(job.quantity) + ' ' + job.unit],
        ['Required capability', job.capability], ['Processes', job.processes.join(', ')], ['Delivery deadline', dateLabel(job.deadline)],
        ['Assigned', dateLabel(inspection.assignedAt)], ['Last updated', dateLabel(inspection.updatedAt)],
      ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words leading-relaxed">{value}</dd></div>)}</dl></section>
      <section aria-labelledby="qc-requirements" className="rounded-lg border bg-card p-5 sm:p-6"><h2 id="qc-requirements" className="text-lg font-semibold">QC requirements & supporting evidence</h2><p className="mt-4 text-sm leading-relaxed">{job.specification || 'No additional specification provided.'}</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{job.description}</p>
        <h3 className="mt-5 text-sm font-semibold">Job reference metadata</h3>{job.designFiles.length ? <ul className="mt-3 space-y-2">{job.designFiles.map(file => <li key={file.id} className="break-all text-xs text-muted-foreground">{file.name} · {file.sizeBytes} bytes</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No job evidence metadata provided.</p>}
        <h3 className="mt-5 text-sm font-semibold">Inspection notes</h3><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{inspection.notes || 'No submitted notes.'}</p>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{!demo ? 'Design files and evidence are stored on the KaarigarLink server. Download them from the file lists on this page. Evidence you attach becomes part of the inspection you submit and cannot be deleted afterwards.' : 'Files are metadata-only references. No file contents are available for viewing, download or verification.'}</p>
      </section>
    </div>
    <div className="mb-6 grid items-start gap-6 lg:grid-cols-2">
      <DocumentList scope="job" id={job.id} title="Buyer design files" />
      <DocumentList scope="order" id={order.id} title="Inspection evidence" description="Files you attach here can be referenced from checklist items and become part of the inspection you submit." canUpload={data.canDecide} />
    </div>
    <QCChecklist key={inspection.id} data={data} />
    <div className="mt-6"><InspectionHistory inspection={inspection} inspectorName={inspector.name} /></div>
    <div className="mt-6"><OrderHistory orderId={order.id} /></div>
  </>;
}
