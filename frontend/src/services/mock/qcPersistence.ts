import { z } from 'zod';
import type { Collections, InspectionFindings } from '@/types';
import { findingsSchema } from '../inspections';

const id = z.string().min(1).max(200);
const common = { id, inspectorId: id, submittedAt: z.iso.datetime(), findings: findingsSchema };
const recordSchema = z.discriminatedUnion('decision', [
  z.strictObject({ ...common, decision: z.literal('ACCEPTED') }),
  z.strictObject({ ...common, decision: z.literal('REWORK'), reason: z.string().min(10).max(4000), correctiveAction: z.string().min(10).max(4000), reworkDeadline: z.iso.date() }),
]);
export const qcUpdatesSchema = z.array(z.strictObject({
  inspectionId: id, draft: findingsSchema.nullable(), history: z.array(recordSchema).max(20), updatedAt: z.iso.datetime().nullable(),
})).max(1000);
function withoutEvidence(findings: InspectionFindings): InspectionFindings {
  return { ...findings, items: findings.items.map(item => ({ ...item, evidence: [] })) };
}
export function qcUpdates(state: Collections) {
  return state.inspections.map(inspection => ({
    inspectionId: inspection.id, draft: inspection.draft ? withoutEvidence(inspection.draft) : null,
    history: (inspection.history ?? []).map(record => ({ ...record, findings: withoutEvidence(record.findings) })),
    updatedAt: inspection.updatedAt ?? null,
  }));
}
export function applyQCUpdates(state: Collections, updates: z.infer<typeof qcUpdatesSchema>) {
  if (new Set(updates.map(update => update.inspectionId)).size !== updates.length) throw new Error('Duplicate inspection update');
  for (const update of updates) {
    const inspection = state.inspections.find(item => item.id === update.inspectionId);
    const order = state.orders.find(item => item.id === inspection?.orderId);
    if (!inspection || !order) throw new Error('Unknown inspection');
    const original = inspection.history ?? [];
    const strippedOriginal = original.map(record => ({ ...record, findings: withoutEvidence(record.findings) }));
    if (JSON.stringify(update.history.slice(0, original.length)) !== JSON.stringify(strippedOriginal) ||
        update.history.length > original.length + (inspection.decision === 'PENDING' && order.status === 'QC_PENDING' ? 1 : 0) ||
        update.history.length < original.length ||
        new Set(update.history.map(record => record.id)).size !== update.history.length ||
        update.history.some(record => record.inspectorId !== inspection.inspectorId) ||
        (update.draft && (inspection.decision !== 'PENDING' || update.history.length))) throw new Error('Invalid QC history');
    const matches = (findings: InspectionFindings) => {
      const checks = inspection.checklist ?? [];
      return findings.items.length === checks.length && new Set(findings.items.map(item => item.id)).size === checks.length && findings.items.every(item => checks.some(check => check.id === item.id));
    };
    if ((update.draft && !matches(update.draft)) || update.history.some(record => !matches(record.findings))) throw new Error('Invalid checklist references');
    inspection.history = update.history;
    if (update.updatedAt) inspection.updatedAt = update.updatedAt;
    if (update.draft) inspection.draft = update.draft;
    const latest = update.history.at(-1);
    if (latest) {
      inspection.decision = latest.decision; inspection.notes = latest.findings.summary;
      inspection.evidence = [];
      if (latest.decision === 'REWORK') {
        inspection.reworkDeadline = latest.reworkDeadline;
        inspection.notes += '\nRework reason: ' + latest.reason + '\nCorrective action: ' + latest.correctiveAction;
      }
      order.qcStatus = latest.decision;
    }
  }
}
