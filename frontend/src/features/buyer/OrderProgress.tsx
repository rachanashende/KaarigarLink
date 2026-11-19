import type { Milestone } from '@/types';
import { milestoneProgress } from './orderModel';

export function OrderProgress({ milestones }: { milestones: Milestone[] }) {
  const percent = milestoneProgress(milestones);
  return <div className="min-w-28">
    <p className="mb-2 text-xs text-muted-foreground">{percent === null ? 'No milestones recorded' : percent + '% · ' + milestones.filter(item => item.status === 'COMPLETED').length + ' of ' + milestones.length + ' completed'}</p>
    {percent !== null && <progress aria-label="Production progress" className="block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" value={percent} max={100}>{percent}%</progress>}
  </div>;
}
