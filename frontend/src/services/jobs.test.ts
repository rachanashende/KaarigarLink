import { beforeEach, expect, it } from 'vitest';
import { createMockStore } from './mock/store';
import { createMockService } from './adapters/mock';
import type { CreateJobInput } from './jobs';
import { createJobSchema } from './jobs';

const valid: CreateJobInput = {
  title: 'CNC turned spacer batch', description: 'Turn spacers for a small conveyor assembly.',
  capability: 'CNC turning', material: 'Mild steel', specification: '', quantity: 25, unit: 'pieces',
  processes: ['CNC lathe'], deadline: '2099-01-01', location: { city: 'Pune', state: 'Maharashtra' },
  designFiles: [],
};
let store = createMockStore();
beforeEach(() => { store = createMockStore(); });
it('creates an owned POSTED job and audit event atomically, shared with every reader', async () => {
  const service = createMockService(store);
  const job = await service.buyer.createJob('buyer-1', valid);
  expect(job).toMatchObject({ ...valid, buyerId: 'buyer-1', status: 'POSTED' });
  expect(job.createdAt).toBeDefined();
  expect(await createMockService(store).buyer.getJob('buyer-1', job.id)).toEqual(job);
  const data = await service.buyer.getDashboard('buyer-1');
  expect(data.activity.find(event => event.entityId === job.id)).toMatchObject({ action: 'JOB_POSTED', actorId: 'buyer-1' });
  job.title = 'External mutation';
  expect((await service.buyer.getJob('buyer-1', job.id)).title).toBe(valid.title);
});
it.each([
  { title: '  ' }, { capability: '' }, { description: '' }, { material: '' }, { unit: '' },
  { quantity: 0 }, { quantity: -1 }, { quantity: Infinity }, { budget: -10 }, { budget: 0 },
  { budget: NaN }, { budget: 10.001 }, { deadline: '2020-01-01' }, { deadline: '2099-02-30' },
  { processes: [] }, { location: { city: '', state: '' } },
  { designFiles: [{ id: 'f', name: 'drawing.pdf', mediaType: 'application/pdf', sizeBytes: 11 * 1024 * 1024 }] },
])('rejects invalid job input without a partial job/audit event: %j', async invalid => {
  const before = store.snapshot();
  await expect(createMockService(store).buyer.createJob('buyer-1', { ...valid, ...invalid })).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(store.snapshot()).toEqual(before);
});
it('rejects caller-supplied ownership/status fields and permits optional fields to be omitted', () => {
  expect(createJobSchema.safeParse({ ...valid, buyerId: 'admin-1', status: 'AWARDED' }).success).toBe(false);
  expect(createJobSchema.safeParse(valid).success).toBe(true);
});
it('enforces buyer roles and hides jobs owned by another buyer', async () => {
  store.commit(state => {
    state.users.push({ id: 'buyer-2', role: 'buyer', name: 'Other Buyer', email: 'other@kaarigarlink.example' });
    state.jobs.push({ ...state.jobs[0]!, id: 'private-job', buyerId: 'buyer-2', title: 'Private requirement' });
    state.auditEvents.push({ id: 'private-event', actorId: 'buyer-2', entityType: 'Job', entityId: 'private-job', action: 'JOB_POSTED', occurredAt: new Date().toISOString() });
  });
  const service = createMockService(store);
  expect((await service.buyer.listJobs('buyer-1')).some(job => job.id === 'private-job')).toBe(false);
  await expect(service.buyer.getJob('buyer-1', 'private-job')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(service.buyer.getJob('buyer-1', 'missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect((await service.buyer.getDashboard('buyer-1')).activity.some(event => event.id === 'private-event')).toBe(false);
  await expect(service.buyer.createJob('admin-1', valid)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(service.buyer.listJobs('workshop-user-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(service.buyer.getDashboard('missing')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
