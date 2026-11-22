import { z } from 'zod';
import type { AuditEvent, Inspection, InspectionFindings } from '@/types';
import { ServiceError } from '../contracts';
import { decisionSchema, findingsSchema, validateChecks, type InspectorInspectionData, type InspectorService } from '../inspections';
import { api, apiAll, requireUser } from './http';
import {
  checklistBody, dayInIndia, decisionRecord, findingsFromStored, inspectionSchema, jobView, liveChecklist, orderView, qcStatus,
  storedChecklistSchema, workshopStub,
} from './mappers';
import { fetchOrder } from './buyer';

/**
 * Inspector workspace in live mode. One "inspection" row per CURRENT assignment
 * (GET /inspections/assigned): its id is the assignment id, its history is every
 * backend inspection of that order. Checklist results are stored as structured
 * data (Inspection.checklist); the free-text findings hold the summary only.
 * Unsubmitted work is a private server draft (GET/PUT/DELETE
 * /orders/:orderId/inspection-draft) that only the assigned inspector can reach.
 */
const enc = encodeURIComponent;
const FINDINGS_LIMIT = 2000;
const assignedSchema = z.object({
  assignmentId: z.string(), assignedAt: z.string(),
  order: z.object({ id: z.string(), status: z.string(), expectedCompletionDate: z.string().nullable().optional() }),
});
type Assigned = z.infer<typeof assignedSchema>;
const draftSchema = z.object({ id: z.string(), checklist: z.unknown(), findings: z.string().nullable().optional(), updatedAt: z.string() });

const draftPath = (orderId: string) => '/orders/' + enc(orderId) + '/inspection-draft';
async function readDraft(orderId: string): Promise<{ findings: InspectionFindings; updatedAt: string } | null> {
  const { draft } = await api(draftPath(orderId), z.object({ draft: draftSchema.nullable() }));
  if (!draft) return null;
  const stored = storedChecklistSchema.safeParse(draft.checklist);
  if (!stored.success) return null;
  return { findings: { items: findingsFromStored(stored.data, draft.id), summary: draft.findings ?? '' }, updatedAt: draft.updatedAt };
}
function summaryText(findings: InspectionFindings): string {
  const text = findings.summary.trim();
  if (text.length > FINDINGS_LIMIT) {
    throw new ServiceError('VALIDATION', 'The inspection summary is ' + text.length + ' characters; the server accepts at most ' + FINDINGS_LIMIT + '.');
  }
  return text;
}

async function build(assignment: Assigned): Promise<InspectorInspectionData> {
  const user = requireUser();
  const [order, { inspections }, draft] = await Promise.all([
    fetchOrder(assignment.order.id),
    api('/orders/' + enc(assignment.order.id) + '/inspections', z.object({ inspections: z.array(inspectionSchema) })),
    readDraft(assignment.order.id),
  ]);
  if (!order.job || !order.workshop) throw new ServiceError('SERVER', 'The server did not return the job or workshop for this order.');
  const job = jobView(order.job, order.buyerId);
  const checklist = liveChecklist(job);
  const oldestFirst = [...inspections].sort((a, b) => a.inspectedAt.localeCompare(b.inspectedAt) || a.id.localeCompare(b.id));
  const history = oldestFirst.map(item => decisionRecord(item, checklist));
  const latest = oldestFirst.at(-1);
  const latestRecord = history.at(-1);
  const due = dayInIndia(order.expectedCompletionDate);
  // A saved draft only counts if it matches the current checklist exactly.
  const draftMatches = draft && draft.findings.items.length === checklist.length && checklist.every(check => draft.findings.items.some(item => item.id === check.id));
  const inspection: Inspection = {
    id: assignment.assignmentId, orderId: order.id, inspectorId: user.id,
    decision: latest ? qcStatus(latest.status) : 'PENDING', notes: latest?.findings ?? '', evidence: [],
    checklist, history, assignedAt: assignment.assignedAt,
    updatedAt: draft?.updatedAt ?? latest?.inspectedAt ?? assignment.assignedAt,
    ...(due ? { dueOn: due } : {}),
    ...(latestRecord?.decision === 'REWORK' && latestRecord.reworkDeadline ? { reworkDeadline: latestRecord.reworkDeadline } : {}),
    ...(draft && draftMatches ? { draft: draft.findings } : {}),
  };
  const canDecide = order.status === 'IN_PROGRESS';
  const activity: AuditEvent[] = inspections.filter(item => item.inspectorId === user.id).map(item => ({
    id: item.id, actorId: user.id, entityId: order.id, entityType: 'Order', action: 'QC_' + item.status, occurredAt: item.inspectedAt,
  }));
  return {
    inspection, order: orderView(order, job.deadline), job, workshop: workshopStub(order.workshop),
    buyer: { id: order.buyerId, name: order.buyer?.name ?? 'Buyer', email: '', role: 'buyer' }, inspector: user,
    canDecide,
    decisionReason: canDecide
      ? 'Record a QC decision. The latest decision determines whether the buyer can complete the order.'
      : order.status === 'CONFIRMED' ? 'Production has not started yet; inspections open once the order is in progress.'
      : 'This order is ' + order.status.toLowerCase() + '; no further inspections can be recorded.',
    activity,
    reworkTargets: (order.milestones ?? []).filter(step => ['IN_PROGRESS', 'COMPLETED', 'APPROVED'].includes(step.status)).map(step => ({
      id: step.id, label: step.sequence + '. ' + step.title + ' (' + step.status.replaceAll('_', ' ').toLowerCase() + ')',
    })),
  };
}

export function createLiveInspector(): InspectorService {
  async function assigned() { return apiAll('/inspections/assigned', assignedSchema); }
  async function one(assignmentId: string): Promise<InspectorInspectionData> {
    const row = (await assigned()).find(item => item.assignmentId === assignmentId);
    if (!row) throw new ServiceError('NOT_FOUND', 'This inspection is unavailable or no longer assigned to you.');
    return build(row);
  }
  return {
    async listInspections() { return Promise.all((await assigned()).map(build)); },
    async getInspection(_inspectorId, inspectionId) { return one(inspectionId); },
    async saveDraft(_inspectorId, inspectionId, input) {
      const parsed = findingsSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the findings.');
      const data = await one(inspectionId);
      if (!data.canDecide) throw new ServiceError('CONFLICT', data.decisionReason);
      validateChecks(data.inspection, parsed.data);
      const summary = summaryText(parsed.data);
      const { draft } = await api(draftPath(data.order.id), z.object({ draft: draftSchema }), {
        method: 'PUT',
        body: { checklist: checklistBody(data.inspection.checklist ?? [], parsed.data), ...(summary ? { findings: summary } : {}) },
      });
      return { ...data.inspection, draft: parsed.data, updatedAt: draft.updatedAt };
    },
    async deleteDraft(_inspectorId, inspectionId) {
      const data = await one(inspectionId);
      await api(draftPath(data.order.id), z.unknown(), { method: 'DELETE' });
    },
    async submitDecision(_inspectorId, inspectionId, input) {
      const parsed = decisionSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the decision.');
      const data = await one(inspectionId);
      if (!data.canDecide) throw new ServiceError('CONFLICT', data.decisionReason);
      const decision = parsed.data;
      validateChecks(data.inspection, decision.findings, decision.decision);
      const checklist = data.inspection.checklist ?? [];
      const findings = summaryText(decision.findings);
      // One request: the server records the official inspection and deletes this inspector's draft atomically.
      const body = decision.decision === 'REWORK'
        ? {
            status: 'REWORK_REQUIRED', findings,
            checklist: checklistBody(checklist, decision.findings, { reason: decision.reason, correctiveAction: decision.correctiveAction, reworkDeadline: decision.reworkDeadline }),
            ...(decision.milestoneId ? { milestoneId: decision.milestoneId } : {}),
          }
        : { status: decision.decision === 'ACCEPTED' ? 'PASSED' : 'FAILED', findings, checklist: checklistBody(checklist, decision.findings) };
      await api('/orders/' + enc(data.order.id) + '/inspections', z.unknown(), { method: 'POST', body });
      return (await one(inspectionId)).inspection;
    },
  };
}
