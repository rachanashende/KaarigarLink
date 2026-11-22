import { z } from 'zod';
import type { AuditEvent, Job, Workshop } from '@/types';
import { ServiceError } from '../contracts';
import { createJobSchema, type BuyerService } from '../jobs';
import { reviewSchema, paymentInputSchema, cancelOrderSchema, type BuyerOrderData } from '../orders';
import type { WorkshopMatch } from '../marketplace';
import { api, apiAll } from './http';
import { createLiveAudit } from './platform';
import type { AuditRecord } from '../platform';
import {
  QUOTABLE_JOB, inspectionView, invitationSchema, invitationView, jobSchema, jobView, liveChecklist, machineTypeFor,
  orderSchema, orderView, paymentSchema, paymentSummarySchema, paymentView, processFor, quoteSchema, quoteView,
  reviewView, summaryView, workshopSchema, workshopStub, workshopView, type BackendOrder,
} from './mappers';

const enc = encodeURIComponent;

/** An audit record as an activity entry (M12). */
export function auditActivity(item: AuditRecord): AuditEvent {
  return { id: item.id, actorId: item.actorId ?? '', entityId: item.entityId, entityType: item.entityType, action: item.action, occurredAt: item.createdAt };
}

// ---------- Shared reads ----------

export async function fetchWorkshops(ids: string[]): Promise<Map<string, Workshop>> {
  const unique = [...new Set(ids)];
  const rows = await Promise.all(unique.map(id => api('/workshops/' + enc(id), z.object({ workshop: workshopSchema }))));
  return new Map<string, Workshop>(rows.map(({ workshop }): [string, Workshop] => [workshop.id, workshopView(workshop)]));
}
export async function fetchOrder(id: string): Promise<BackendOrder> {
  return (await api('/orders/' + enc(id), z.object({ order: orderSchema }))).order;
}
const paymentsSchema = z.object({ payments: z.array(paymentSchema), summary: paymentSummarySchema });
export const fetchPayments = (orderId: string) => api('/orders/' + enc(orderId) + '/payments', paymentsSchema);

/** Order events derived from the records' own timestamps (the backend has no audit log). */
export function orderActivity(order: BackendOrder): AuditEvent[] {
  const event = (key: string, actorId: string, action: string, occurredAt: string): AuditEvent =>
    ({ id: order.id + ':' + key, actorId, entityId: order.id, entityType: 'Order', action, occurredAt });
  const events = [event('created', order.buyerId, 'ORDER_CREATED', order.createdAt)];
  for (const item of order.inspections ?? []) events.push(event('qc:' + item.id, item.inspectorId, 'QC_' + item.status, item.inspectedAt));
  for (const item of order.payments ?? []) events.push(event('payment:' + item.id, order.buyerId, 'PAYMENT_' + item.status, item.createdAt));
  if (order.status === 'COMPLETED' && order.actualCompletionDate) events.push(event('completed', order.buyerId, 'ORDER_COMPLETED', order.actualCompletionDate));
  if (order.status === 'CANCELLED' && order.updatedAt) events.push(event('cancelled', order.buyerId, 'ORDER_CANCELLED', order.updatedAt));
  return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new ServiceError('SERVER', 'The server did not return the ' + what + ' for this record.');
  return value;
}

/** Order detail without the payment list (the list view skips it to avoid per-order requests). */
function buyerOrderView(order: BackendOrder, money?: z.infer<typeof paymentsSchema>): BuyerOrderData {
  const job = jobView(required(order.job, 'job'), order.buyerId);
  const review = order.rating ? reviewView(order.id, order.rating) : null;
  const canReview = order.status === 'COMPLETED' && !review;
  return {
    order: orderView(order, job.deadline), job, quote: quoteView(required(order.quote, 'quotation')),
    workshop: workshopStub(required(order.workshop, 'workshop')),
    inspections: (order.inspections ?? []).map(item => inspectionView(item, liveChecklist(job))),
    review, canReview,
    reviewReason: review ? 'A rating has already been recorded for this order.' : canReview ? 'Rate the workshop for this completed order. One rating per order.' : 'Ratings open once you complete the order.',
    activity: orderActivity(money ? { ...order, payments: money.payments } : order),
    ...(money ? { payments: money.payments.map(paymentView), paymentSummary: summaryView(money.summary) } : {}),
  };
}
async function buyerOrder(id: string): Promise<BuyerOrderData> {
  const [order, money, history] = await Promise.all([fetchOrder(id), fetchPayments(id), createLiveAudit().orderHistory(id)]);
  // M12: the order activity is the recorded audit history, not derived from timestamps.
  return { ...buyerOrderView(order, money), activity: history.map(auditActivity) };
}

// ---------- Job creation mapping ----------

const KG_UNITS = ['kg', 'kgs', 'kilogram', 'kilograms'];
function createJobBody(input: unknown) {
  const parsed = createJobSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check your job details.');
  const job = parsed.data;
  if (!Number.isInteger(job.quantity)) throw new ServiceError('VALIDATION', 'Quantity must be a whole number.');
  if (job.material.length > 60) throw new ServiceError('VALIDATION', 'Material must be 60 characters or fewer.');
  if (job.title.length < 3) throw new ServiceError('VALIDATION', 'Job title must be at least 3 characters.');
  const seen = new Set<string>();
  const requirements = job.processes.flatMap(text => {
    const machine = machineTypeFor(text);
    const requirement = machine
      ? { requirementType: 'MACHINE_TYPE', requirementValue: machine, isMandatory: true }
      : { requirementType: 'OTHER', requirementValue: text.slice(0, 500), isMandatory: false };
    const key = requirement.requirementType + ':' + requirement.requirementValue.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [requirement];
  });
  return {
    title: job.title, description: job.description, material: job.material,
    manufacturingProcess: processFor(job.capability), quantity: job.quantity,
    quantityUnit: KG_UNITS.includes(job.unit.trim().toLowerCase()) ? 'KG' : 'UNITS',
    deadline: job.deadline, address: job.location.city + ', ' + job.location.state, status: 'OPEN', requirements,
    // Fields the backend has no column for, kept verbatim so the job reads back unchanged.
    technicalSpecifications: { kaarigarlink: {
      capability: job.capability, specification: job.specification, unit: job.unit, processes: job.processes,
      location: job.location, designFiles: job.designFiles, ...(job.budget === undefined ? {} : { budget: job.budget }),
    } },
  };
}

// ---------- Matching ----------

const matchSchema = z.object({
  workshopId: z.string(), score: z.number().nullable(), explanations: z.array(z.string()),
  eligibility: z.object({ eligible: z.boolean(), reasons: z.array(z.string()) }),
  // GET /jobs/:id/matches embeds only { id, status }; the job and workshop come from the row.
  invitation: invitationSchema.pick({ id: true, status: true }).nullable().optional(),
});
type MatchRow = z.infer<typeof matchSchema>;
/** GET /orders/mine returns a job summary only; the full job comes from GET /orders/:id. */
export const orderListSchema = orderSchema.omit({ job: true });
const invitationRowSchema = invitationSchema.extend({ matchScore: z.number(), matchReasons: z.array(z.string()) });

export function createLiveBuyer(): BuyerService {
  async function backendJob(id: string) {
    return (await api('/jobs/' + enc(id), z.object({ job: jobSchema }))).job;
  }
  async function listOrders(): Promise<BuyerOrderData[]> {
    // One request with full details (M11 view=full) instead of one request per order.
    const { orders } = await api('/orders/mine', z.object({ orders: z.array(orderSchema) }), { query: { view: 'full' } });
    return orders.map(order => buyerOrderView(order));
  }
  return {
    async listJobs() { return (await apiAll('/jobs', jobSchema)).map(job => jobView(job)); },
    async getJob(_buyerId, jobId) { return jobView(await backendJob(jobId)); },
    async getDashboard() {
      const [rawJobs, { orders }] = await Promise.all([
        apiAll('/jobs', jobSchema),
        api('/orders/mine', z.object({ orders: z.array(orderListSchema) })),
      ]);
      const jobs: Job[] = rawJobs.map(job => jobView(job));
      const open = rawJobs.filter(job => QUOTABLE_JOB.includes(job.status));
      const quoteLists = await Promise.all(open.map(job => api('/quotes/jobs/' + enc(job.id), z.object({ quotes: z.array(quoteSchema) }))));
      const activity: AuditEvent[] = [
        ...rawJobs.map(job => ({ id: job.id + ':posted', actorId: job.buyerId ?? '', entityId: job.id, entityType: 'Job', action: 'JOB_POSTED', occurredAt: job.createdAt ?? '' })),
        ...orders.map(order => ({ id: order.id + ':created', actorId: order.buyerId, entityId: order.id, entityType: 'Order', action: 'ORDER_CREATED', occurredAt: order.createdAt })),
      ].filter(event => event.occurredAt);
      return { jobs, orders: orders.map(order => orderView(order)), quotes: quoteLists.flatMap(list => list.quotes.map(quoteView)), activity };
    },
    async setJobStatus(_buyerId, jobId, status) {
      await api('/jobs/' + enc(jobId), z.unknown(), { method: 'PUT', body: { status } });
    },
    async createJob(_buyerId, input) {
      const { job } = await api('/jobs', z.object({ job: jobSchema }), { method: 'POST', body: createJobBody(input) });
      return jobView(job);
    },

    async getMatches(_buyerId, jobId) {
      const raw = await backendJob(jobId);
      const job = jobView(raw);
      const open = QUOTABLE_JOB.includes(raw.status);
      // Live matching runs only for OPEN/MATCHED jobs; afterwards the stored invitation snapshots are shown.
      const rows: MatchRow[] = open
        ? (await api('/jobs/' + enc(jobId) + '/matches', z.object({ results: z.array(matchSchema) }))).results
        : (await api('/jobs/' + enc(jobId) + '/invitations', z.object({ items: z.array(invitationRowSchema) }))).items.map(item => ({
            workshopId: item.workshopId, score: item.matchScore, explanations: item.matchReasons,
            eligibility: { eligible: true, reasons: [] }, invitation: item,
          }));
      const workshops = await fetchWorkshops(rows.map(row => row.workshopId));
      const results: WorkshopMatch[] = rows.map(row => {
        const invitation = row.invitation ? invitationView({ ...row.invitation, jobId, workshopId: row.workshopId }) : null;
        const reason = invitation ? 'An invitation is already recorded for this workshop.'
          : !open ? 'This job is no longer open for invitations.'
          : !row.eligibility.eligible ? (row.eligibility.reasons.join(' ') || 'This workshop is not eligible for this job.') : '';
        return {
          match: { jobId, workshopId: row.workshopId, score: row.score ?? 0, explanations: row.explanations, eligibility: row.eligibility },
          workshop: required(workshops.get(row.workshopId), 'workshop'), invitation, canInvite: !reason, invitationReason: reason,
        };
      });
      return { job, results, source: open ? 'live' as const : 'snapshot' as const };
    },
    async inviteWorkshop(_buyerId, jobId, workshopId) {
      const { invitation } = await api('/jobs/' + enc(jobId) + '/invitations', z.object({ invitation: invitationSchema }), { method: 'POST', body: { workshopId } });
      return invitationView(invitation);
    },
    async getQuotes(_buyerId, jobId) {
      const [raw, { quotes }] = await Promise.all([backendJob(jobId), api('/quotes/jobs/' + enc(jobId), z.object({ quotes: z.array(quoteSchema) }))]);
      const workshops = await fetchWorkshops(quotes.map(quote => quote.workshopId));
      const open = QUOTABLE_JOB.includes(raw.status);
      return {
        job: jobView(raw),
        awardBlocker: open
          ? 'Awarding a quotation creates the order and rejects the other submitted quotations. This cannot be undone.'
          : 'This job is no longer open for awarding.',
        quotations: quotes.map(quote => {
          const reason = !open ? 'This job is no longer open for awarding.' : quote.status !== 'SUBMITTED' ? 'Only submitted quotations can be awarded.' : '';
          return { quote: quoteView(quote), workshop: required(workshops.get(quote.workshopId), 'workshop'), canReviewAward: !reason, reviewReason: reason };
        }),
      };
    },
    async awardQuote(_buyerId, quoteId) {
      const { order } = await api('/orders/award/' + enc(quoteId), z.object({ order: z.object({ id: z.string() }) }), { method: 'POST' });
      return { orderId: order.id };
    },

    listOrders,
    async getOrder(_buyerId, orderId) { return buyerOrder(orderId); },
    async submitReview(_buyerId, orderId, input) {
      const parsed = reviewSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check your review.');
      const { rating } = await api('/orders/' + enc(orderId) + '/rating', z.object({ rating: z.object({ id: z.string(), score: z.number(), review: z.string().nullable().optional() }) }), {
        method: 'POST', body: { score: parsed.data.rating, review: parsed.data.comment },
      });
      return reviewView(orderId, rating);
    },
    async completeOrder(_buyerId, orderId) {
      await api('/orders/' + enc(orderId) + '/complete', z.unknown(), { method: 'POST' });
    },
    async cancelOrder(_buyerId, orderId, reason) {
      const parsed = cancelOrderSchema.safeParse({ reason });
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Give a cancellation reason.');
      await api('/orders/' + enc(orderId) + '/cancel', z.unknown(), { method: 'POST', body: parsed.data });
    },
    async approveMilestone(_buyerId, milestoneId) {
      await api('/milestones/' + enc(milestoneId) + '/approve', z.unknown(), { method: 'POST' });
    },
    async createPayment(_buyerId, orderId, input) {
      const parsed = paymentInputSchema.safeParse(input);
      if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check the payment amount.');
      await api('/orders/' + enc(orderId) + '/payments', z.unknown(), {
        method: 'POST', body: { amount: parsed.data.amount.toFixed(2), ...(parsed.data.description ? { description: parsed.data.description } : {}) },
      });
    },
    async simulatePayment(_buyerId, paymentId, outcome) {
      await api('/payments/' + enc(paymentId) + '/simulate', z.unknown(), { method: 'POST', body: { outcome } });
    },
  };
}
