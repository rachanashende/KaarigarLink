import { ServiceError } from '../contracts';
import type { AdminService } from '../admin';
import type { MockStore } from '../mock/store';

export function createMockAdmin(store: MockStore): AdminService {
  return {
    async getOverview(actor) {
      const state = store.snapshot();
      const admin = state.users.find(user => user.id === actor);
      if (!admin) throw new ServiceError('UNAUTHORIZED', 'Sign in to view platform operations.');
      if (admin.role !== 'admin') throw new ServiceError('FORBIDDEN', 'An admin account is required.');
      const { users, workshops, jobs, orders, inspections, quotes, matches, invitations } = state;
      if (workshops.some(item => !users.some(user => user.id === item.ownerId && user.role === 'workshop')) ||
          jobs.some(item => !users.some(user => user.id === item.buyerId && user.role === 'buyer')) ||
          orders.some(item => !jobs.some(job => job.id === item.jobId && job.buyerId === item.buyerId) || !quotes.some(quote => quote.id === item.quoteId && quote.jobId === item.jobId && quote.workshopId === item.workshopId)) ||
          [...quotes, ...matches, ...invitations].some(item => !jobs.some(job => job.id === item.jobId) || !workshops.some(workshop => workshop.id === item.workshopId)) ||
          inspections.some(item => !orders.some(order => order.id === item.orderId) || !users.some(user => user.id === item.inspectorId && user.role === 'inspector'))) {
        throw new ServiceError('SERVER', 'Platform records contain incomplete references. Reset demo data or retry after the source is corrected.');
      }
      // Explicit projections exclude unknown credential fields, private drafts and attachment metadata.
      return {
        users: users.map(({ id, name, email, role }) => ({ id, name, email, role })),
        workshops: workshops.map(item => ({
          id: item.id, ownerId: item.ownerId, name: item.name,
          location: { city: item.location.city, state: item.location.state }, capabilities: [...item.capabilities],
          machines: item.machines.map(({ id, name, process }) => ({ id, name, process })),
          capacitySlots: item.capacitySlots.map(({ id, startsOn, endsOn, availableQuantity, unit }) => ({ id, startsOn, endsOn, availableQuantity, unit })),
          ...(item.rating === undefined ? {} : { rating: item.rating }),
        })),
        jobs: jobs.map(item => ({
          id: item.id, buyerId: item.buyerId, title: item.title, description: item.description, capability: item.capability,
          material: item.material, specification: item.specification, quantity: item.quantity, unit: item.unit,
          processes: [...item.processes], deadline: item.deadline, status: item.status, designFiles: [],
          location: { city: item.location.city, state: item.location.state },
          ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
          ...(item.budget === undefined ? {} : { budget: item.budget }),
        })),
        orders: orders.map(item => ({
          id: item.id, buyerId: item.buyerId, jobId: item.jobId, workshopId: item.workshopId, quoteId: item.quoteId, status: item.status,
          ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
          ...(item.qcStatus === undefined ? {} : { qcStatus: item.qcStatus }),
          milestones: item.milestones.map(step => ({
            id: step.id, orderId: step.orderId, title: step.title, dueOn: step.dueOn, status: step.status,
            ...(step.completedAt === undefined ? {} : { completedAt: step.completedAt }),
            ...(step.description === undefined ? {} : { description: step.description }),
            ...(step.notes === undefined ? {} : { notes: step.notes }),
          })),
        })),
        inspections: inspections.map(item => ({
          id: item.id, orderId: item.orderId, inspectorId: item.inspectorId, decision: item.decision, notes: item.notes, evidence: [],
          ...(item.dueOn === undefined ? {} : { dueOn: item.dueOn }),
          ...(item.assignedAt === undefined ? {} : { assignedAt: item.assignedAt }),
          ...(item.updatedAt === undefined ? {} : { updatedAt: item.updatedAt }),
          ...(item.reworkDeadline === undefined ? {} : { reworkDeadline: item.reworkDeadline }),
          checklist: (item.checklist ?? []).map(({ id, label, requirement, required, evidenceRequired }) => ({ id, label, requirement, required, evidenceRequired })),
          history: (item.history ?? []).map(record => {
            const common = { id: record.id, inspectorId: record.inspectorId, submittedAt: record.submittedAt, findings: {
              summary: record.findings.summary, items: record.findings.items.map(({ id, result, notes }) => ({ id, result, notes, evidence: [] })),
            } };
            return record.decision === 'ACCEPTED' ? { ...common, decision: 'ACCEPTED' as const } : { ...common, decision: 'REWORK' as const, reason: record.reason, correctiveAction: record.correctiveAction, reworkDeadline: record.reworkDeadline };
          }),
        })),
        quotes: quotes.map(({ id, jobId, workshopId, amount, estimatedDelivery, notes, status }) => ({ id, jobId, workshopId, amount, estimatedDelivery, notes, status })),
        matches: matches.map(item => ({ jobId: item.jobId, workshopId: item.workshopId, score: item.score, explanations: [...item.explanations], eligibility: { eligible: item.eligibility.eligible, reasons: [...item.eligibility.reasons] } })),
        invitations: invitations.map(({ id, jobId, workshopId, status }) => ({ id, jobId, workshopId, status })),
        activity: state.auditEvents.filter(event => event.entityType === 'Job' ? jobs.some(job => job.id === event.entityId) : event.entityType === 'Order' && orders.some(order => order.id === event.entityId)).map(({ id, actorId, entityId, entityType, action, occurredAt }) => ({ id, actorId, entityId, entityType, action, occurredAt })),
      };
    },
  };
}
