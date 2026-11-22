import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { Button } from '@/components/ui/button';
import { FormField, controlClass } from '@/components/FormField';
import { StatusBadge } from '@/components/StatusBadge';
import type { AdminOverview } from '@/services/admin';
import type { Order, Workshop } from '@/types';
import { dateLabel } from './model';

/**
 * Live-mode admin commands (backend-authorised; ADMIN only):
 * workshop verification and inspector assignment. Rendered only when the data
 * service implements them, so the mock admin workspace stays read-only.
 */
function useAdminCommand() {
  const cache = useQueryClient(); const { user } = useAuth();
  return useMutation({
    mutationFn: async (run: () => Promise<void>) => run(),
    onSettled: () => Promise.all([cache.invalidateQueries({ queryKey: ['admin', user?.id] })]),
  });
}

export function WorkshopVerification({ workshop }: { workshop: Workshop }) {
  const { admin } = useServices(); const { user } = useAuth();
  const command = useAdminCommand();
  const [notice, setNotice] = useState('');
  if (!admin.verifyWorkshop) return null;
  const verify = admin.verifyWorkshop;
  const status = workshop.verificationStatus ?? 'PENDING';
  async function set(next: 'PENDING' | 'VERIFIED' | 'REJECTED') {
    setNotice('');
    try { await command.mutateAsync(() => verify(user!.id, workshop.id, next)); setNotice('Verification status set to ' + next.toLowerCase() + '.'); }
    catch { /* shown below */ }
  }
  return <section className="rounded-lg border bg-card p-5 sm:p-6" aria-labelledby="workshop-verification">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="workshop-verification" className="text-lg font-semibold">Verification</h2><StatusBadge tone={status === 'VERIFIED' ? 'info' : status === 'REJECTED' ? 'danger' : 'warning'}>{status.charAt(0) + status.slice(1).toLowerCase()}</StatusBadge></div>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Only VERIFIED workshops appear in matching and can be awarded jobs. Editing verified details resets a workshop to pending.</p>
    {notice && <p role="status" className="mt-4 rounded-md border bg-secondary p-3 text-sm">{notice}</p>}
    {command.error && <p role="alert" className="mt-4 text-sm text-destructive">{command.error.message}</p>}
    <div className="mt-5 flex flex-wrap gap-3">
      <Button disabled={command.isPending || status === 'VERIFIED'} onClick={() => { void set('VERIFIED'); }}>Verify workshop</Button>
      <Button variant="outline" disabled={command.isPending || status === 'REJECTED'} onClick={() => { void set('REJECTED'); }}>Reject</Button>
      <Button variant="outline" disabled={command.isPending || status === 'PENDING'} onClick={() => { void set('PENDING'); }}>Return to pending</Button>
    </div>
  </section>;
}

export function InspectorAssignment({ order, data }: { order: Order; data: AdminOverview }) {
  const { admin } = useServices(); const { user } = useAuth();
  const command = useAdminCommand();
  const [selected, setSelected] = useState('');
  const [notice, setNotice] = useState('');
  const enabled = !!admin.assignInspector && !!admin.listInspectors && !!admin.listAssignments && !!admin.unassignInspector;
  const inspectors = useQuery({ queryKey: ['admin', user?.id, 'inspectors'], queryFn: () => admin.listInspectors!(user!.id), enabled });
  const history = useQuery({ queryKey: ['admin', user?.id, 'assignments', order.id], queryFn: () => admin.listAssignments!(user!.id, order.id), enabled });
  if (!enabled) return null;
  const assign = admin.assignInspector!; const unassign = admin.unassignInspector!;
  const current = data.assignments?.[order.id];
  const assignable = order.backendStatus === 'CONFIRMED' || order.backendStatus === 'IN_PROGRESS';
  const nameOf = (id: string) => data.users.find(item => item.id === id)?.name ?? id;
  async function run(action: () => Promise<void>, done: string) {
    setNotice('');
    try { await command.mutateAsync(action); setNotice(done); setSelected(''); await history.refetch(); await inspectors.refetch(); }
    catch { /* shown below */ }
  }
  return <section className="rounded-lg border bg-card p-5 sm:p-6" aria-labelledby="inspector-assignment">
    <h2 id="inspector-assignment" className="text-lg font-semibold">Inspector assignment</h2>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Only the assigned inspector can record or view this order's inspections. Reassigning ends the current assignment; past inspections keep their inspector.</p>
    <p className="mt-4 text-sm">Current inspector: <span className="font-semibold">{current ? nameOf(current.inspectorId) + ' · since ' + dateLabel(current.assignedAt) : 'None assigned'}</span></p>
    {notice && <p role="status" className="mt-4 rounded-md border bg-secondary p-3 text-sm">{notice}</p>}
    {command.error && <p role="alert" className="mt-4 text-sm text-destructive">{command.error.message}</p>}
    {assignable ? <div className="mt-5 grid gap-4 sm:grid-cols-[2fr_auto_auto] sm:items-end">
      <FormField id="assign-inspector" label={current ? 'Reassign to' : 'Assign inspector'}>{props => <select {...props} className={controlClass} value={selected} disabled={inspectors.isPending} onChange={event => setSelected(event.target.value)}>
        <option value="">{inspectors.isPending ? 'Loading inspectors…' : 'Choose an inspector'}</option>
        {(inspectors.data ?? []).filter(item => item.id !== current?.inspectorId).map(item => <option key={item.id} value={item.id}>{item.name} · {item.activeAssignments} active</option>)}
      </select>}</FormField>
      <Button disabled={!selected || command.isPending} onClick={() => { void run(() => assign(user!.id, order.id, selected), current ? 'Inspector reassigned.' : 'Inspector assigned.'); }}>{current ? 'Reassign' : 'Assign'}</Button>
      <Button variant="outline" disabled={!current || command.isPending} onClick={() => { void run(() => unassign(user!.id, order.id), 'Assignment ended.'); }}>Unassign</Button>
    </div> : <p className="mt-4 text-sm text-muted-foreground">Assignments can only change while the order is confirmed or in progress.</p>}
    {inspectors.error && <p role="alert" className="mt-3 text-sm text-destructive">{inspectors.error.message}</p>}
    <h3 className="mt-6 text-sm font-semibold">Assignment history</h3>
    {history.isPending ? <p className="mt-3 text-sm text-muted-foreground">Loading history…</p> : history.error ? <p role="alert" className="mt-3 text-sm text-destructive">{history.error.message}</p> :
      (history.data ?? []).length ? <ol className="mt-3 divide-y text-sm">{(history.data ?? []).map(row => <li key={row.id} className="py-3">
        <p className="font-medium">{row.inspectorName} {row.active && <StatusBadge tone="info">Current</StatusBadge>}</p>
        <p className="mt-1 text-xs text-muted-foreground">Assigned {dateLabel(row.assignedAt)} by {row.assignedByName}{row.endedAt ? ' · ended ' + dateLabel(row.endedAt) + (row.endedByName ? ' by ' + row.endedByName : '') : ''}</p>
      </li>)}</ol> : <p className="mt-3 text-sm text-muted-foreground">No inspector has been assigned to this order.</p>}
  </section>;
}
