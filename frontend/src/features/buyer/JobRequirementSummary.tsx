import type { Job } from '@/types';
import { dateLabel, quantityLabel } from './model';

export function JobRequirementSummary({ job }: { job: Job }) {
  return <section aria-label="Job requirement summary" className="buyer-requirement">
    <p className="kl-micro">The manufacturing requirement</p>
    <dl>{[['Capability', job.capability], ['Material', job.material], ['Quantity', quantityLabel(job)], ['Delivery by', dateLabel(job.deadline)], ['Delivery location', job.location.city + ', ' + job.location.state]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}
