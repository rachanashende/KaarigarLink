import { useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { Button } from '@/components/ui/button';
import { FormField, controlClass } from '@/components/FormField';
import { moneyLabel, dateLabel } from '@/features/buyer/model';
import { todayInIndia } from '@/services/jobs';
import { quoteTermsSchema, validateQuoteDelivery, type QuoteTerms, type InvitationResponse } from '@/services/workshopCommands';
import type { WorkshopInvitationData, WorkshopJob, WorkshopQuotationData } from '@/services/workshop';
import type { Quote } from '@/types';

function terms(quote: Quote): QuoteTerms { return { amount: quote.amount, estimatedDelivery: quote.estimatedDelivery, notes: quote.notes }; }

function QuoteEditor({ job, invitationId, quote, onCancel, onSaved }: {
  job: WorkshopJob; invitationId?: string; quote?: Quote; onCancel: () => void; onSaved: () => void;
}) {
  const services = useServices(); const { user } = useAuth(); const cache = useQueryClient();
  const fieldId = useId();
  const [expected] = useState(() => quote ? terms(quote) : null);
  const [review, setReview] = useState<QuoteTerms | null>(null);
  const locked = useRef(false);
  const form = useForm<QuoteTerms>({ resolver: zodResolver(quoteTermsSchema), defaultValues: quote ? terms(quote) : { amount: 0, estimatedDelivery: '', notes: '' } });
  const mutation = useMutation({
    mutationFn: (input: QuoteTerms) => {
      if (quote && expected) return services.workshop.editQuote(user!.id, quote.id, { expected, changes: input });
      if (invitationId) return services.workshop.submitQuote(user!.id, invitationId, input);
      throw new Error('A canonical quotation or invitation is required.');
    },
    onSuccess: () => cache.invalidateQueries(),
    onError: () => { void cache.invalidateQueries(); },
  });
  function prepare(input: QuoteTerms) {
    try { validateQuoteDelivery(input, job.deadline); mutation.reset(); setReview(input); }
    catch (error) { form.setError('estimatedDelivery', { message: error instanceof Error ? error.message : 'Check the delivery date.' }); form.setFocus('estimatedDelivery'); }
  }
  async function confirm() {
    if (locked.current || !review) return;
    locked.current = true;
    try { await mutation.mutateAsync(review); onSaved(); }
    catch { /* Keep the draft and show the actual service error in the confirmation. */ }
    finally { locked.current = false; }
  }
  return <section className="role-quote-editor mt-5 space-y-4 border bg-card p-5" aria-label="Mock quotation editor">
    <h3 className="font-semibold">{quote ? 'Edit mock quotation' : 'Submit mock quotation'}</h3>
    <p className="text-sm text-muted-foreground">{job.title}. Amounts are INR totals. Production duration and cost breakdown are unavailable in the shared contract.</p>
    <form aria-label="Mock quotation form" noValidate onSubmit={event => { void form.handleSubmit(prepare)(event); }}>
      <fieldset disabled={mutation.isPending || review !== null} className="space-y-4">
        <FormField id={fieldId + '-amount'} label="Quoted total (INR)" error={form.formState.errors.amount?.message}>{props => <input {...props} {...form.register('amount', { valueAsNumber: true })} type="number" min="0.01" max="1000000000" step="0.01" className={controlClass} />}</FormField>
        <FormField id={fieldId + '-delivery'} label="Estimated delivery" error={form.formState.errors.estimatedDelivery?.message} hint={'Job deadline: ' + dateLabel(job.deadline)}>{props => <input {...props} {...form.register('estimatedDelivery')} type="date" min={todayInIndia()} max={job.deadline} className={controlClass} />}</FormField>
        <FormField id={fieldId + '-notes'} label="Quotation notes" optional error={form.formState.errors.notes?.message}>{props => <textarea {...props} {...form.register('notes')} rows={3} maxLength={4000} className={controlClass} />}</FormField>
        <div className="flex flex-wrap gap-3"><Button type="submit">Review mock quotation</Button><Button variant="outline" onClick={onCancel}>Cancel quotation</Button></div>
      </fieldset>
    </form>
    <ConfirmationDialog open={review !== null} onOpenChange={open => { if (!open && !locked.current) setReview(null); }} title={quote ? 'Save mock quotation changes?' : 'Submit mock quotation?'} description={review ? moneyLabel(review.amount) + ', estimated delivery ' + dateLabel(review.estimatedDelivery) + '. This local simulation does not award a job or create an order.' : ''} confirmLabel={quote ? 'Save quotation changes' : 'Submit quotation'} onConfirm={() => { void confirm(); }} busy={mutation.isPending} error={mutation.error?.message ?? null} />
  </section>;
}
export function WorkshopInvitationActions({ row }: { row: WorkshopInvitationData }) {
  const services = useServices(); const { user } = useAuth(); const cache = useQueryClient();
  const [response, setResponse] = useState<InvitationResponse['response'] | null>(null);
  const [editing, setEditing] = useState(false); const [feedback, setFeedback] = useState('');
  const locked = useRef(false);
  const mutation = useMutation({
    mutationFn: (value: InvitationResponse['response']) => services.workshop.respondToInvitation(user!.id, row.invitation.id, { response: value }),
    onSuccess: () => cache.invalidateQueries(), onError: () => { void cache.invalidateQueries(); },
  });
  const blocked = Boolean(services.demo?.warning);
  async function confirm() {
    if (locked.current || !response) return;
    locked.current = true;
    try { await mutation.mutateAsync(response); setFeedback('Mock invitation ' + response.toLowerCase() + '.'); setResponse(null); }
    catch { /* Actual service errors remain visible; no success is fabricated. */ }
    finally { locked.current = false; }
  }
  return <section className="space-y-3 rounded-lg border bg-card p-5" aria-label="Local mock invitation commands">
    <h2 className="text-lg font-semibold">Invitation response and quotation</h2>
    <p className="text-sm text-muted-foreground">Local mock simulation only. Responding never awards a job or creates an order.</p>
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    <div className="flex flex-wrap gap-3">
      <Button disabled={blocked || !row.actions.respond || mutation.isPending} onClick={() => { mutation.reset(); setResponse('ACCEPTED'); }}>Accept invitation</Button>
      <Button variant="outline" disabled={blocked || !row.actions.respond || mutation.isPending} onClick={() => { mutation.reset(); setResponse('DECLINED'); }}>Decline invitation</Button>
      <Button variant="outline" disabled={blocked || !row.actions.submitQuote || editing} onClick={() => { setFeedback(''); setEditing(true); }}>Submit quote</Button>
    </div>
    {row.actions.responseReason && <p className="text-sm text-muted-foreground">{row.actions.responseReason}</p>}
    {row.actions.quoteReason && <p className="text-sm text-muted-foreground">{row.actions.quoteReason}</p>}
    {blocked && <p className="text-sm text-destructive">Reset the shared demo data before making changes.</p>}
    {editing && <QuoteEditor job={row.job} invitationId={row.invitation.id} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setFeedback('Mock quotation submitted.'); }} />}
    <ConfirmationDialog open={response !== null} onOpenChange={open => { if (!open && !locked.current) setResponse(null); }} title={response === 'ACCEPTED' ? 'Accept this mock invitation?' : 'Decline this mock invitation?'} description="This records a terminal response in the shared local demo. It does not create an order, quotation or award." confirmLabel={response === 'ACCEPTED' ? 'Accept invitation' : 'Decline invitation'} onConfirm={() => { void confirm(); }} busy={mutation.isPending} error={mutation.error?.message ?? null} />
  </section>;
}
export function WorkshopQuoteActions({ row }: { row: WorkshopQuotationData }) {
  const services = useServices(); const { user } = useAuth(); const cache = useQueryClient();
  const [editing, setEditing] = useState(false); const [expected, setExpected] = useState<QuoteTerms | null>(null);
  const [feedback, setFeedback] = useState(''); const locked = useRef(false);
  const mutation = useMutation({
    mutationFn: (value: QuoteTerms) => services.workshop.withdrawQuote(user!.id, row.quote.id, { expected: value }),
    onSuccess: () => cache.invalidateQueries(), onError: () => { void cache.invalidateQueries(); },
  });
  async function confirm() {
    if (locked.current || !expected) return;
    locked.current = true;
    try { await mutation.mutateAsync(expected); setExpected(null); setFeedback('Mock quotation withdrawn.'); }
    catch { /* Keep the expected snapshot; stale commands cannot overwrite newer terms. */ }
    finally { locked.current = false; }
  }
  const blocked = Boolean(services.demo?.warning);
  return <div role="group" aria-label={'Commands for ' + row.quote.id} className="min-w-56 space-y-3">
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={blocked || !row.actions.edit || editing} onClick={() => { setFeedback(''); setEditing(true); }}>Edit quote</Button><Button variant="outline" disabled={blocked || !row.actions.withdraw || mutation.isPending} onClick={() => { mutation.reset(); setExpected(terms(row.quote)); }}>Withdraw quote</Button></div>
    {row.actions.reason && <p className="text-xs text-muted-foreground">{row.actions.reason}</p>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    {editing && <QuoteEditor job={row.job} quote={row.quote} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setFeedback('Mock quotation updated.'); }} />}
    <ConfirmationDialog open={expected !== null} onOpenChange={open => { if (!open && !locked.current) setExpected(null); }} title="Withdraw this mock quotation?" description="It stays in shared quotation history and cannot be resubmitted under this local mock policy." confirmLabel="Withdraw quotation" onConfirm={() => { void confirm(); }} busy={mutation.isPending} error={mutation.error?.message ?? null} />
  </div>;
}
