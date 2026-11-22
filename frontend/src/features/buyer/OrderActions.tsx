import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { FormField, controlClass } from '@/components/FormField';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/DataTable';
import { paymentStatusLabel, type BuyerOrderData } from '@/services/orders';
import type { PaymentRecord } from '@/types';
import { dateLabel, moneyLabel } from './model';

/**
 * Live-mode order commands for the buyer: complete, cancel, approve milestones and
 * the simulated payment flow. Rendered only when the data service implements them
 * (the mock workspace keeps its read-only order view). Every rule is enforced by
 * the backend; disabled states here only mirror it and show why.
 */
function useOrderCommand<T>(run: (value: T) => Promise<void>) {
  const cache = useQueryClient(); const { user } = useAuth();
  return useMutation({
    mutationFn: run,
    onSettled: () => cache.invalidateQueries({ queryKey: ['buyer', user?.id] }),
  });
}
const paymentLabels: Record<PaymentRecord['simulationStatus'], string> = {
  PENDING: 'Pending', SIMULATED_PAID: 'Paid (simulated)', SIMULATED_FAILED: 'Failed (simulated)', SIMULATED_REFUNDED: 'Refunded (simulated)',
};

export function OrderActions({ data }: { data: BuyerOrderData }) {
  const { buyer } = useServices(); const { user } = useAuth();
  const { order } = data;
  const [confirm, setConfirm] = useState<'complete' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const lifecycle = useOrderCommand(async (action: 'complete' | 'cancel') => {
    if (action === 'complete') await buyer.completeOrder!(user!.id, order.id);
    else await buyer.cancelOrder!(user!.id, order.id, reason);
  });
  const approve = useOrderCommand((milestoneId: string) => buyer.approveMilestone!(user!.id, milestoneId));
  if (!buyer.completeOrder || !buyer.cancelOrder) return null;
  const active = order.backendStatus === 'CONFIRMED' || order.backendStatus === 'IN_PROGRESS';
  const completeReason = order.backendStatus !== 'IN_PROGRESS' ? 'The workshop must start production before you can complete the order.'
    : order.qcStatus !== 'ACCEPTED' ? 'Completion needs the latest quality inspection to be PASSED.' : '';
  const awaitingApproval = order.milestones.filter(step => step.stage === 'COMPLETED');
  async function runLifecycle() {
    if (!confirm) return;
    try { await lifecycle.mutateAsync(confirm); setNotice(confirm === 'complete' ? 'Order completed.' : 'Order cancelled.'); setConfirm(null); }
    catch { /* The backend message stays visible in the dialog. */ }
  }
  return <section aria-labelledby="order-actions" className="mt-6 rounded-lg border bg-card p-5 sm:p-6">
    <h2 id="order-actions" className="text-lg font-semibold">Order actions</h2>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Completing closes the order and opens the workshop rating. Cancelling fails pending payments; successful payments stay recorded as a refund due.</p>
    {notice && <p role="status" className="mt-4 rounded-md border bg-secondary p-3 text-sm">{notice}</p>}
    {order.cancellationReason && <p className="mt-4 text-sm">Cancellation reason: {order.cancellationReason}</p>}
    {active ? <div className="mt-5 space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button disabled={!!completeReason || lifecycle.isPending} aria-describedby={completeReason ? 'complete-reason' : undefined} onClick={() => { lifecycle.reset(); setConfirm('complete'); }}>Complete order</Button>
        <Button variant="outline" disabled={lifecycle.isPending} onClick={() => { lifecycle.reset(); setConfirm('cancel'); }}>Cancel order</Button>
      </div>
      {completeReason && <p id="complete-reason" className="text-xs text-muted-foreground">{completeReason}</p>}
    </div> : <p className="mt-4 text-sm text-muted-foreground">This order is {order.backendStatus?.toLowerCase().replaceAll('_', ' ')}; no further lifecycle actions are available.</p>}
    {awaitingApproval.length > 0 && <div className="mt-6 border-t pt-5">
      <h3 className="text-sm font-semibold">Milestones awaiting your approval</h3>
      <ul className="mt-3 divide-y">{awaitingApproval.map(step => <li key={step.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <span>{step.sequence ? step.sequence + '. ' : ''}{step.title}</span>
        <Button variant="outline" disabled={approve.isPending} onClick={() => { approve.mutate(step.id); }}>{approve.isPending && approve.variables === step.id ? 'Approving…' : 'Approve milestone'}</Button>
      </li>)}</ul>
      {approve.error && <p role="alert" className="mt-2 text-sm text-destructive">{approve.error.message}</p>}
    </div>}
    <ConfirmationDialog open={confirm === 'complete'} onOpenChange={open => { if (!open) setConfirm(null); }} title="Complete this order?"
      description="The order and its job become COMPLETED. This cannot be undone." confirmLabel="Complete order" onConfirm={() => { void runLifecycle(); }} busy={lifecycle.isPending} error={lifecycle.error?.message ?? null} />
    {confirm === 'cancel' && <div className="mt-6 space-y-4 rounded-md border border-destructive/30 p-5">
      <FormField id="cancel-reason" label="Cancellation reason" hint="3 to 1000 characters. Shared with the workshop.">{props => <textarea {...props} rows={3} maxLength={1000} className={controlClass} value={reason} onChange={event => setReason(event.target.value)} />}</FormField>
      {lifecycle.error && <p role="alert" className="text-sm text-destructive">{lifecycle.error.message}</p>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={lifecycle.isPending} onClick={() => setConfirm(null)}>Keep order</Button><Button disabled={lifecycle.isPending} onClick={() => { void runLifecycle(); }}>{lifecycle.isPending ? 'Cancelling…' : 'Cancel order'}</Button></div>
    </div>}
  </section>;
}

export function OrderPayments({ data }: { data: BuyerOrderData }) {
  const { buyer } = useServices(); const { user } = useAuth();
  const [amount, setAmount] = useState(''); const [description, setDescription] = useState(''); const [notice, setNotice] = useState('');
  const create = useOrderCommand((input: { amount: number; description?: string }) => buyer.createPayment!(user!.id, data.order.id, input));
  const simulate = useOrderCommand((input: { id: string; outcome: 'SUCCEEDED' | 'FAILED' }) => buyer.simulatePayment!(user!.id, input.id, input.outcome));
  if (!buyer.createPayment || !buyer.simulatePayment || !data.paymentSummary) return null;
  const summary = data.paymentSummary;
  const payments = data.payments ?? [];
  const open = data.order.backendStatus === 'CONFIRMED' || data.order.backendStatus === 'IN_PROGRESS';
  /** M13 (BUG-06): the banner always describes the latest action, never a stale PENDING step. */
  function record(id: string, outcome: 'SUCCEEDED' | 'FAILED') {
    setNotice('');
    simulate.mutate({ id, outcome }, { onSuccess: () => setNotice(outcome === 'SUCCEEDED' ? 'Payment marked as paid (simulated).' : 'Payment marked as failed (simulated); its amount is available to pay again.') });
  }
  async function pay() {
    setNotice('');
    try {
      await create.mutateAsync({ amount: Number(amount), ...(description.trim() ? { description: description.trim() } : {}) });
      setAmount(''); setDescription(''); setNotice('Payment created as PENDING. Record the simulated gateway result below.');
    } catch { /* shown below */ }
  }
  return <section aria-labelledby="order-payments" className="mt-6 rounded-lg border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="order-payments" className="text-lg font-semibold">Payments</h2><StatusBadge tone="warning">Simulated · no money moves</StatusBadge></div>
    <p className="mt-3 text-sm">Payment status: <span className="font-semibold">{paymentStatusLabel(summary)}</span></p>
    <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">{[
      ['Agreed price', summary.agreedPrice], ['Paid', summary.paid], ['Pending', summary.pending],
      ['Remaining', summary.remaining], ['Refunded', summary.refunded], ['Refund due', summary.refundDue],
    ].map(([label, value]) => <div key={String(label)}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{moneyLabel(Number(value))}</dd></div>)}</dl>
    {summary.refundDue > 0 && <p className="mt-4 rounded-md border border-accent bg-accent/10 p-3 text-sm">This order was cancelled after payment. {moneyLabel(summary.refundDue)} is owed back to you until the workshop or an admin records the refund.</p>}
    {notice && <p role="status" className="mt-4 rounded-md border bg-secondary p-3 text-sm">{notice}</p>}
    <div className="mt-5"><DataTable caption="Order payments" rows={payments} rowKey={item => item.id} emptyTitle="No payments yet" emptyDescription="Payments you create for this order appear here." columns={[
      { key: 'amount', header: 'Amount', cell: item => <span className="whitespace-nowrap font-medium tabular-nums">{moneyLabel(item.amount ?? 0)}</span> },
      { key: 'status', header: 'Status', cell: item => <StatusBadge tone={item.simulationStatus === 'SIMULATED_FAILED' ? 'danger' : item.simulationStatus === 'PENDING' ? 'warning' : 'info'}>{paymentLabels[item.simulationStatus]}</StatusBadge> },
      { key: 'date', header: 'Created', cell: item => <span className="whitespace-nowrap">{dateLabel(item.createdAt)}</span> },
      { key: 'note', header: 'Description', cell: item => item.description ?? 'Not provided' },
      { key: 'actions', header: 'Simulated result', cell: item => item.simulationStatus === 'PENDING' ? <div className="flex min-w-48 flex-wrap gap-2">
        <Button variant="outline" disabled={simulate.isPending} onClick={() => { record(item.id, 'SUCCEEDED'); }}>Mark paid</Button>
        <Button variant="outline" disabled={simulate.isPending} onClick={() => { record(item.id, 'FAILED'); }}>Mark failed</Button>
      </div> : 'Recorded' },
    ]} /></div>
    {simulate.error && <p role="alert" className="mt-3 text-sm text-destructive">{simulate.error.message}</p>}
    {open ? <form noValidate className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={event => { event.preventDefault(); void pay(); }}>
      <FormField id="payment-amount" label="Amount (INR)">{props => <input {...props} type="number" min="0.01" step="0.01" inputMode="decimal" className={controlClass} value={amount} onChange={event => setAmount(event.target.value)} />}</FormField>
      <FormField id="payment-description" label="Description" optional>{props => <input {...props} maxLength={500} className={controlClass} value={description} onChange={event => setDescription(event.target.value)} />}</FormField>
      <Button type="submit" disabled={create.isPending || !amount}>{create.isPending ? 'Creating…' : 'Create payment'}</Button>
      {create.error && <p role="alert" className="text-sm text-destructive sm:col-span-3">{create.error.message}</p>}
    </form> : <p className="mt-5 text-sm text-muted-foreground">New payments are only possible while the order is confirmed or in progress.</p>}
  </section>;
}
