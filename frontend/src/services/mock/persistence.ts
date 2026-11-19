import { applyQCUpdates, qcUpdates, qcUpdatesSchema } from './qcPersistence';
import { z } from 'zod';
import type { Collections } from '@/types';
import { createJobSchema } from '../jobs';
import { reviewSchema } from '../orders';
import { ServiceError } from '../contracts';

export const DEMO_DATA_KEY = 'kaarigarlink.demo-data.v1';
const id = z.string().min(1).max(200);
const job = createJobSchema.omit({ deadline: true, designFiles: true }).extend({
  id, buyerId: id, deadline: z.iso.date(), createdAt: z.iso.datetime().optional(),
  status: z.enum(['POSTED', 'QUOTING', 'AWARDED', 'CLOSED', 'CANCELLED']),
  designFiles: z.array(z.never()).max(0),
});
const base = z.strictObject({
  version: z.literal(1),
  jobs: z.array(job).max(1000),
  invitations: z.array(z.strictObject({ id, jobId: id, workshopId: id, status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED']) })).max(2000),
  reviews: z.array(reviewSchema.extend({ id, orderId: id })).max(1000),
  auditEvents: z.array(z.strictObject({ id, actorId: id, entityId: id, entityType: z.enum(['Job', 'Order']), action: z.string().min(1).max(100), occurredAt: z.iso.datetime() })).max(5000),
});
const schema = z.union([base, base.extend({ version: z.literal(2), inspectionUpdates: qcUpdatesSchema })]);
export function restoreDemo(raw: string, seed: Collections): Collections {
  const parsed = schema.parse(JSON.parse(raw));
  const state = { ...structuredClone(seed), jobs: parsed.jobs.map(({ budget, createdAt, ...job }) => ({ ...job, ...(budget === undefined ? {} : { budget }), ...(createdAt === undefined ? {} : { createdAt }) })), invitations: parsed.invitations, reviews: parsed.reviews, auditEvents: parsed.auditEvents };
  const jobs = new Set(state.jobs.map(job => job.id));
  const users = new Set(state.users.map(user => user.id));
  const workshops = new Set(state.workshops.map(workshop => workshop.id));
  const orders = new Set(state.orders.map(order => order.id));
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(state.jobs.map(job => job.id)) || !unique(state.invitations.map(item => item.jobId + '/' + item.workshopId)) ||
      !unique(state.reviews.map(review => review.orderId)) ||
      seed.jobs.some(job => !jobs.has(job.id)) ||
      state.jobs.some(job => !state.users.some(user => user.id === job.buyerId && user.role === 'buyer')) ||
      state.invitations.some(item => !jobs.has(item.jobId) || !workshops.has(item.workshopId)) ||
      state.reviews.some(review => !orders.has(review.orderId) || !state.orders.some(order => order.id === review.orderId && order.status === 'CLOSED')) ||
      state.auditEvents.some(event => !users.has(event.actorId) || !(event.entityType === 'Job' ? jobs : orders).has(event.entityId))) throw new Error('Invalid demo references');
  if (parsed.version === 2) applyQCUpdates(state, parsed.inspectionUpdates);
  return state;
}
export function saveDemo(storage: Storage, state: Collections) {
  // Persist only demo-owned mutable collections; attachments and identity never enter this envelope.
  const jobs = state.jobs.map(job => ({ ...job, designFiles: [] }));
  try { storage.setItem(DEMO_DATA_KEY, JSON.stringify({ version: 2, jobs, invitations: state.invitations, reviews: state.reviews, auditEvents: state.auditEvents, inspectionUpdates: qcUpdates(state) })); }
  catch { throw new ServiceError('SERVER', 'Demo data could not be saved in this browser. Free storage or reset demo data and retry. No changes were committed.'); }
}
