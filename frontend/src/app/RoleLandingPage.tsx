import { Layers3, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/context';
import { roles } from './roles';

export function RoleLandingPage() {
  const { user } = useAuth();
  if (!user) return null;
  const role = roles[user.role];
  return <>
    <PageHeader title={role.label + ' workspace'} description={role.description} action={<StatusBadge tone="warning">Mock environment</StatusBadge>} />
    <section aria-labelledby="welcome-heading" className="mb-6 overflow-hidden rounded-lg border bg-card">
      <div className="border-l-4 border-accent px-6 py-7 sm:px-8">
        <p className="mb-2 text-sm text-muted-foreground">Welcome, {user.name}</p>
        <h2 id="welcome-heading" className="text-xl font-semibold">The right place to get to work.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Your account and navigation are ready. This preview establishes a shared workspace before operational modules are introduced.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-background/50 px-6 py-4 sm:px-8"><p className="text-xs text-muted-foreground">Current release</p><StatusBadge tone="info">Phase 1 · Shell & access</StatusBadge></div>
    </section>
    <div className="mb-8 grid gap-4 sm:grid-cols-3">
      <StatCard label="Account role" value={role.label} detail="Navigation scoped to your role" icon={<UserRound className="size-4" />} />
      <StatCard label="Session" value="Demo access" detail="Restores in this tab for up to 8 hours" icon={<ShieldCheck className="size-4" />} />
      <StatCard label="Workspace" value="Foundation" detail="Operational modules are upcoming" icon={<Layers3 className="size-4" />} />
    </div>
    <EmptyState title={user.role === 'workshop' ? 'Workshop frontend reserved' : 'Your operational workspace is next'} description={role.next}
      action={<Button asChild variant="outline"><Link to="/foundation">View shared foundation</Link></Button>} />
    <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Demo identities and sample data only. Client-side access controls do not replace backend authorization.</p>
  </>;
}
