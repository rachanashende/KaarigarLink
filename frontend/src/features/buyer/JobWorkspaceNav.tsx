import { NavLink } from 'react-router';
import { cn } from '@/components/utils';

export function JobWorkspaceNav({ jobId }: { jobId: string }) {
  const base = '/buyer/jobs/' + encodeURIComponent(jobId);
  return <nav aria-label="Job workspace" className="mb-6 flex flex-wrap gap-2 border-b pb-3">
    {[['Job brief', base], ['Workshop matches', base + '/matches'], ['Quotations', base + '/quotes']].map(([label, to]) => <NavLink key={to} to={to!} end className={({ isActive }) => cn('inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium transition-colors', isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{label}</NavLink>)}
  </nav>;
}
