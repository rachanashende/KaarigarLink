import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';

export function DemoDataNotice() {
  const { demo } = useServices();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!demo) return null;
  async function reset() {
    if (!demo || busy) return;
    setBusy(true); setError(null);
    try { await demo.reset(); await cache.invalidateQueries(); setOpen(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to reset demo data.'); }
    finally { setBusy(false); }
  }
  return <aside aria-label="Demo data" className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-md border bg-card px-5 py-4">
    <div className="max-w-2xl"><p className="text-sm font-medium">Demo workspace · no live backend</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{demo.description}</p>{demo.warning && <p role="alert" className="mt-2 text-sm text-destructive">{demo.warning}</p>}</div>
    <Button variant="outline" onClick={() => { setError(null); setOpen(true); }}>Reset demo data</Button>
    <ConfirmationDialog open={open} onOpenChange={setOpen} title="Reset demo data?" description="This removes all posted demo jobs, invitations, reviews, QC drafts and decisions and restores the original seed for every demo role in this browser. Your login session stays active." confirmLabel="Reset demo data" onConfirm={reset} busy={busy} error={error} />
  </aside>;
}
