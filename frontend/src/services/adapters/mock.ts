import { createMockWorkshop } from './mockWorkshop';
import { createMockAdmin } from './mockAdmin';
import { createMockInspections } from './mockInspections';
import { createMockOrders } from './mockOrders';
import { ownedJob, requireBuyer } from './mockBuyerAccess';
import { createMockMarketplace } from './mockMarketplace';
import type { Job } from '@/types';
import { ServiceError, type DataService } from '../contracts';
import { createJobSchema } from '../jobs';
import { createMockStore, type MockStore } from '../mock/store';

export function createMockService(store: MockStore = createMockStore()): DataService {
  return {
    async list(collection) { return store.snapshot()[collection]; },
    demo: { get description() { return store.persistenceDescription; }, get warning() { return store.warning; }, async reset() { store.reset(); } },
    inspector: createMockInspections(store),
    admin: createMockAdmin(store),
    workshop: createMockWorkshop(store),
    buyer: {
      ...createMockMarketplace(store),
      ...createMockOrders(store),
      async listJobs(buyerId) {
        const state = store.snapshot();
        requireBuyer(state, buyerId);
        return state.jobs.filter(job => job.buyerId === buyerId);
      },
      async getJob(buyerId, jobId) {
        const state = store.snapshot();
        return ownedJob(state, buyerId, jobId);
      },
      async getDashboard(buyerId) {
        const state = store.snapshot();
        requireBuyer(state, buyerId);
        const jobs = state.jobs.filter(job => job.buyerId === buyerId);
        const jobIds = new Set(jobs.map(job => job.id));
        const orders = state.orders.filter(order => order.buyerId === buyerId && jobIds.has(order.jobId));
        const orderIds = new Set(orders.map(order => order.id));
        return {
          jobs, orders, quotes: state.quotes.filter(quote => jobIds.has(quote.jobId)),
          activity: state.auditEvents.filter(event => (event.entityType === 'Job' && jobIds.has(event.entityId)) || (event.entityType === 'Order' && orderIds.has(event.entityId))),
        };
      },
      async createJob(buyerId, input) {
        const parsed = createJobSchema.safeParse(input);
        if (!parsed.success) throw new ServiceError('VALIDATION', parsed.error.issues[0]?.message ?? 'Check your job details.');
        const { budget, ...details } = parsed.data;
        const id = 'job-' + crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const job: Job = { ...details, ...(budget === undefined ? {} : { budget }), id, buyerId, createdAt, status: 'POSTED' };
        store.commit(state => {
          requireBuyer(state, buyerId);
          state.jobs.push(job);
          state.auditEvents.push({ id: 'event-' + crypto.randomUUID(), actorId: buyerId, entityId: id, entityType: 'Job', action: 'JOB_POSTED', occurredAt: createdAt });
        });
        return structuredClone(job);
      },
    },
  };
}
