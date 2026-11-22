import { JobRequirementSummary } from './JobRequirementSummary';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { BuyerQuotesData } from '@/services/marketplace';
import type { Workshop } from '@/types';
import { BuyerHeader as PageHeader } from './BuyerHeader';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState, ErrorState } from '@/components/feedback';
import { useBuyerQuotes } from './queries';
import { useServices } from '@/app/services';
import { BuyerLoading } from './BuyerLoading';
import { JobWorkspaceNav } from './JobWorkspaceNav';
import { WorkshopDetails } from './WorkshopDetails';
import { QuoteDetailsDialog, AwardReviewDialog } from './QuoteDialogs';
import { dateLabel, moneyLabel } from './model';
import { quoteRange, sortQuotes, quoteLabels, type QuoteSort } from './quoteModel';
import { jobControlClass } from './JobField';
import { placeLabel } from '@/components/utils';

export function QuotesPage() {
  const { id = '' } = useParams();
  const query = useBuyerQuotes(id);
  if (query.isPending) return <><PageHeader title="Compare quotations" /><BuyerLoading label="Loading quotations…" /></>;
  if (query.isError) return <><PageHeader title="Compare quotations" /><ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} /><Button asChild variant="outline" className="mt-5"><Link to="/buyer/jobs">Return to jobs</Link></Button></>;
  return <QuotesWorkspace key={query.data.job.id} data={query.data} />;
}
function QuotesWorkspace({ data }: { data: BuyerQuotesData }) {
  const { demo } = useServices();
  const [sort, setSort] = useState<QuoteSort>('amount');
  const [selection, setSelection] = useState<string[]>([]);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const rows = sortQuotes(data.quotations, sort);
  const range = quoteRange(rows);
  const selected = data.quotations.filter(entry => selection.includes(entry.quote.id));
  const selectedRange = quoteRange(selected);
  const details = data.quotations.find(entry => entry.quote.id === detailsId) ?? null;
  const review = data.quotations.find(entry => entry.quote.id === reviewId) ?? null;
  return <>
    <PageHeader title="Compare quotations" description={data.job.title} action={demo ? <StatusBadge tone="warning">Demo quotations</StatusBadge> : undefined} />
    <JobWorkspaceNav jobId={data.job.id} />
    <div className="mb-6 rounded-lg border border-accent bg-accent/10 p-4 text-sm leading-relaxed">{data.awardBlocker}</div>
    {!rows.length ? <EmptyState title="No quotations yet" description="Invite eligible workshops to review this brief. Quotations will appear here when available." action={<Button asChild variant="outline"><Link to={'/buyer/jobs/' + encodeURIComponent(data.job.id) + '/matches'}>View workshop matches</Link></Button>} /> : <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p id="compare-selection-note" role="status" className="text-sm font-medium">{selected.length} of 3 quotations selected for comparison</p><p className="mt-2 text-xs text-muted-foreground">{rows.length} quotations for this job · amounts in INR</p></div>
        <div className="flex flex-wrap items-end gap-3">
          {selected.length > 0 && <><Button asChild variant="outline"><a href="#quote-comparison">Compare selected ({selected.length})</a></Button><Button variant="outline" onClick={() => setSelection([])}>Clear selection</Button></>}
          <div><label htmlFor="quote-sort" className="mb-2 block text-sm font-medium">Sort quotations</label><select id="quote-sort" className={jobControlClass} value={sort} onChange={event => setSort(event.target.value as QuoteSort)}><option value="amount">Amount: low to high</option><option value="amount-desc">Amount: high to low</option><option value="delivery">Delivery: earliest</option></select></div>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground xl:hidden">Scroll the table to view all quotation details and actions.</p>
      <DataTable caption="Job quotations" rows={rows} rowKey={entry => entry.quote.id} columns={[
        { key: 'compare', header: 'Compare', cell: entry => <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center"><input type="checkbox" className="size-4 accent-primary" aria-describedby="compare-selection-note" checked={selection.includes(entry.quote.id)} disabled={!selection.includes(entry.quote.id) && selected.length >= 3} onChange={event => { const checked = event.target.checked; setSelection(previous => {
          const current = previous.filter(id => data.quotations.some(item => item.quote.id === id));
          return checked ? [...current, entry.quote.id] : current.filter(id => id !== entry.quote.id);
        }); }} /><span className="sr-only">{'Compare quotation ' + entry.quote.id + ' from ' + entry.workshop.name}</span></label> },
        { key: 'workshop', header: 'Workshop', cell: entry => <div className="min-w-40 max-w-60"><button className="min-h-11 text-left font-semibold text-primary hover:underline" onClick={() => setWorkshop(entry.workshop)}>{entry.workshop.name}</button><p className="mt-1 text-xs text-muted-foreground">{placeLabel(entry.workshop.location)}</p></div> },
        { key: 'amount', header: 'Amount (INR)', cell: entry => <span className="whitespace-nowrap font-semibold tabular-nums">{moneyLabel(entry.quote.amount)}</span> },
        { key: 'delivery', header: 'Delivery', cell: entry => <time className="whitespace-nowrap" dateTime={entry.quote.estimatedDelivery}>{dateLabel(entry.quote.estimatedDelivery)}</time> },
        { key: 'status', header: 'Status', cell: entry => <StatusBadge tone={entry.quote.status === 'SUBMITTED' ? 'info' : 'neutral'}>{quoteLabels[entry.quote.status]}</StatusBadge> },
        { key: 'notes', header: 'Notes', cell: entry => <p className="min-w-44 max-w-60 text-xs leading-relaxed text-muted-foreground">{entry.quote.notes || 'No notes provided.'}</p> },
        { key: 'actions', header: 'Actions', cell: entry => <div className="min-w-40 space-y-2"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDetailsId(entry.quote.id)}>View quote</Button><Button disabled={!entry.canReviewAward} aria-describedby={!entry.canReviewAward ? 'review-reason-' + entry.quote.id : undefined} onClick={() => setReviewId(entry.quote.id)}>Review award</Button></div>{!entry.canReviewAward && <p id={'review-reason-' + entry.quote.id} className="text-xs leading-relaxed text-muted-foreground">{entry.reviewReason}</p>}</div> },
      ]} />
      {selected.length > 0 && <section id="quote-comparison" tabIndex={-1} aria-labelledby="comparison-heading" className="buyer-comparison mt-8 scroll-mt-6">
        <h2 id="comparison-heading" className="mb-5 text-xl font-semibold">Selected quotation comparison</h2>
        <div className={selected.length === 1 ? 'grid max-w-xl gap-4' : selected.length === 2 ? 'grid items-stretch gap-4 md:grid-cols-2' : 'grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3'}>{selected.map(entry => <article key={entry.quote.id} aria-label={'Compare ' + entry.workshop.name} className="min-w-0 rounded-lg border bg-card p-5">
          <h3 className="text-lg font-semibold">{entry.workshop.name}</h3><p className="mt-2 text-xs text-muted-foreground">{placeLabel(entry.workshop.location)}</p>
          <dl className="mt-5 divide-y text-sm">{[
            ['Amount (INR)', moneyLabel(entry.quote.amount)], ['Delivery', dateLabel(entry.quote.estimatedDelivery)],
            ['Status', quoteLabels[entry.quote.status]], ['Capabilities', entry.workshop.capabilities.join(', ')],
            ['Notes', entry.quote.notes || 'No notes provided.'],
          ].map(([label, value]) => <div key={label} className="py-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{value}</dd></div>)}</dl>
          <Button disabled={!entry.canReviewAward} className="mt-4" onClick={() => setReviewId(entry.quote.id)}>Review award</Button>
          {!entry.canReviewAward && <p className="mt-3 text-xs text-muted-foreground">{entry.reviewReason}</p>}
        </article>)}</div>
      </section>}
    </>}
    <WorkshopDetails workshop={workshop} onClose={() => setWorkshop(null)} />
    <QuoteDetailsDialog entry={details} onClose={() => setDetailsId(null)} />
    <AwardReviewDialog entry={review} job={data.job} blocker={data.awardBlocker} onClose={() => setReviewId(null)} />
  </>;
}
