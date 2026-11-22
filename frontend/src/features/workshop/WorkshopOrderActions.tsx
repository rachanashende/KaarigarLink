import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { Button } from '@/components/ui/button';
import { FormField, controlClass } from '@/components/FormField';
import { milestoneInputSchema, type WorkshopOrderData } from '@/services/workshop';
import { moneyLabel } from '@/features/buyer/model';

/**
 * Live-mode production commands for the awarded workshop: start the order, plan and
 * progress milestones, and record simulated refunds for cancelled orders. Rendered
 * only when the data service implements them; the backend enforces every rule.
 */
export function WorkshopOrderActions({ row }: { row: WorkshopOrderData }) {
  const { workshop } = useServices(); const { user } = useAuth(); const cache = useQueryClient();
  const [title, setTitle] = useState(''); const [sequence, setSequence] = useState(''); const [dueOn, setDueOn] = useState(''); const [description, setDescription] = useState('');
  const [formError, setFormError] = useState(''); const [notice, setNotice] = useState('');
  const command = useMutation({
    mutationFn: async (run: () => Promise<void>) => run(),
    onSettled: () => cache.invalidateQueries({ queryKey: ['workshop', user?.id] }),
  });
  if (!workshop.startOrder || !workshop.createMilestone || !workshop.startMilestone || !workshop.completeMilestone || !workshop.refundPayment) return null;
  const { startOrder, createMilestone, startMilestone, completeMilestone, refundPayment } = workshop;
  const actor = user!.id;
  const { order } = row;
  const editable = order.backendStatus === 'CONFIRMED' || order.backendStatus === 'IN_PROGRESS';
  async function run(action: () => Promise<void>, done: string): Promise<boolean> {
    setNotice('');
    try { await command.mutateAsync(action); setNotice(done); return true; } catch { return false; /* error shown below */ }
  }
  async function addMilestone() {
    setFormError('');
    const parsed = milestoneInputSchema.safeParse({
      title, sequence: Number(sequence), ...(dueOn ? { dueOn } : {}), ...(description.trim() ? { description: description.trim() } : {}),
    });
    if (!parsed.success) { setFormError(parsed.error.issues[0]?.message ?? 'Check the milestone.'); return; }
    if (await run(() => createMilestone(actor, order.id, parsed.data), 'Milestone added.')) { setTitle(''); setSequence(''); setDueOn(''); setDescription(''); }
  }
  const refundable = order.backendStatus === 'CANCELLED' ? row.payments.filter(payment => payment.simulationStatus === 'SIMULATED_PAID') : [];
  return <section aria-label="Production commands" className="space-y-5 rounded-lg border bg-card p-5 sm:p-6">
    <h2 className="text-lg font-semibold">Production commands</h2>
    {notice && <p role="status" className="rounded-md border bg-secondary p-3 text-sm">{notice}</p>}
    {command.error && <p role="alert" className="text-sm text-destructive">{command.error.message}</p>}
    {order.backendStatus === 'CONFIRMED' && <div className="space-y-2">
      <p className="text-sm text-muted-foreground">The buyer awarded this order. Start production when work begins.</p>
      <Button disabled={command.isPending} onClick={() => { void run(() => startOrder(actor, order.id), 'Production started.'); }}>Start production</Button>
    </div>}
    {order.milestones.length > 0 && <ul className="divide-y text-sm">{order.milestones.map(step => <li key={step.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span>{step.sequence ? step.sequence + '. ' : ''}{step.title} · {(step.stage ?? step.status).replaceAll('_', ' ').toLowerCase()}</span>
      {order.backendStatus === 'IN_PROGRESS' && (step.stage === 'PENDING' || step.stage === 'REWORK_REQUIRED') && <Button variant="outline" disabled={command.isPending} onClick={() => { void run(() => startMilestone(actor, step.id), 'Milestone started.'); }}>{step.stage === 'REWORK_REQUIRED' ? 'Restart for rework' : 'Start milestone'}</Button>}
      {order.backendStatus === 'IN_PROGRESS' && step.stage === 'IN_PROGRESS' && <Button variant="outline" disabled={command.isPending} onClick={() => { void run(() => completeMilestone(actor, step.id), 'Milestone completed; awaiting buyer approval.'); }}>Complete milestone</Button>}
    </li>)}</ul>}
    {order.backendStatus === 'IN_PROGRESS' && <p className="text-xs text-muted-foreground">Milestones run in sequence: each starts once every earlier milestone is approved by the buyer.</p>}
    {editable && <form noValidate className="grid gap-4 border-t pt-5 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void addMilestone(); }}>
      <FormField id="milestone-title" label="Milestone title">{props => <input {...props} maxLength={200} className={controlClass} value={title} onChange={event => setTitle(event.target.value)} />}</FormField>
      <FormField id="milestone-sequence" label="Sequence" hint="Must come after every started milestone.">{props => <input {...props} type="number" min="1" max="1000" step="1" className={controlClass} value={sequence} onChange={event => setSequence(event.target.value)} />}</FormField>
      <FormField id="milestone-due" label="Due date" optional>{props => <input {...props} type="date" className={controlClass} value={dueOn} onChange={event => setDueOn(event.target.value)} />}</FormField>
      <FormField id="milestone-description" label="Description" optional>{props => <input {...props} maxLength={2000} className={controlClass} value={description} onChange={event => setDescription(event.target.value)} />}</FormField>
      {formError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{formError}</p>}
      <div className="sm:col-span-2"><Button type="submit" disabled={command.isPending}>Add milestone</Button></div>
    </form>}
    {refundable.length > 0 && <div className="space-y-3 border-t pt-5">
      <h3 className="text-sm font-semibold">Refunds due to the buyer</h3>
      <p className="text-xs text-muted-foreground">This order was cancelled after payment. Record each refund once you have returned the money (simulated; no money moves here).</p>
      <ul className="divide-y text-sm">{refundable.map(payment => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <span>{moneyLabel(payment.amount ?? 0)} · {payment.description ?? payment.id}</span>
        <Button variant="outline" disabled={command.isPending} onClick={() => { void run(() => refundPayment(actor, payment.id), 'Refund recorded.'); }}>Record refund</Button>
      </li>)}</ul>
    </div>}
  </section>;
}
