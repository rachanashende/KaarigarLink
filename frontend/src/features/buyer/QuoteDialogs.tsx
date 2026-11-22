import type { Job } from '@/types';
import type { WorkshopQuote } from '@/services/marketplace';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { dateLabel, moneyLabel } from './model';
import { quoteLabels } from './quoteModel';

function QuoteTerms({ entry }: { entry: WorkshopQuote }) {
  return <dl className="mt-5 space-y-4 text-sm">
    <div><dt className="text-xs text-muted-foreground">Workshop</dt><dd className="mt-1 font-semibold">{entry.workshop.name}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Quoted amount (INR)</dt><dd className="mt-1 text-xl font-semibold">{moneyLabel(entry.quote.amount)}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Delivery commitment</dt><dd className="mt-1">{dateLabel(entry.quote.estimatedDelivery)}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Quote status</dt><dd className="mt-2"><StatusBadge>{quoteLabels[entry.quote.status]}</StatusBadge></dd></div>
    <div><dt className="text-xs text-muted-foreground">Notes</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{entry.quote.notes || 'No notes provided.'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Reference</dt><dd className="mt-1 break-all">{entry.quote.id}</dd></div>
  </dl>;
}
export function QuoteDetailsDialog({ entry, onClose }: { entry: WorkshopQuote | null; onClose: () => void }) {
  return <Dialog open={entry !== null} onOpenChange={open => { if (!open) onClose(); }} title="Quotation details">
    {entry && <QuoteTerms entry={entry} />}
    <Button autoFocus variant="outline" className="mt-6" onClick={onClose}>Close quotation</Button>
  </Dialog>;
}
export function AwardReviewDialog({ entry, job, blocker, onClose }: { entry: WorkshopQuote | null; job: Job; blocker: string; onClose: () => void }) {
  return <Dialog open={entry !== null} onOpenChange={open => { if (!open) onClose(); }} title="Review award" description={job.title}>
    {entry && <><QuoteTerms entry={entry} />{!entry.canReviewAward && <p role="alert" className="mt-5 text-sm text-destructive">{entry.reviewReason}</p>}</>}
    <div className="mt-5 rounded-md border border-accent bg-accent/10 p-4 text-sm leading-relaxed"><p className="font-semibold">Awarding unavailable</p><p id="award-blocker" className="mt-2">{blocker}</p></div>
    <div className="mt-6 flex flex-wrap justify-end gap-3"><Button autoFocus variant="outline" onClick={onClose}>Cancel</Button><Button disabled aria-describedby="award-blocker">Award order</Button></div>
  </Dialog>;
}
