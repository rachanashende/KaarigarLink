import { JobWorkspaceNav } from './JobWorkspaceNav';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, FileText, Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/feedback';
import { ServiceError } from '@/services';
import { useBuyerJob } from './queries';
import { useServices } from '@/app/services';
import { DocumentList } from '@/components/DocumentList';
import { JobStatusActions } from './JobStatusActions';
import { BuyerLoading } from './BuyerLoading';
import { JobBadge } from './JobsTable';
import { dateLabel, moneyLabel, quantityLabel } from './model';

/** The address, then city and state unless the address already ends with them. */
function deliveryLocation(location: { address?: string; city: string; state: string }): string {
  const place = [location.city, location.state].filter(Boolean).join(', ');
  const address = location.address?.trim() ?? '';
  if (!address) return place;
  return place && !address.toLowerCase().endsWith(place.toLowerCase()) ? address + ', ' + place : address;
}

export function JobDetailPage() {
  const live = !useServices().demo;
  const { id = '' } = useParams();
  const query = useBuyerJob(id);
  const location = useLocation();
  const navigate = useNavigate();
  if (query.isPending) return <><PageHeader title="Job details" /><BuyerLoading label="Loading job details…" /></>;
  if (query.isError) return <>
    <PageHeader title="Job unavailable" />
    <ErrorState title="Job not available" message={query.error.message} {...(query.error instanceof ServiceError && query.error.code === 'NOT_FOUND' ? {} : { onRetry: () => { void query.refetch(); } })} />
    <Button asChild variant="outline" className="mt-5"><Link to="/buyer/jobs">Return to jobs</Link></Button>
  </>;
  const job = query.data;
  const created = location.state && typeof location.state === 'object' && 'createdJobId' in location.state && location.state.createdJobId === job.id;
  const uploadFailures: string[] = created && 'uploadFailures' in location.state && Array.isArray(location.state.uploadFailures) ? (location.state.uploadFailures as string[]) : [];
  return <>
    {created && <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-secondary p-4 text-sm text-primary"><p><strong>Job posted successfully.</strong> {uploadFailures.length ? 'Some design files were not uploaded: ' + uploadFailures.join(' ') : 'Your brief has been saved.'}</p><Button variant="outline" className="size-11 shrink-0 px-0" aria-label="Dismiss success notification" onClick={() => navigate(location.pathname, { replace: true, state: null })}><X aria-hidden="true" className="size-4" /></Button></div>}
    <Link to="/buyer/jobs" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft aria-hidden="true" className="size-4" />All manufacturing jobs</Link>
    <PageHeader title={job.title} description={job.capability} action={<JobBadge job={job} />} />
    <JobWorkspaceNav jobId={job.id} />
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="rounded-lg border bg-card p-6 sm:p-7" aria-labelledby="job-description"><h2 id="job-description" className="text-lg font-semibold">Manufacturing brief</h2><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{job.description}</p>
          <dl className="mt-6 space-y-5 text-sm"><div><dt className="text-xs text-muted-foreground">Material</dt><dd className="mt-2 break-words font-medium">{job.material}</dd></div><div><dt className="text-xs text-muted-foreground">Required machinery or capabilities</dt><dd className="mt-2"><ul className="list-inside list-disc space-y-2 break-words">{job.processes.map((process, index) => <li key={index}>{process}</li>)}</ul></dd></div><div><dt className="text-xs text-muted-foreground">Additional specifications</dt><dd className="mt-2 whitespace-pre-wrap break-words">{job.specification || 'No additional specifications provided.'}</dd></div></dl>
        </section>
        <JobStatusActions job={job} />
        <DocumentList scope="job" id={job.id} title="Stored design files" description="Files stored on the KaarigarLink server. Invited and awarded workshops and the order's inspector can download them." canUpload={job.backendStatus === 'DRAFT' || job.backendStatus === 'OPEN' || job.backendStatus === 'MATCHED'} />
        <section className="rounded-lg border bg-card p-6 sm:p-7" aria-labelledby="job-files"><h2 id="job-files" className="text-lg font-semibold">Design references</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{live ? 'Files attached when the job was posted. Uploaded files are listed under Stored design files below.' : 'Simulated attachments. Metadata only; file contents have not been uploaded or retained.'}</p>
          {job.designFiles.length ? <ul className="mt-5 divide-y">{job.designFiles.map(file => <li key={file.id} className="flex min-w-0 gap-3 py-3 text-sm"><FileText aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /><span className="min-w-0 break-all">{file.name}<span className="mt-1 block text-xs text-muted-foreground">{new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(file.sizeBytes / 1024)} KB · {file.mediaType}</span></span></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No design files attached.</p>}
        </section>
      </div>
      <div className="space-y-6">
        <section aria-labelledby="job-delivery" className="rounded-lg border bg-card p-6 sm:p-7"><h2 id="job-delivery" className="text-lg font-semibold">Quantity & delivery</h2>
          <dl className="mt-5 divide-y text-sm">{[
            ['Quantity', quantityLabel(job)], ['Delivery deadline', dateLabel(job.deadline)],
            // M13 (BUG-05): live jobs store "City, State" as the address, so show it once.
            ['Delivery location', deliveryLocation(job.location)],
            ['Budget (INR)', job.budget === undefined ? 'Not specified' : moneyLabel(job.budget)],
            ['Created on', dateLabel(job.createdAt)], ['Job reference', job.id],
          ].map(([label, value]) => <div key={label} className="py-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 break-words font-medium">{value}</dd></div>)}</dl>
        </section>
        <section aria-labelledby="job-next" className="rounded-lg border bg-card p-6 sm:p-7"><h2 id="job-next" className="text-lg font-semibold">Next steps</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{live ? 'Invite well-matched workshops, then compare their quotations and award one. Awarding creates the manufacturing order and closes the job to other quotations.' : 'Review the service-provided workshop matches or compare quotations for this job. Order awarding is not available in the demo workspace.'}</p><div className="mt-5 flex flex-wrap gap-3"><Button asChild><Link to={"/buyer/jobs/" + encodeURIComponent(job.id) + "/matches"}>View workshop matches</Link></Button><Button asChild variant="outline"><Link to={"/buyer/jobs/" + encodeURIComponent(job.id) + "/quotes"}>Compare quotations</Link></Button></div><Button asChild variant="outline" className="mt-5"><Link to="/buyer/jobs/new"><Plus aria-hidden="true" className="size-4" />Post another job</Link></Button></section>
      </div>
    </div>
  </>;
}
