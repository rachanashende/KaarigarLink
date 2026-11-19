import { beforeEach, expect, it, vi } from 'vitest';
import { fixtures } from './mock/fixtures';
import { createMockStore } from './mock/store';
import { createMockService } from './adapters/mock';
import { DEMO_DATA_KEY } from './mock/persistence';

beforeEach(() => sessionStorage.clear());
const input = { rating: 5, comment: 'Accurate machining and clear delivery updates.' };
it('joins owned orders with valid job, quote, workshop and consistent milestone collections', async () => {
  const data = await createMockService().buyer.listOrders('buyer-1');
  expect(data).toHaveLength(6);
  expect(new Set(fixtures.users.map(user => user.id)).size).toBe(fixtures.users.length);
  for (const item of data) {
    expect(item.job.buyerId).toBe('buyer-1');
    expect(item.quote.jobId).toBe(item.job.id);
    expect(item.quote.workshopId).toBe(item.workshop.id);
    expect(item.quote.status).toBe('AWARDED');
    expect(item.order.milestones).toEqual(fixtures.milestones.filter(milestone => milestone.orderId === item.order.id));
  }
  expect((await createMockService().buyer.getOrder('buyer-1', 'order-rework')).inspections[0]).toMatchObject({ decision: 'REWORK', reworkDeadline: '2026-11-26' });
});
it('hides private and missing orders and rejects non-buyers for reads and reviews', async () => {
  const store = createMockStore();
  store.commit(state => {
    state.users.push({ id: 'buyer-2', role: 'buyer', name: 'Other Buyer', email: 'other@kaarigarlink.example' });
    state.jobs.find(job => job.id === 'job-order-closed')!.buyerId = 'buyer-2';
    state.orders.find(order => order.id === 'order-closed')!.buyerId = 'buyer-2';
  });
  const buyer = createMockService(store).buyer;
  expect(await buyer.listOrders('buyer-1')).toHaveLength(5);
  for (const id of ['order-closed', 'missing']) {
    await expect(buyer.getOrder('buyer-1', id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(buyer.submitReview('buyer-1', id, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  }
  await expect(buyer.listOrders('admin-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(buyer.getOrder('missing-user', 'order-closed')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  await expect(buyer.submitReview('workshop-user-1', 'order-production', input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it.each([{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: NaN }, { comment: ' ' }, { comment: 'x'.repeat(2001) }, { buyerId: 'buyer-2' }])('validates review input atomically: %j', async invalid => {
  const store = createMockStore(); const before = store.snapshot();
  await expect(createMockService(store).buyer.submitReview('buyer-1', 'order-closed', { ...input, ...invalid })).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(store.snapshot()).toEqual(before);
});
it.each(['order-production', 'order-qc', 'order-rework', 'order-cancelled', 'order-paid'])('does not treat %s as eligible', async id => {
  const buyer = createMockService().buyer;
  expect((await buyer.getOrder('buyer-1', id)).canReview).toBe(false);
  await expect(buyer.submitReview('buyer-1', id, input)).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('records exactly one review and audit event under concurrent submissions without lifecycle changes', async () => {
  const store = createMockStore(); const buyer = createMockService(store).buyer; const before = store.snapshot();
  const results = await Promise.allSettled([buyer.submitReview('buyer-1', 'order-closed', input), buyer.submitReview('buyer-1', 'order-closed', input)]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  const after = store.snapshot();
  expect(after.reviews).toHaveLength(1);
  expect(after.auditEvents).toHaveLength(before.auditEvents.length + 1);
  expect(after.orders).toEqual(before.orders); expect(after.jobs).toEqual(before.jobs); expect(after.quotes).toEqual(before.quotes);
  expect(after.inspections).toEqual(before.inspections); expect(after.payments).toEqual(before.payments);
  expect((await buyer.getOrder('buyer-1', 'order-closed')).canReview).toBe(false);
});
it('reports missing related records instead of manufacturing tracking details', async () => {
  const store = createMockStore(); store.commit(state => { state.quotes = []; });
  await expect(createMockService(store).buyer.getOrder('buyer-1', 'order-production')).rejects.toMatchObject({ code: 'SERVER' });
});
it('restores reviews, invitations and posted jobs across stores; never persists identity or attachments; reset restores seed', async () => {
  const store = createMockStore(fixtures, sessionStorage); const service = createMockService(store);
  await service.buyer.submitReview('buyer-1', 'order-closed', input);
  await service.buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-3');
  const job = await service.buyer.createJob('buyer-1', { title: 'Persisted sample', description: 'Synthetic job', capability: 'Milling', material: 'Steel', specification: '', quantity: 10, unit: 'pieces', processes: ['Milling'], deadline: '2099-01-01', location: { city: 'Pune', state: 'Maharashtra' }, designFiles: [{ id: 'f', name: 'private-drawing.pdf', mediaType: 'application/pdf', sizeBytes: 12 }] });
  const raw = sessionStorage.getItem(DEMO_DATA_KEY)!;
  expect(raw).not.toContain('private-drawing'); expect(raw).not.toContain('DemoPass'); expect(raw).not.toContain('@kaarigarlink.example');
  expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['auditEvents', 'inspectionUpdates', 'invitations', 'jobs', 'reviews', 'version']);
  const restored = createMockService(createMockStore(fixtures, sessionStorage));
  expect((await restored.buyer.getOrder('buyer-1', 'order-closed')).review?.rating).toBe(5);
  expect((await restored.buyer.getJob('buyer-1', job.id)).designFiles).toEqual([]);
  expect((await restored.buyer.getMatches('buyer-1', 'job-1')).results.find(item => item.workshop.id === 'workshop-3')?.invitation?.status).toBe('PENDING');
  await restored.demo!.reset();
  expect(sessionStorage.getItem(DEMO_DATA_KEY)).toBeNull();
  expect(await restored.list('jobs')).toEqual(fixtures.jobs);
  expect(await createMockService(createMockStore(fixtures, sessionStorage)).list('reviews')).toEqual([]);
});
it.each(['invalid json', JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, jobs: [] })])('surfaces corrupt persistence and blocks mutations until explicit reset', async raw => {
  sessionStorage.setItem(DEMO_DATA_KEY, raw);
  const store = createMockStore(fixtures, sessionStorage); const service = createMockService(store);
  expect(service.demo!.warning).toMatch(/could not be restored/);
  expect(await service.list('jobs')).toEqual(fixtures.jobs);
  await expect(service.buyer.submitReview('buyer-1', 'order-closed', input)).rejects.toMatchObject({ code: 'SERVER' });
  await service.demo!.reset();
  await expect(service.buyer.submitReview('buyer-1', 'order-closed', input)).resolves.toMatchObject({ rating: 5 });
});
it('rolls back failed persistence writes and surfaces failed reset', async () => {
  const store = createMockStore(fixtures, sessionStorage); const service = createMockService(store);
  const before = store.snapshot();
  vi.spyOn(Object.getPrototypeOf(sessionStorage) as Storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await expect(service.buyer.submitReview('buyer-1', 'order-closed', input)).rejects.toMatchObject({ code: 'SERVER' });
  expect(store.snapshot()).toEqual(before);
  vi.spyOn(Object.getPrototypeOf(sessionStorage) as Storage, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
  await expect(service.demo!.reset()).rejects.toMatchObject({ code: 'SERVER' });
  expect(store.snapshot()).toEqual(before);
});
