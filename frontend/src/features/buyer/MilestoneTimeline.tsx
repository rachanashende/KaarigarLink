import { Check, Circle, Clock3 } from 'lucide-react';
import type { Order } from '@/types';
import { StatusBadge } from '@/components/StatusBadge';
import { dateLabel } from './model';
import { milestoneLabel } from './orderModel';

export function MilestoneTimeline({ order }: { order: Order }) {
  return <section aria-labelledby="production-timeline" className="rounded-lg border bg-card p-5 sm:p-6">
    <h2 id="production-timeline" className="text-lg font-semibold">Production milestones</h2>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Workshop updates · equal weight per completed milestone. Buyers have read-only access.</p>
    {!order.milestones.length ? <p className="mt-6 text-sm text-muted-foreground">No milestones recorded. Progress is unavailable.</p> :
    <ol className="mt-7">{order.milestones.map((milestone, index) => {
      const label = milestoneLabel(milestone, order.status === 'CANCELLED');
      const completed = milestone.status === 'COMPLETED';
      const Icon = completed ? Check : milestone.status === 'IN_PROGRESS' ? Clock3 : Circle;
      return <li key={milestone.id} className="relative flex gap-4 pb-7 last:pb-0">
        {index < order.milestones.length - 1 && <span aria-hidden="true" className="absolute top-8 bottom-0 left-3.5 border-l" />}
        <span className={'relative flex size-7 shrink-0 items-center justify-center rounded-full border ' + (completed ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-primary')}><Icon aria-hidden="true" className="size-3.5" /></span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold">{milestone.title}</h3><StatusBadge tone={label.startsWith('Delayed') ? 'warning' : completed ? 'info' : 'neutral'}>{label}</StatusBadge></div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{milestone.description ?? 'No description recorded.'}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs"><div><dt className="text-muted-foreground">Planned</dt><dd className="mt-1 font-medium">{dateLabel(milestone.dueOn)}</dd></div><div><dt className="text-muted-foreground">Completed</dt><dd className="mt-1 font-medium">{dateLabel(milestone.completedAt)}</dd></div></dl>
          {milestone.notes && <p className="mt-3 border-l-2 pl-3 text-xs leading-relaxed text-muted-foreground">{milestone.notes}</p>}
        </div>
      </li>;
    })}</ol>}
  </section>;
}
