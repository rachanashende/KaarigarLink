import { Link, useNavigate } from 'react-router';
import type { Job } from '@/types';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { dateLabel, jobStatuses, quantityLabel } from './model';

export function JobBadge({ job }: { job: Job }) {
  return <StatusBadge tone={job.status === 'POSTED' || job.status === 'QUOTING' ? 'info' : 'neutral'}>{jobStatuses[job.status]}</StatusBadge>;
}
export function JobsTable({ jobs, caption = 'Manufacturing jobs' }: { jobs: Job[]; caption?: string }) {
  const navigate = useNavigate();
  return <><p className="mb-3 text-xs text-muted-foreground sm:hidden">Scroll the table to view delivery dates and status.</p><DataTable caption={caption} rows={jobs} rowKey={job => job.id} onRowClick={job => navigate('/buyer/jobs/' + encodeURIComponent(job.id))}
    columns={[
      { key: 'title', header: 'Manufacturing job', cell: job => <div className="min-w-48 max-w-sm"><Link className="block min-h-11 break-words py-2.5 font-semibold text-primary underline-offset-4 hover:underline" to={'/buyer/jobs/' + encodeURIComponent(job.id)}>{job.title}</Link><p className="mt-1 text-xs text-muted-foreground">{job.capability}</p></div> },
      { key: 'quantity', header: 'Quantity', cell: job => <span className="whitespace-nowrap">{quantityLabel(job)}</span> },
      { key: 'deadline', header: 'Delivery by', cell: job => <time className="whitespace-nowrap" dateTime={job.deadline}>{dateLabel(job.deadline)}</time> },
      { key: 'status', header: 'Status', cell: job => <JobBadge job={job} /> },
    ]} /></>;
}
