import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { FormField, controlClass } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';
import { decisionSchema, validateChecks, type InspectorInspectionData, type QCDecisionInput } from '@/services/inspections';
import type { InspectionFinding, InspectionFindings } from '@/types';

export function QCChecklist({ data }: { data: InspectorInspectionData }) {
  const { inspection } = data; const { user } = useAuth(); const services = useServices(); const cache = useQueryClient();
  const [findings, setFindings] = useState<InspectionFindings>(() => inspection.draft ?? { items: (inspection.checklist ?? []).map(check => ({ id: check.id, result: 'UNRECORDED', notes: '', evidence: [] })), summary: '' });
  const [decision, setDecision] = useState<'ACCEPTED' | 'REWORK'>('ACCEPTED');
  const [reason, setReason] = useState(''); const [correctiveAction, setCorrectiveAction] = useState(''); const [deadline, setDeadline] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({}); const [pending, setPending] = useState<QCDecisionInput | null>(null);
  const [notice, setNotice] = useState(''); const [dirty, setDirty] = useState(false); const lock = useRef(false); const errorRef = useRef<HTMLDivElement>(null);
  async function refresh() { await Promise.all([cache.invalidateQueries({ queryKey: ['inspector', user!.id] }), cache.invalidateQueries({ queryKey: ['buyer'] })]); }
  const save = useMutation({ mutationFn: () => services.inspector.saveDraft(user!.id, inspection.id, findings), onSuccess: async () => { setDirty(false); setNotice('Draft saved. No QC decision has been submitted.'); await refresh(); } });
  const submit = useMutation({
    mutationFn: (input: QCDecisionInput) => services.inspector.submitDecision(user!.id, inspection.id, input),
    onSuccess: async () => { setPending(null); setNotice('Mock QC decision recorded. Order production status was preserved.'); await refresh(); },
    onError: () => { lock.current = false; },
  });
  function update(id: string, patch: Partial<InspectionFinding>) {
    setFindings(previous => ({ ...previous, items: previous.items.map(item => item.id === id ? { ...item, ...patch } : item) })); setDirty(true); setNotice('');
  }
  function review(event: FormEvent) {
    event.preventDefault(); setErrors({}); setNotice('');
    const input = decision === 'ACCEPTED' ? { decision, findings } : { decision, findings, reason, correctiveAction, reworkDeadline: deadline };
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      setErrors({ [String(issue.path[0] ?? 'form')]: issue.message }); requestAnimationFrame(() => errorRef.current?.focus()); return;
    }
    try { validateChecks(inspection, parsed.data.findings, parsed.data.decision); }
    catch (error) { setErrors({ form: error instanceof Error ? error.message : 'Check your findings.' }); requestAnimationFrame(() => errorRef.current?.focus()); return; }
    lock.current = false; submit.reset(); setPending(parsed.data);
  }
  const busy = save.isPending || submit.isPending;
  const confirmation = pending ? (pending.decision === 'ACCEPTED' ? 'Accept this inspection?' : 'Request workshop rework?') + ' ' + pending.findings.items.filter(item => item.result === 'PASS').length + ' passed; ' + pending.findings.items.filter(item => item.result === 'FAIL').length + ' failed. Summary: ' + pending.findings.summary + (pending.decision === 'REWORK' ? ' Reason: ' + pending.reason + ' Corrective action: ' + pending.correctiveAction + ' Deadline: ' + pending.reworkDeadline + '.' : '') + ' This mock command records human findings; it does not change production, payment or closure status.' : '';
  return <section aria-labelledby="qc-checklist" className="rounded-lg border bg-card p-5 sm:p-6">
    <h2 id="qc-checklist" className="text-lg font-semibold">Inspection checklist</h2>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Record your human inspection findings against the supplied requirements. KaarigarLink does not physically verify manufacturing quality.</p>
    {notice && <p role="status" className="mt-4 rounded-md border bg-secondary p-4 text-sm">{notice}</p>}
    {!data.canDecide ? <p className="mt-5 text-sm text-muted-foreground">{data.decisionReason}</p> :
    <form noValidate className="mt-6" onSubmit={review}>
      <p className="mb-4 text-xs font-medium text-muted-foreground">{dirty ? 'Unsaved draft findings' : inspection.draft ? 'Saved draft findings · not submitted' : 'New draft · not submitted'}</p>
      {Object.keys(errors).length > 0 && <div ref={errorRef} role="alert" tabIndex={-1} className="mb-5 rounded-md border border-destructive p-4 text-sm text-destructive outline-offset-4">{Object.values(errors).join(' ')}</div>}
      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">Save draft preserves checklist results, notes and summary only. Proposed rework reason, corrective action and deadline are entered at decision review and are not saved as drafts.</p>
      {(save.error || submit.error && !pending) && <p role="alert" className="mb-5 text-sm text-destructive">{save.error?.message ?? submit.error?.message}</p>}
      <fieldset disabled={busy} className="min-w-0 space-y-6"><legend className="sr-only">QC findings and decision</legend>
        {(inspection.checklist ?? []).map(check => {
          const item = findings.items.find(item => item.id === check.id)!;
          return <div key={check.id} className="min-w-0 rounded-md border p-4 sm:p-5"><h3 className="text-sm font-semibold">{check.label}{check.required && ' · required'}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{check.requirement}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField id={'result-' + check.id} label={check.label + ' result'}>{props => <select {...props} className={controlClass} value={item.result} onChange={event => update(check.id, { result: event.target.value as InspectionFinding['result'] })}><option value="UNRECORDED">Not recorded</option><option value="PASS">Pass</option><option value="FAIL">Fail</option><option value="NOT_APPLICABLE">Not applicable</option></select>}</FormField>
              <FormField id={'notes-' + check.id} label={check.label + ' notes'} hint="Failed or not-applicable checks require at least 10 characters.">{props => <textarea {...props} rows={2} maxLength={4000} className={controlClass} value={item.notes} onChange={event => update(check.id, { notes: event.target.value })} />}</FormField>
            </div>
            <div className="mt-4"><FormField id={'evidence-' + check.id} label={check.label + ' evidence'} hint={(check.evidenceRequired ? 'Evidence metadata required. ' : 'Optional evidence metadata. ') + 'Up to 3 files, 10 MB each. Contents are never read or uploaded; metadata stays in memory and must be reattached after reload.'}>{props => <input {...props} type="file" multiple className={controlClass} onChange={event => { update(check.id, { evidence: Array.from(event.target.files ?? []).map(file => ({ id: 'evidence-' + crypto.randomUUID(), name: file.name, mediaType: file.type || 'application/octet-stream', sizeBytes: file.size })) }); event.target.value = ''; }} />}</FormField>
              {item.evidence.length > 0 && <><ul className="mt-3 space-y-2">{item.evidence.map(file => <li key={file.id} className="break-all text-xs text-muted-foreground">{file.name} · {file.sizeBytes} bytes · {file.mediaType}</li>)}</ul><Button variant="outline" className="mt-3" onClick={() => update(check.id, { evidence: [] })}>Clear {check.label.toLowerCase()} evidence</Button></>}
            </div>
          </div>;
        })}
        <FormField id="qc-summary" label="Overall inspection summary" hint="At least 10 characters before submitting a decision." error={errors.findings}>{props => <textarea {...props} rows={4} maxLength={4000} className={controlClass} value={findings.summary} onChange={event => { setFindings(previous => ({ ...previous, summary: event.target.value })); setDirty(true); setNotice(''); }} />}</FormField>
        <FormField id="qc-decision" label="Proposed QC decision">{props => <select {...props} className={controlClass} value={decision} onChange={event => setDecision(event.target.value as 'ACCEPTED' | 'REWORK')}><option value="ACCEPTED">Accept inspection</option><option value="REWORK">Request rework</option></select>}</FormField>
        {decision === 'REWORK' && <div className="grid gap-5 rounded-md border border-destructive/30 p-5">
          <FormField id="rework-reason" label="Rework reason" error={errors.reason}>{props => <textarea {...props} rows={3} maxLength={4000} className={controlClass} value={reason} onChange={event => setReason(event.target.value)} />}</FormField>
          <FormField id="corrective-action" label="Corrective action notes" error={errors.correctiveAction}>{props => <textarea {...props} rows={3} maxLength={4000} className={controlClass} value={correctiveAction} onChange={event => setCorrectiveAction(event.target.value)} />}</FormField>
          <FormField id="rework-deadline" label="Rework deadline" error={errors.reworkDeadline} hint="A future calendar date in India time is required.">{props => <input {...props} type="date" className={controlClass} value={deadline} onChange={event => setDeadline(event.target.value)} />}</FormField>
        </div>}
        <div className="flex flex-wrap gap-3 border-t pt-5"><Button variant="outline" onClick={() => { save.reset(); setNotice(''); save.mutate(); }}>{save.isPending ? 'Saving draft…' : 'Save draft'}</Button><Button type="submit">Review QC decision</Button></div>
      </fieldset>
    </form>}
    <ConfirmationDialog open={!!pending} onOpenChange={open => { if (!open) setPending(null); }} title="Confirm mock QC decision" description={confirmation} confirmLabel="Record QC decision" onConfirm={() => { if (!pending || lock.current) return; lock.current = true; submit.mutate(pending); }} busy={submit.isPending} error={submit.error?.message ?? null} />
  </section>;
}
