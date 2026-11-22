import { JobRequirementSummary } from './JobRequirementSummary';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { MapPin, Send } from 'lucide-react';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import type { Workshop } from '@/types';
import type { BuyerMatchesData, WorkshopMatch } from '@/services/marketplace';
import { BuyerHeader as PageHeader } from './BuyerHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/feedback';
import { BuyerLoading } from './BuyerLoading';
import { JobWorkspaceNav } from './JobWorkspaceNav';
import { WorkshopDetails, WorkshopFacts } from './WorkshopDetails';
import { useBuyerMatches } from './queries';
import { placeLabel } from '@/components/utils';

const invitationLabels = { PENDING: 'Pending', ACCEPTED: 'Accepted', DECLINED: 'Declined', EXPIRED: 'Expired' };
export function MatchesPage() {
  const { id = '' } = useParams();
  const query = useBuyerMatches(id);
  if (query.isPending) return <><PageHeader title="Workshop matches" /><BuyerLoading label="Loading workshop matches…" /></>;
  if (query.isError) return <><PageHeader title="Workshop matches" /><ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /><Button asChild variant="outline" className="mt-5"><Link to="/buyer/jobs">Return to jobs</Link></Button></>;
  return <MatchesWorkspace key={query.data.job.id} data={query.data} />;
}
function MatchesWorkspace({ data }: { data: BuyerMatchesData }) {
  const services = useServices();
  const { user } = useAuth();
  const client = useQueryClient();
  const [details, setDetails] = useState<Workshop | null>(null);
  const [target, setTarget] = useState<WorkshopMatch | null>(null);
  const [feedback, setFeedback] = useState('');
  const lock = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const mutation = useMutation({
    mutationFn: (workshopId: string) => services.buyer.inviteWorkshop(user!.id, data.job.id, workshopId),
    async onSuccess(invitation) {
      await client.invalidateQueries({ queryKey: ['buyer', user!.id] });
      const workshop = data.results.find(result => result.workshop.id === invitation.workshopId)?.workshop.name ?? 'Workshop';
      setFeedback('Invitation recorded for ' + workshop + '. Status: ' + invitationLabels[invitation.status] + '.');
      setTarget(null);
    },
  });
  useEffect(() => { if (feedback && !target) feedbackRef.current?.focus({ preventScroll: true }); }, [feedback, target]);
  async function invite() {
    if (!target || lock.current) return;
    lock.current = true;
    try { await mutation.mutateAsync(target.workshop.id); }
    catch { lock.current = false; }
  }
  const eligible = data.results.filter(result => result.match.eligibility.eligible);
  return <>
    <PageHeader title="Workshop matches" description={data.job.title} />
    <JobWorkspaceNav jobId={data.job.id} />
    <p className="mb-5 text-sm text-muted-foreground">{eligible.length} eligible workshops · {data.source === 'snapshot' ? 'Scores recorded when each invitation was sent (the job is no longer open, so matching is not recalculated)' : data.source === 'live' ? 'Matching calculated now from current workshop data' : 'Demo recommendations with match explanations'}</p>
    {feedback && <div ref={feedbackRef} tabIndex={-1} role="status" className="mb-6 rounded-lg border border-primary/30 bg-secondary p-4 text-sm text-primary">{feedback}</div>}
    {!eligible.length && <div className="mb-6"><EmptyState title="No eligible workshop matches" description="No eligible recommendations were returned for this job. Check your capability and delivery requirements, or post a revised brief. " action={<Button asChild variant="outline"><Link to={'/buyer/jobs/' + encodeURIComponent(data.job.id)}>Review job brief</Link></Button>} /></div>}
    <div className="buyer-match-grid">{data.results.map((result, index) => <article key={result.workshop.id} aria-labelledby={'match-' + result.workshop.id} className="buyer-match">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="mb-2 text-xs text-muted-foreground">Rank {index + 1}</p><h2 id={'match-' + result.workshop.id} className="break-words text-xl font-semibold">{result.workshop.name}</h2><p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="size-4 shrink-0" />{placeLabel(result.workshop.location)}</p></div>
        <div className="rounded-md border bg-background px-4 py-3"><p className="text-xs text-muted-foreground">Match score</p><p className="mt-1 text-2xl font-semibold tabular-nums">{result.match.score}</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><StatusBadge tone={result.match.eligibility.eligible ? 'info' : 'warning'}>{result.match.eligibility.eligible ? 'Eligible' : 'Not eligible'}</StatusBadge><StatusBadge>Invitation: {result.invitation ? invitationLabels[result.invitation.status] : 'Not invited'}</StatusBadge></div>
      <div className="buyer-match-content"><div><h3 className="mb-3 text-sm font-semibold">Why this workshop matched</h3><ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-muted-foreground">{result.match.explanations.map((reason, i) => <li key={i}>{reason}</li>)}</ul>{!result.match.eligibility.eligible && <p className="mt-4 text-sm font-medium">{result.match.eligibility.reasons.join(' ') || 'The service marked this workshop ineligible.'}</p>}</div><WorkshopFacts workshop={result.workshop} compact /></div>
      <div className="buyer-match-actions flex flex-wrap items-center justify-between gap-3 border-t pt-5"><Button variant="outline" onClick={() => setDetails(result.workshop)}>View workshop details</Button><div><Button disabled={!result.canInvite} aria-describedby={!result.canInvite ? 'invite-reason-' + result.workshop.id : undefined} onClick={() => { lock.current = false; mutation.reset(); setTarget(result); }}><Send aria-hidden="true" className="size-4" />Invite workshop</Button>{!result.canInvite && <p id={'invite-reason-' + result.workshop.id} className="mt-2 max-w-md text-xs text-muted-foreground">{result.invitationReason}</p>}</div></div>
    </article>)}</div>
    <WorkshopDetails workshop={details} onClose={() => setDetails(null)} />
    <ConfirmationDialog open={target !== null} onOpenChange={open => { if (!open) setTarget(null); }} title="Invite this workshop?" description={target ? 'Invite ' + target.workshop.name + ' to review “' + data.job.title + '”. This records a pending invitation; it does not create an order or quotation.' : ''} confirmLabel="Send invitation" onConfirm={invite} busy={mutation.isPending} error={mutation.isError ? mutation.error.message : null} />
  </>;
}
