import { z } from 'zod';
import type { Job, Quote } from '@/types';
import { ServiceError } from '../contracts';
import { todayInIndia } from '../jobs';
import {
  editQuoteSchema, invitationResponseSchema, quoteTermsSchema, sameTerms, withdrawQuoteSchema, type QuoteTerms,
} from '../workshopCommands';
import {
  capabilityInputSchema, capacityInputSchema, machineInputSchema, workshopProfileSchema, type WorkshopProfileRecord,
  milestoneInputSchema, type WorkshopInspection, type WorkshopInvitationData, type WorkshopJob, type WorkshopOrderData,
  type WorkshopQuotationData, type WorkshopService, type WorkshopWorkspace,
} from '../workshop';
import { api, apiAll, requireUser } from './http';
import {
  QUOTABLE_JOB, calendarDay, dayInIndia, daysBetween, inspectionView, invitationSchema, invitationView, jobSchema, jobView, liveChecklist,
  orderSchema, orderView, paymentView, quoteSchema, quoteView, workshopSchema, workshopView, type BackendJob, type BackendOrder, type BackendQuote,
} from './mappers';
import { fetchOrder } from './buyer';

const enc = encodeURIComponent;

const myInvitationSchema = invitationSchema.extend({
  job: jobSchema, buyer: z.object({ id: z.string(), name: z.string() }),
});
const myQuoteSchema = quoteSchema.extend({
  job: z.object({ id: z.string(), title: z.string(), status: z.string(), deadline: z.string() }),
});
type MyQuote = z.infer<typeof myQuoteSchema>;

function workshopJob(job: Job): WorkshopJob {
  const copy: Partial<Job> = { ...job };
  delete copy.designFiles;
  return copy as WorkshopJob;
}
function jobOpenReason(job: Pick<BackendJob, 'status' | 'deadline'>): string {
  if (['AWARDED', 'IN_PROGRESS', 'COMPLETED'].includes(job.status)) return 'This job has already been awarded.';
  if (!QUOTABLE_JOB.includes(job.status)) return 'This job is no longer open.';
  if (Date.parse(job.deadline) <= Date.now()) return 'The job deadline has expired.';
  return '';
}
function checked<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError('VALIDATION', result.error.issues[0]?.message ?? 'Check the command fields.');
  return result.data;
}
/** The backend stores whole days from the quote's creation date (at least 1). */
function estimatedDays(fromDay: string, delivery: string): number {
  const days = daysBetween(fromDay, delivery);
  if (days < 1) throw new ServiceError('VALIDATION', 'Estimated delivery must be at least one day after the quotation date (India time).');
  return days;
}
const termsOf = (quote: Quote): QuoteTerms => ({ amount: quote.amount, estimatedDelivery: quote.estimatedDelivery, notes: quote.notes });

async function myQuote(id: string): Promise<MyQuote> {
  const { quotes } = await api('/quotes/mine', z.object({ quotes: z.array(myQuoteSchema) }));
  const quote = quotes.find(item => item.id === id);
  if (!quote) throw new ServiceError('NOT_FOUND', 'This quotation is unavailable.');
  return quote;
}

async function orderData(id: string): Promise<WorkshopOrderData> {
  return orderDataFrom(await fetchOrder(id));
}
function orderDataFrom(order: BackendOrder): WorkshopOrderData {
  if (!order.job || !order.quote) throw new ServiceError('SERVER', 'The server did not return the job or quotation for this order.');
  const job = jobView(order.job, order.buyerId);
  const checklist = liveChecklist(job);
  const inspections: WorkshopInspection[] = (order.inspections ?? []).map(item => {
    const view = inspectionView(item, checklist);
    return {
      id: view.id, orderId: view.orderId, inspectorId: view.inspectorId, decision: view.decision, notes: view.notes,
      history: view.history ?? [],
      ...(view.updatedAt ? { updatedAt: view.updatedAt } : {}), ...(view.reworkDeadline ? { reworkDeadline: view.reworkDeadline } : {}),
    };
  });
  return {
    order: orderView(order, job.deadline), job: workshopJob(job), quote: quoteView(order.quote),
    buyer: order.buyer ?? { id: order.buyerId, name: 'Buyer ' + order.buyerId },
    inspections, payments: (order.payments ?? []).map(paymentView),
  };
}

/** GET /workshops/me with every editable field (exact enum values). */
const profileRecordSchema = z.object({
  id: z.string(), businessName: z.string(), description: z.string().nullable().optional(), address: z.string().nullable().optional(),
  city: z.string().nullable().optional(), latitude: z.number().nullable().optional(), longitude: z.number().nullable().optional(),
  certifications: z.array(z.string()).optional(), verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
  rating: z.number(), ratingCount: z.number(), totalCompletedJobs: z.number().optional(),
  machines: z.array(z.object({ id: z.string(), machineName: z.string(), machineType: z.string(), quantity: z.number(), operationalStatus: z.string() })).optional(),
  capabilities: z.array(z.object({ id: z.string(), manufacturingProcess: z.string(), supportedMaterials: z.array(z.string()), leadTimeDays: z.number() })).optional(),
  capacities: z.array(z.object({ id: z.string(), availableCapacity: z.number(), capacityUnit: z.string(), startDate: z.string(), endDate: z.string() })).optional(),
});
async function myProfile() {
  return (await api('/workshops/me', z.object({ workshop: profileRecordSchema }))).workshop;
}
function profileRecord(item: z.infer<typeof profileRecordSchema>): WorkshopProfileRecord {
  return {
    id: item.id, businessName: item.businessName, description: item.description ?? '', address: item.address ?? '', city: item.city ?? '',
    latitude: item.latitude ?? null, longitude: item.longitude ?? null, certifications: item.certifications ?? [],
    verificationStatus: item.verificationStatus, rating: item.rating, ratingCount: item.ratingCount, totalCompletedJobs: item.totalCompletedJobs ?? 0,
    machines: item.machines ?? [], capabilities: item.capabilities ?? [],
    capacities: (item.capacities ?? []).map(slot => ({ ...slot, startDate: calendarDay(slot.startDate), endDate: calendarDay(slot.endDate) })),
  };
}

export function createLiveWorkshop(): WorkshopService {
  async function getWorkspace(): Promise<WorkshopWorkspace> {
    const account = requireUser();
    let profile: z.infer<typeof workshopSchema>;
    try { profile = (await api('/workshops/me', z.object({ workshop: workshopSchema }))).workshop; }
    catch (error) {
      if (error instanceof ServiceError && error.code === 'NOT_FOUND') {
        return { account, profile: null, invitations: [], quotations: [], orders: [], summary: { invitations: 0, submittedQuotes: 0, activeOrders: 0, pendingInspections: 0, openRework: 0, closedOrders: 0 } };
      }
      throw error;
    }
    const [invites, { quotes }, { orders: orderRows }] = await Promise.all([
      apiAll('/workshops/invitations', myInvitationSchema),
      api('/quotes/mine', z.object({ quotes: z.array(myQuoteSchema) })),
      // One request with full order details (M11 view=full) instead of one per order.
      api('/orders/mine', z.object({ orders: z.array(orderSchema) }), { query: { view: 'full' } }),
    ]);
    const rawJobs = new Map<string, BackendJob>(invites.map((item): [string, BackendJob] => [item.job.id, { ...item.job, buyerId: item.buyer.id }]));
    const buyers = new Map(invites.map((item): [string, { id: string; name: string }] => [item.job.id, item.buyer]));
    const quoteByJob = new Map<string, BackendQuote>(quotes.map((item): [string, BackendQuote] => [item.jobId, item]));

    const invitations: WorkshopInvitationData[] = invites.map(item => {
      const block = jobOpenReason(item.job);
      const hasQuote = quoteByJob.has(item.jobId);
      const responseReason = item.status !== 'INVITED' ? 'Only pending invitations can receive a response.' : block;
      const quoteReason = block || (item.status !== 'ACCEPTED' ? 'Accept this invitation before submitting a quotation.' : '') || (hasQuote ? 'A quotation already exists for this job and workshop.' : '');
      return {
        invitation: invitationView(item), job: workshopJob(jobView(item.job, item.buyer.id)), buyer: item.buyer,
        quotes: quotes.filter(quote => quote.jobId === item.jobId).map(quoteView),
        actions: { respond: !responseReason, submitQuote: !quoteReason, responseReason, quoteReason },
      };
    });
    const quotations: WorkshopQuotationData[] = quotes.map(item => {
      const raw = rawJobs.get(item.jobId);
      const job: WorkshopJob = raw ? workshopJob(jobView(raw)) : {
        id: item.job.id, buyerId: '', title: item.job.title, description: '', capability: '', material: '', specification: '',
        quantity: 0, unit: '', processes: [], deadline: calendarDay(item.job.deadline), location: { city: '', state: '' }, status: 'POSTED',
      };
      const invitation = invites.find(row => row.jobId === item.jobId);
      const reason = (item.status !== 'SUBMITTED' ? 'Only submitted quotations can be edited or withdrawn.' : '') ||
        jobOpenReason(item.job) || (invitation?.status !== 'ACCEPTED' ? 'An accepted invitation is required.' : '');
      return {
        quote: quoteView(item), job, buyer: buyers.get(item.jobId) ?? { id: job.buyerId, name: 'Buyer' },
        actions: { edit: !reason, withdraw: !reason, reason },
      };
    });
    const orders = orderRows.map(orderDataFrom);
    return {
      account, profile: workshopView(profile), invitations, quotations, orders,
      summary: {
        invitations: invitations.length, submittedQuotes: quotations.filter(row => row.quote.status === 'SUBMITTED').length,
        activeOrders: orders.filter(row => !['CLOSED', 'CANCELLED'].includes(row.order.status)).length,
        pendingInspections: orders.filter(row => row.order.backendStatus === 'IN_PROGRESS' && !row.order.qcStatus).length,
        openRework: orders.filter(row => row.order.backendStatus === 'IN_PROGRESS' && (row.order.qcStatus === 'REWORK' || row.order.qcStatus === 'FAILED')).length,
        closedOrders: orders.filter(row => row.order.status === 'CLOSED').length,
      },
    };
  }

  return {
    getWorkspace,
    async getInvitation(_actorId, invitationId) {
      const row = (await getWorkspace()).invitations.find(item => item.invitation.id === invitationId);
      if (!row) throw new ServiceError('NOT_FOUND', 'This invitation is unavailable.');
      return row;
    },
    async getOrder(_actorId, orderId) { return orderData(orderId); },

    async respondToInvitation(_actorId, invitationId, input) {
      const command = checked(invitationResponseSchema, input);
      const { invitation } = await api('/invitations/' + enc(invitationId) + '/respond', z.object({ invitation: invitationSchema }), { method: 'POST', body: command });
      return invitationView(invitation);
    },
    async submitQuote(_actorId, invitationId, input) {
      const terms = checked(quoteTermsSchema, input);
      const { quote } = await api('/quotes/invitations/' + enc(invitationId), z.object({ quote: quoteSchema }), {
        method: 'POST',
        body: { totalPrice: terms.amount.toFixed(2), estimatedDays: estimatedDays(todayInIndia(), terms.estimatedDelivery), ...(terms.notes ? { notes: terms.notes } : {}) },
      });
      return quoteView(quote);
    },
    async editQuote(_actorId, quoteId, input) {
      const command = checked(editQuoteSchema, input);
      const current = await myQuote(quoteId);
      const terms = termsOf(quoteView(current));
      if (sameTerms(terms, command.changes)) return quoteView(current);
      // Optimistic check against the latest server terms (the backend has no quote version field).
      if (!sameTerms(terms, command.expected)) throw new ServiceError('CONFLICT', 'This quotation changed. Reload its latest terms before editing.');
      const { quote } = await api('/quotes/' + enc(quoteId), z.object({ quote: quoteSchema }), {
        method: 'PATCH',
        body: {
          totalPrice: command.changes.amount.toFixed(2),
          estimatedDays: estimatedDays(dayInIndia(current.createdAt), command.changes.estimatedDelivery),
          notes: command.changes.notes ? command.changes.notes : null,
          // M11: the server rejects the edit (409) if the quote changed since this version was read.
          ...(command.version ? { expectedUpdatedAt: command.version } : {}),
        },
      });
      return quoteView(quote);
    },
    async withdrawQuote(_actorId, quoteId, input) {
      const command = checked(withdrawQuoteSchema, input);
      const current = await myQuote(quoteId);
      if (!sameTerms(termsOf(quoteView(current)), command.expected)) throw new ServiceError('CONFLICT', 'This quotation changed. Reload its latest terms before withdrawing.');
      const { quote } = await api('/quotes/' + enc(quoteId) + '/withdraw', z.object({ quote: quoteSchema }), {
        method: 'POST', ...(command.version ? { body: { expectedUpdatedAt: command.version } } : {}),
      });
      return quoteView(quote);
    },

    async startOrder(_actorId, orderId) {
      await api('/orders/' + enc(orderId) + '/start', z.unknown(), { method: 'POST' });
    },
    async createMilestone(_actorId, orderId, input) {
      const milestone = checked(milestoneInputSchema, input);
      await api('/orders/' + enc(orderId) + '/milestones', z.unknown(), {
        method: 'POST',
        body: {
          title: milestone.title, sequence: milestone.sequence,
          ...(milestone.dueOn ? { dueDate: milestone.dueOn } : {}), ...(milestone.description ? { description: milestone.description } : {}),
        },
      });
    },
    async startMilestone(_actorId, milestoneId) {
      await api('/milestones/' + enc(milestoneId) + '/start', z.unknown(), { method: 'POST' });
    },
    async completeMilestone(_actorId, milestoneId) {
      await api('/milestones/' + enc(milestoneId) + '/complete', z.unknown(), { method: 'POST' });
    },
    async refundPayment(_actorId, paymentId) {
      await api('/payments/' + enc(paymentId) + '/refund', z.unknown(), { method: 'POST' });
    },

    // ---------- M11: profile, machinery, capabilities, capacity ----------
    async getProfileRecord() { return profileRecord(await myProfile()); },
    async updateProfile(_actorId, input) {
      const profile = checked(workshopProfileSchema, input);
      const { id } = await myProfile();
      await api('/workshops/' + enc(id), z.unknown(), {
        method: 'PUT',
        body: {
          businessName: profile.businessName, description: profile.description || null, address: profile.address || null,
          city: profile.city || null, latitude: profile.latitude, longitude: profile.longitude, certifications: profile.certifications,
        },
      });
    },
    async saveMachine(_actorId, input, machineId) {
      const machine = checked(machineInputSchema, input);
      const { id } = await myProfile();
      await api('/workshops/' + enc(id) + '/machines' + (machineId ? '/' + enc(machineId) : ''), z.unknown(), { method: machineId ? 'PUT' : 'POST', body: machine });
    },
    async deleteMachine(_actorId, machineId) {
      const { id } = await myProfile();
      await api('/workshops/' + enc(id) + '/machines/' + enc(machineId), z.unknown(), { method: 'DELETE' });
    },
    async saveCapability(_actorId, input, capabilityId) {
      const capability = checked(capabilityInputSchema, input);
      const { id } = await myProfile();
      // The process identifies a capability; an update changes only materials and lead time.
      const body = capabilityId ? { supportedMaterials: capability.supportedMaterials, leadTimeDays: capability.leadTimeDays } : capability;
      await api('/workshops/' + enc(id) + '/capabilities' + (capabilityId ? '/' + enc(capabilityId) : ''), z.unknown(), { method: capabilityId ? 'PUT' : 'POST', body });
    },
    async deleteCapability(_actorId, capabilityId) {
      const { id } = await myProfile();
      await api('/workshops/' + enc(id) + '/capabilities/' + enc(capabilityId), z.unknown(), { method: 'DELETE' });
    },
    async saveCapacity(_actorId, input, capacityId) {
      const capacity = checked(capacityInputSchema, input);
      const { id } = await myProfile();
      await api('/workshops/' + enc(id) + '/capacity' + (capacityId ? '/' + enc(capacityId) : ''), z.unknown(), { method: capacityId ? 'PUT' : 'POST', body: capacity });
    },
    async deleteCapacity(_actorId, capacityId) {
      const { id } = await myProfile();
      await api('/workshops/' + enc(id) + '/capacity/' + enc(capacityId), z.unknown(), { method: 'DELETE' });
    },
  };
}
