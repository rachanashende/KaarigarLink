import type { Collections, Inspection } from '@/types';
import { ServiceError } from '../contracts';
import { decisionSchema, findingsSchema, validateChecks, type InspectorInspectionData, type InspectorService } from '../inspections';
import type { MockStore } from '../mock/store';

function requireInspector(state: Collections, id: string) {
  const user = state.users.find(user => user.id === id);
  if (!user) throw new ServiceError('UNAUTHORIZED', 'Sign in to view inspections.');
  if (user.role !== 'inspector') throw new ServiceError('FORBIDDEN', 'An inspector account is required.');
  return user;
}
function assigned(state: Collections, actor: string, id: string) {
  requireInspector(state, actor);
  const inspection = state.inspections.find(item => item.id === id && item.inspectorId === actor);
  if (!inspection) throw new ServiceError('NOT_FOUND', 'This inspection is unavailable.');
  return inspection;
}
function workspace(state: Collections, inspection: Inspection): InspectorInspectionData {
  const order = state.orders.find(order => order.id === inspection.orderId);
  const job = state.jobs.find(job => job.id === order?.jobId && job.buyerId === order?.buyerId);
  const workshop = state.workshops.find(workshop => workshop.id === order?.workshopId);
  const buyer = state.users.find(user => user.id === order?.buyerId && user.role === 'buyer');
  const inspector = state.users.find(user => user.id === inspection.inspectorId && user.role === 'inspector');
  if (!order || !job || !workshop || !buyer || !inspector) throw new ServiceError('SERVER', 'Inspection references are incomplete.');
  const canDecide = inspection.decision === 'PENDING' && !inspection.history?.length && order.status === 'QC_PENDING' && (!order.qcStatus || order.qcStatus === 'PENDING') && !!inspection.checklist?.length;
  return { inspection, order, job, workshop, buyer, inspector, canDecide,
    decisionReason: canDecide ? 'Mock QC decision available. Production status will be preserved.' : inspection.decision !== 'PENDING' || inspection.history?.length ? 'This assignment already has a submitted decision. Reinspection is not available.' : 'A checklist and an undecided order awaiting QC are required before a decision can be recorded.',
    activity: state.auditEvents.filter(event => event.actorId === inspector.id && event.entityType === 'Order' && event.entityId === order.id && event.action.startsWith('MOCK_QC_')).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  };
}
export function createMockInspections(store: MockStore): InspectorService {
  return {
    async listInspections(actor) {
      const state = store.snapshot(); requireInspector(state, actor);
      return state.inspections.filter(item => item.inspectorId === actor).map(item => workspace(state, item));
    },
    async getInspection(actor, id) { const state = store.snapshot(); return workspace(state, assigned(state, actor, id)); },
    async saveDraft(actor, id, input) {
      const parsed = findingsSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the findings.');
      let result!: Inspection;
      store.commit(state => {
        const inspection = assigned(state, actor, id);
        if (!workspace(state, inspection).canDecide) throw new ServiceError('CONFLICT', 'This inspection no longer accepts drafts or decisions.');
        validateChecks(inspection, parsed.data);
        inspection.draft = parsed.data; inspection.updatedAt = new Date().toISOString(); result = inspection;
      });
      return structuredClone(result);
    },
    async submitDecision(actor, id, input) {
      const parsed = decisionSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the decision.');
      let result!: Inspection;
      store.commit(state => {
        const inspection = assigned(state, actor, id);
        const data = workspace(state, inspection);
        if (!data.canDecide) throw new ServiceError('CONFLICT', data.decisionReason);
        validateChecks(inspection, parsed.data.findings, parsed.data.decision);
        const submittedAt = new Date().toISOString();
        const record = { ...parsed.data, id: 'qc-' + crypto.randomUUID(), inspectorId: actor, submittedAt };
        inspection.history = [...(inspection.history ?? []), record];
        inspection.decision = record.decision; inspection.updatedAt = submittedAt;
        inspection.notes = record.findings.summary;
        inspection.evidence = record.findings.items.flatMap(item => item.evidence);
        if (record.decision === 'REWORK') { inspection.reworkDeadline = record.reworkDeadline; inspection.notes += '\nRework reason: ' + record.reason + '\nCorrective action: ' + record.correctiveAction; }
        delete inspection.draft;
        // No production lifecycle transition is approved; change only the separate QC summary.
        data.order.qcStatus = record.decision;
        state.auditEvents.push({ id: 'event-' + crypto.randomUUID(), actorId: actor, entityId: data.order.id, entityType: 'Order', action: 'MOCK_QC_' + record.decision, occurredAt: submittedAt });
        result = inspection;
      });
      return structuredClone(result);
    },
  };
}
