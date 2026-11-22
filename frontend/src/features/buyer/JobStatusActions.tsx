import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import type { Job } from '@/types';

/**
 * M12 live mode: publish a draft job or cancel a job that has not been awarded
 * (PUT /jobs/:id { status }). Cancelling expires its invitations and cancels its
 * submitted quotes (backend rule). Awarded work is cancelled through the order instead.
 */
export function JobStatusActions({ job }: { job: Job }) {
  const { buyer } = useServices(); const { user } = useAuth(); const cache = useQueryClient();
  const [confirm, setConfirm] = useState<'OPEN' | 'CANCELLED' | null>(null);
  const [notice, setNotice] = useState('');
  const mutation = useMutation({
    mutationFn: (status: 'OPEN' | 'CANCELLED') => buyer.setJobStatus!(user!.id, job.id, status),
    onSuccess: (_result, status) => { setConfirm(null); setNotice(status === 'OPEN' ? 'Job published.' : 'Job cancelled.'); },
    onSettled: () => cache.invalidateQueries({ queryKey: ['buyer', user?.id] }),
  });
  if (!buyer.setJobStatus || !job.backendStatus) return null;
  const cancellable = ['DRAFT', 'OPEN', 'MATCHED'].includes(job.backendStatus);
  if (!cancellable && !notice) return null;
  return <section aria-label="Job status" className="rounded-lg border bg-card p-6 sm:p-7">
    <h2 className="text-lg font-semibold">Job status</h2>
    {notice && <p role="status" className="mt-3 rounded-md border bg-secondary p-3 text-sm">{notice}</p>}
    {cancellable && <div className="mt-4 flex flex-wrap gap-3">
      {job.backendStatus === 'DRAFT' && <Button disabled={mutation.isPending} onClick={() => { mutation.reset(); setConfirm('OPEN'); }}>Publish job</Button>}
      <Button variant="outline" disabled={mutation.isPending} onClick={() => { mutation.reset(); setConfirm('CANCELLED'); }}>Cancel job</Button>
    </div>}
    <ConfirmationDialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }}
      title={confirm === 'OPEN' ? 'Publish this job?' : 'Cancel this job?'}
      description={confirm === 'OPEN' ? 'Published jobs can be matched and workshops can be invited.' : 'Invitations expire and submitted quotations are cancelled. This cannot be undone.'}
      confirmLabel={confirm === 'OPEN' ? 'Publish job' : 'Cancel job'} onConfirm={() => { if (confirm) mutation.mutate(confirm); }}
      busy={mutation.isPending} error={mutation.error?.message ?? null} />
  </section>;
}
