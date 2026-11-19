import type { Inspection, InspectionCheck, InspectionDecisionRecord, InspectionFindings } from '@/types';

export const machiningChecks: InspectionCheck[] = [
  { id: 'dimensions', label: 'Dimensional accuracy', requirement: 'Compare bore dimensions with drawing revision B and record the measured result.', required: true, evidenceRequired: true },
  { id: 'material', label: 'Material conformity', requirement: 'Check the material certificate against Aluminium 6061.', required: true, evidenceRequired: false },
  { id: 'finish', label: 'Surface finish', requirement: 'Inspect the specified finish and deburred edges.', required: true, evidenceRequired: false },
  { id: 'quantity', label: 'Quantity verification', requirement: 'Count the 100-piece batch against the job requirement.', required: true, evidenceRequired: false },
];
export function emptyFindings(checklist: InspectionCheck[]): InspectionFindings {
  return { items: checklist.map(check => ({ id: check.id, result: 'UNRECORDED', notes: '', evidence: [] })), summary: '' };
}
export function enrichInspections(source: Inspection[]): Inspection[] {
  const extra: Inspection = {
    id: 'inspection-overdue', orderId: 'order-production', inspectorId: 'inspector-1', decision: 'REWORK',
    notes: 'Correct the bore finish before presenting a fresh dimensional report.', evidence: [], reworkDeadline: '2026-11-18',
  };
  return [...source, extra].map(inspection => {
    const pending = inspection.decision === 'PENDING';
    const submittedAt = inspection.id === 'inspection-overdue' ? '2026-11-16T10:00:00.000Z' : '2026-11-17T10:00:00.000Z';
    const findings = emptyFindings(machiningChecks);
    findings.summary = inspection.notes;
    findings.items = findings.items.map(item => ({
      ...item, result: inspection.decision === 'REWORK' && item.id === 'finish' ? 'FAIL' : 'PASS',
      notes: inspection.decision === 'REWORK' && item.id === 'finish' ? 'Bore finish exceeds the drawing requirement.' : 'Conformity recorded in the historical demo.',
      evidence: item.id === 'dimensions' ? [{ id: 'evidence-' + inspection.id, name: 'synthetic-dimensional-report.pdf', mediaType: 'application/pdf', sizeBytes: 24000 }] : [],
    }));
    const common = { id: 'decision-' + inspection.id, inspectorId: inspection.inspectorId, submittedAt, findings };
    const history: InspectionDecisionRecord[] = pending ? [] : inspection.decision === 'REWORK'
      ? [{ ...common, decision: 'REWORK', reason: inspection.notes, correctiveAction: 'Correct the bore finish and provide a fresh dimensional report.', reworkDeadline: inspection.reworkDeadline! }]
      : [{ ...common, decision: 'ACCEPTED' }];
    return { ...inspection, checklist: structuredClone(machiningChecks), assignedAt: '2026-11-15T08:00:00.000Z', dueOn: pending ? '2026-11-24' : '2026-11-17', updatedAt: pending ? '2026-11-15T08:00:00.000Z' : submittedAt, history };
  });
}
