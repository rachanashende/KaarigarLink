import { ServiceError } from './contracts';
import { z } from 'zod';
import type { AuditEvent, Inspection, InspectionFindings, Job, Order, User, Workshop } from '@/types';
import { todayInIndia } from './jobs';

const text = z.string().trim().max(4000, 'Use no more than 4000 characters.');
export const evidenceSchema = z.strictObject({
  id: z.string().min(1).max(200), name: z.string().trim().min(1).max(255), mediaType: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(0).max(10 * 1024 * 1024, 'Each evidence file must be at most 10 MB.'),
  /** Live mode only (M12): the uploaded document. */
  documentId: z.string().min(1).optional(),
});
export const findingsSchema = z.strictObject({
  items: z.array(z.strictObject({
    id: z.string().min(1).max(200), result: z.enum(['UNRECORDED', 'PASS', 'FAIL', 'NOT_APPLICABLE']),
    notes: text, evidence: z.array(evidenceSchema).max(3, 'Use at most 3 evidence files per check.'),
  })).max(20),
  summary: text,
});
export const decisionSchema = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('ACCEPTED'), findings: findingsSchema }),
  z.strictObject({ decision: z.literal('FAILED'), findings: findingsSchema }),
  z.strictObject({
    decision: z.literal('REWORK'), findings: findingsSchema,
    reason: text.min(10, 'Describe the rework reason in at least 10 characters.'),
    correctiveAction: text.min(10, 'Describe corrective actions in at least 10 characters.'),
    reworkDeadline: z.iso.date({ error: 'Enter a valid rework deadline.' }).refine(date => date > todayInIndia(), 'Rework deadline must be a future date (India time).'),
    /** Live mode only: the milestone to send back (any started one, including APPROVED). */
    milestoneId: z.string().min(1).optional(),
  }),
]);
export type QCDecisionInput = z.infer<typeof decisionSchema>;
export interface InspectorInspectionData {
  inspection: Inspection; order: Order; job: Job; workshop: Workshop; buyer: User; inspector: User;
  canDecide: boolean; decisionReason: string; activity: AuditEvent[];
  /** Live mode only: started milestones a rework request can target. */
  reworkTargets?: { id: string; label: string }[];
}
export interface InspectorService {
  listInspections(inspectorId: string): Promise<InspectorInspectionData[]>;
  getInspection(inspectorId: string, inspectionId: string): Promise<InspectorInspectionData>;
  saveDraft(inspectorId: string, inspectionId: string, findings: InspectionFindings): Promise<Inspection>;
  submitDecision(inspectorId: string, inspectionId: string, input: QCDecisionInput): Promise<Inspection>;
  /** Live mode only: delete the saved server draft. */
  deleteDraft?(inspectorId: string, inspectionId: string): Promise<void>;
}

export function validateChecks(inspection: Inspection, findings: InspectionFindings, decision?: QCDecisionInput['decision']) {
  const checks = inspection.checklist ?? [];
  if (!checks.length || findings.items.length !== checks.length || new Set(findings.items.map(item => item.id)).size !== checks.length || findings.items.some(item => !checks.some(check => check.id === item.id))) throw new ServiceError('VALIDATION', 'Findings must match this inspection checklist exactly.');
  if (!decision) return;
  if (findings.summary.length < 10) throw new ServiceError('VALIDATION', 'Write an inspection summary of at least 10 characters.');
  for (const check of checks) {
    const item = findings.items.find(item => item.id === check.id)!;
    if (check.required && item.result === 'UNRECORDED') throw new ServiceError('VALIDATION', 'Complete every required checklist item.');
    if ((item.result === 'FAIL' || item.result === 'NOT_APPLICABLE') && item.notes.length < 10) throw new ServiceError('VALIDATION', 'Document failed or not-applicable findings in at least 10 characters.');
    if (check.evidenceRequired && item.result !== 'UNRECORDED' && !item.evidence.length) throw new ServiceError('VALIDATION', 'Attach the required evidence metadata.');
  }
  if (decision === 'ACCEPTED' && findings.items.some(item => item.result === 'FAIL')) throw new ServiceError('VALIDATION', 'Acceptance cannot contain failed findings.');
  if (decision === 'REWORK' && !findings.items.some(item => item.result === 'FAIL')) throw new ServiceError('VALIDATION', 'Record at least one failed checklist finding for rework.');
  if (decision === 'FAILED' && !findings.items.some(item => item.result === 'FAIL')) throw new ServiceError('VALIDATION', 'Record at least one failed checklist finding to fail the inspection.');
}
