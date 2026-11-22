import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { reviewSchema, type BuyerOrderData, type ReviewInput } from '@/services/orders';
import { JobField, jobControlClass } from './JobField';

export function OrderReview({ data }: { data: BuyerOrderData }) {
  const services = useServices(); const { user } = useAuth(); const cache = useQueryClient();
  const live = !services.demo;
  const [pending, setPending] = useState<ReviewInput | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const lock = useRef(false);
  const form = useForm<ReviewInput>({ resolver: zodResolver(reviewSchema), defaultValues: { comment: '' } });
  const mutation = useMutation({
    mutationFn: (input: ReviewInput) => services.buyer.submitReview(user!.id, data.order.id, input),
    onSuccess: async () => { setSubmitted(true); setPending(null); await cache.invalidateQueries({ queryKey: ['buyer', user!.id] }); },
    onError: () => { lock.current = false; },
  });
  function submit() { if (!pending || lock.current) return; lock.current = true; mutation.mutate(pending); }
  return <section aria-labelledby="workshop-review" className="rounded-lg border bg-card p-5 sm:p-6">
    <h2 id="workshop-review" className="text-lg font-semibold">Workshop review</h2>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{live ? 'One rating per completed order. Your score updates the workshop rating shown to other buyers.' : 'Mock-only review workflow · provisional eligibility: one review per CLOSED order. Payment completion alone does not qualify. Backend approval is pending.'}</p>
    {submitted && <p role="status" tabIndex={-1} ref={node => node?.focus()} className="mt-4 rounded-md border border-primary bg-secondary p-4 text-sm font-medium">{live ? 'Rating recorded. Thank you for your feedback.' : 'Demo review recorded. No order or QC status was changed.'}</p>}
    {data.review ? <div className="mt-5"><p className="text-sm font-semibold">Your rating: {data.review.rating} / 5</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{data.review.comment ?? 'No written feedback recorded.'}</p><p className="mt-3 text-xs text-muted-foreground">A review has already been recorded for this order.</p></div> :
    data.canReview && !submitted ? <form noValidate className="mt-6 space-y-5" onSubmit={form.handleSubmit(input => { mutation.reset(); setPending(input); })}>
      <JobField id="review-rating" label="Workshop rating" error={form.formState.errors.rating?.message}>{props => <select {...props} className={jobControlClass} defaultValue="" {...form.register('rating', { valueAsNumber: true })}><option value="" disabled>Choose a rating</option>{[5, 4, 3, 2, 1].map(rating => <option key={rating} value={rating}>{rating} / 5{rating === 5 ? ' — Excellent' : rating === 1 ? ' — Poor' : ''}</option>)}</select>}</JobField>
      <JobField id="review-comment" label="Written feedback" hint="10–2000 characters. Use synthetic feedback only." error={form.formState.errors.comment?.message}>{props => <textarea {...props} rows={4} className={jobControlClass} {...form.register('comment')} />}</JobField>
      <Button type="submit">Review submission</Button>
    </form> : !submitted && <p className="mt-5 text-sm text-muted-foreground">{data.reviewReason}</p>}
    <ConfirmationDialog open={!!pending} onOpenChange={open => { if (!open) setPending(null); }} title={live ? 'Submit rating?' : 'Submit demo review?'} description={'Record ' + (pending?.rating ?? '') + ' / 5 for ' + data.workshop.name + '? You cannot edit or submit another review' + (live ? ' for this order.' : ' in this demo.')} confirmLabel={live ? 'Submit rating' : 'Submit demo review'} onConfirm={submit} busy={mutation.isPending} error={mutation.error?.message ?? null} />
  </section>;
}
