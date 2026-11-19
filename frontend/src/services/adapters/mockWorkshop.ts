import { identity, one } from './mockWorkshopAccess';
import { createMockWorkshopCommands } from './mockWorkshopCommands';
import { invitationActions, quotationActions } from '../workshopCommands';
import type { Collections, Inspection, Invitation, Order, Quote, Workshop } from '@/types';
import { ServiceError } from '../contracts';
import type { MockStore } from '../mock/store';
import type { WorkshopBuyer, WorkshopInspection, WorkshopInvitationData, WorkshopJob, WorkshopOrderData, WorkshopService } from '../workshop';

function profileView(item: Workshop): Workshop {
  return {
    id: item.id, ownerId: item.ownerId, name: item.name,
    location: { city: item.location.city, state: item.location.state, ...(item.location.address === undefined ? {} : { address: item.location.address }) },
    capabilities: [...item.capabilities], machines: item.machines.map(({ id, name, process }) => ({ id, name, process })),
    capacitySlots: item.capacitySlots.map(({ id, startsOn, endsOn, availableQuantity, unit }) => ({ id, startsOn, endsOn, availableQuantity, unit })),
    ...(item.coordinates === undefined ? {} : { coordinates: { latitude: item.coordinates.latitude, longitude: item.coordinates.longitude } }),
    ...(item.rating === undefined ? {} : { rating: item.rating }),
  };
}
function jobView(state: Collections, id: string): { job: WorkshopJob; buyer: WorkshopBuyer } {
  const item = one(state.jobs.filter(job => job.id === id));
  const buyer = one(state.users.filter(user => user.id === item.buyerId && user.role === 'buyer'));
  return { buyer: { id: buyer.id, name: buyer.name }, job: {
    id: item.id, buyerId: item.buyerId, title: item.title, description: item.description, capability: item.capability,
    material: item.material, specification: item.specification, quantity: item.quantity, unit: item.unit,
    processes: [...item.processes], deadline: item.deadline, status: item.status,
    location: { city: item.location.city, state: item.location.state },
    ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
    ...(item.budget === undefined ? {} : { budget: item.budget }),
  } };
}
function quoteView(item: Quote): Quote {
  const { id, jobId, workshopId, amount, estimatedDelivery, notes, status } = item;
  return { id, jobId, workshopId, amount, estimatedDelivery, notes, status };
}
function invitationView(state: Collections, item: Invitation): WorkshopInvitationData {
  one(state.invitations.filter(row => row.id === item.id));
  const { id, jobId, workshopId, status } = item;
  return { invitation: { id, jobId, workshopId, status }, ...jobView(state, jobId),
    actions: invitationActions(state, item),
    quotes: state.quotes.filter(quote => quote.jobId === jobId && quote.workshopId === workshopId).map(quote => {
      one(state.quotes.filter(row => row.id === quote.id)); return quoteView(quote);
    }),
  };
}
function inspectionView(state: Collections, item: Inspection): WorkshopInspection {
  one(state.inspections.filter(row => row.id === item.id));
  one(state.users.filter(user => user.id === item.inspectorId && user.role === 'inspector'));
  return {
    id: item.id, orderId: item.orderId, inspectorId: item.inspectorId, decision: item.decision, notes: item.notes,
    ...(item.dueOn === undefined ? {} : { dueOn: item.dueOn }),
    ...(item.assignedAt === undefined ? {} : { assignedAt: item.assignedAt }),
    ...(item.updatedAt === undefined ? {} : { updatedAt: item.updatedAt }),
    ...(item.reworkDeadline === undefined ? {} : { reworkDeadline: item.reworkDeadline }),
    history: (item.history ?? []).map(record => {
      one(state.users.filter(user => user.id === record.inspectorId && user.role === 'inspector'));
      const common = { id: record.id, inspectorId: record.inspectorId, submittedAt: record.submittedAt,
        findings: { summary: record.findings.summary, items: record.findings.items.map(({ id, result, notes }) => ({ id, result, notes })) } };
      return record.decision === 'ACCEPTED' ? { ...common, decision: 'ACCEPTED' as const } :
        { ...common, decision: 'REWORK' as const, reason: record.reason, correctiveAction: record.correctiveAction, reworkDeadline: record.reworkDeadline };
    }),
  };
}
function orderView(state: Collections, item: Order): WorkshopOrderData {
  one(state.orders.filter(row => row.id === item.id));
  const joined = jobView(state, item.jobId);
  const quote = one(state.quotes.filter(row => row.id === item.quoteId));
  if (quote.jobId !== item.jobId || quote.workshopId !== item.workshopId || joined.job.buyerId !== item.buyerId || item.milestones.some(step => step.orderId !== item.id)) {
    throw new ServiceError('SERVER', 'Order ownership or milestone references are inconsistent.');
  }
  const order: Order = {
    id: item.id, jobId: item.jobId, workshopId: item.workshopId, buyerId: item.buyerId, quoteId: item.quoteId, status: item.status,
    ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
    ...(item.qcStatus === undefined ? {} : { qcStatus: item.qcStatus }),
    milestones: item.milestones.map(step => ({
      id: step.id, orderId: step.orderId, title: step.title, dueOn: step.dueOn, status: step.status,
      ...(step.completedAt === undefined ? {} : { completedAt: step.completedAt }),
      ...(step.description === undefined ? {} : { description: step.description }),
      ...(step.notes === undefined ? {} : { notes: step.notes }),
    })),
  };
  return { order, ...joined, quote: quoteView(quote),
    inspections: state.inspections.filter(row => row.orderId === item.id).map(row => inspectionView(state, row)),
    payments: state.payments.filter(row => row.orderId === item.id).map(({ id, orderId, simulationStatus }) => ({ id, orderId, simulationStatus })),
  };
}
export function createMockWorkshop(store: MockStore): WorkshopService {
  return {
    ...createMockWorkshopCommands(store),
    async getWorkspace(actor) {
      const state = store.snapshot(); const { account, profile } = identity(state, actor);
      const invitations = profile ? state.invitations.filter(row => row.workshopId === profile.id).map(row => invitationView(state, row)) : [];
      const quotations = profile ? state.quotes.filter(row => row.workshopId === profile.id).map(row => {
        one(state.quotes.filter(quote => quote.id === row.id));
        return { quote: quoteView(row), ...jobView(state, row.jobId), actions: quotationActions(state, row) };
      }) : [];
      const orders = profile ? state.orders.filter(row => row.workshopId === profile.id).map(row => orderView(state, row)) : [];
      const inspections = orders.flatMap(row => row.inspections);
      return { account, profile: profile ? profileView(profile) : null, invitations, quotations, orders, summary: {
        invitations: invitations.length, submittedQuotes: quotations.filter(row => row.quote.status === 'SUBMITTED').length,
        activeOrders: orders.filter(row => !['CLOSED', 'CANCELLED'].includes(row.order.status)).length,
        pendingInspections: inspections.filter(row => row.decision === 'PENDING').length,
        openRework: inspections.filter(row => row.decision === 'REWORK').length,
        closedOrders: orders.filter(row => row.order.status === 'CLOSED').length,
      } };
    },
    async getInvitation(actor, id) {
      const state = store.snapshot(); const { profile } = identity(state, actor);
      const row = profile ? state.invitations.find(item => item.id === id && item.workshopId === profile.id) : undefined;
      if (!row) throw new ServiceError('NOT_FOUND', 'This invitation is unavailable.');
      return invitationView(state, row);
    },
    async getOrder(actor, id) {
      const state = store.snapshot(); const { profile } = identity(state, actor);
      const row = profile ? state.orders.find(item => item.id === id && item.workshopId === profile.id) : undefined;
      if (!row) throw new ServiceError('NOT_FOUND', 'This order is unavailable.');
      return orderView(state, row);
    },
  };
}
