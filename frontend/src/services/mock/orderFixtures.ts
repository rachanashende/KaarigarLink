import type { AuditEvent, Inspection, Job, Milestone, Order, OrderStatus, Quote } from '@/types';

// Historical snapshots only: these records are never created through an award transition.
const samples: { id: string; title: string; status: OrderStatus; amount: number; completed: number; qc?: Order['qcStatus'] }[] = [
  { id: 'production', title: 'Machine conveyor bearing housings', status: 'IN_PRODUCTION', amount: 72000, completed: 1, qc: 'REWORK' },
  { id: 'qc', title: 'Mill sensor mounting plates', status: 'QC_PENDING', amount: 46000, completed: 3, qc: 'PENDING' },
  { id: 'rework', title: 'Finish pump impeller adapters', status: 'REWORK', amount: 64000, completed: 2, qc: 'REWORK' },
  { id: 'closed', title: 'Machine packaging line couplers', status: 'CLOSED', amount: 92000, completed: 4, qc: 'ACCEPTED' },
  { id: 'cancelled', title: 'Produce fixture locating pins', status: 'CANCELLED', amount: 28000, completed: 0 },
  { id: 'paid', title: 'Mill instrument base plates', status: 'PAID', amount: 51000, completed: 4, qc: 'ACCEPTED' },
];
export const orderJobs: Job[] = samples.map(sample => ({
  id: 'job-order-' + sample.id, buyerId: 'buyer-1', title: sample.title,
  description: 'Manufacture a repeat batch for a regional equipment assembly line.',
  capability: 'CNC machining', material: 'Aluminium 6061', specification: 'Drawing revision B. Deburr edges; maintain the specified bore tolerance.',
  quantity: 100, unit: 'pieces', processes: ['Milling', 'Drilling', 'Dimensional inspection'],
  createdAt: '2026-11-14T06:00:00.000Z', deadline: '2026-12-01', location: { city: 'Mumbai', state: 'Maharashtra' },
  designFiles: [], status: sample.status === 'CLOSED' ? 'CLOSED' : sample.status === 'CANCELLED' ? 'CANCELLED' : 'AWARDED',
}));
export const orderQuotes: Quote[] = samples.map(sample => ({
  id: 'quote-order-' + sample.id, jobId: 'job-order-' + sample.id, workshopId: 'workshop-1',
  amount: sample.amount, estimatedDelivery: '2026-12-01', status: 'AWARDED',
  notes: 'Fixed batch total in INR, including material and delivery to Mumbai. Historical demo quotation.',
}));
export const orders: Order[] = samples.map(sample => {
  const id = 'order-' + sample.id;
  const milestones: Milestone[] = ['Material received', 'Machining', 'Dimensional inspection', 'Dispatch preparation'].map((title, index) => ({
    id: id + '-m' + (index + 1), orderId: id, title,
    description: ['Confirm material grade and stock allocation.', 'Complete the batch to drawing revision B.', 'Record bore dimensions and surface finish.', 'Pack the accepted batch for delivery.'][index]!,
    dueOn: ['2026-11-16', '2026-11-17', '2026-11-24', '2026-11-30'][index]!,
    status: index < sample.completed ? 'COMPLETED' : index === sample.completed && sample.status !== 'CANCELLED' ? 'IN_PROGRESS' : 'PENDING',
    ...(index < sample.completed ? { completedAt: '2026-11-17T10:00:00.000Z' } : {}),
    notes: sample.status === 'REWORK' && index === 2 ? 'Bore finish correction requested; awaiting workshop update.' : index < sample.completed ? 'Workshop completion recorded in the demo snapshot.' : 'Workshop updates are read-only for buyers.',
  }));
  return { id, jobId: 'job-order-' + sample.id, workshopId: 'workshop-1', buyerId: 'buyer-1', quoteId: 'quote-order-' + sample.id, status: sample.status, createdAt: '2026-11-15T06:00:00.000Z', milestones, ...(sample.qc ? { qcStatus: sample.qc } : {}) };
});
export const orderInspections: Inspection[] = [
  { id: 'inspection-qc', orderId: 'order-qc', inspectorId: 'inspector-1', decision: 'PENDING', notes: 'Inspection is queued. No acceptance decision has been issued.', evidence: [] },
  { id: 'inspection-rework', orderId: 'order-rework', inspectorId: 'inspector-1', decision: 'REWORK', notes: 'Bore surface finish exceeds drawing tolerance on the sample. Correct the finish and provide a new dimensional report.', reworkDeadline: '2026-11-26', evidence: [] },
  ...['closed', 'paid'].map(id => ({ id: 'inspection-' + id, orderId: 'order-' + id, inspectorId: 'inspector-1', decision: 'ACCEPTED' as const, notes: 'Sample dimensions and finish meet drawing revision B.', evidence: [] })),
];
export const orderActivity: AuditEvent[] = orders.map(order => ({
  id: 'event-' + order.id, actorId: 'workshop-user-1', entityId: order.id, entityType: 'Order',
  action: 'DEMO_SNAPSHOT_RECORDED', occurredAt: '2026-11-17T11:00:00.000Z',
}));
