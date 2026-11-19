import { beforeEach, expect, it } from 'vitest';
import { createMockStore } from './mock/store';
import { fixtures } from './mock/fixtures';
import { createMockService } from './adapters/mock';

beforeEach(() => sessionStorage.clear());
it('returns platform-wide linked records without changing state or exposing mutation commands', async () => {
  const store = createMockStore(); const before = store.snapshot(); const service = createMockService(store);
  const data = await service.admin.getOverview('admin-1');
  expect(data.users).toHaveLength(7); expect(data.workshops).toHaveLength(4); expect(data.jobs).toHaveLength(10); expect(data.orders).toHaveLength(6);
  expect(data.inspections).toHaveLength(5); expect(data.quotes).toHaveLength(10);
  expect(Object.keys(service.admin)).toEqual(['getOverview']);
  for (const order of data.orders) {
    expect(data.jobs.find(job => job.id === order.jobId)?.buyerId).toBe(order.buyerId);
    expect(data.quotes.find(quote => quote.id === order.quoteId)?.workshopId).toBe(order.workshopId);
  }
  expect(store.snapshot()).toEqual(before);
  data.users[0]!.name = 'Mutated response'; data.orders[0]!.milestones.length = 0;
  const again = await service.admin.getOverview('admin-1');
  expect(again.users[0]?.name).not.toBe('Mutated response'); expect(again.orders[0]?.milestones).toHaveLength(4);
});
it.each(['buyer-1', 'workshop-user-1', 'inspector-1'])('rejects non-admin %s without changes', async actor => {
  const store = createMockStore(); const before = store.snapshot();
  await expect(createMockService(store).admin.getOverview(actor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(store.snapshot()).toEqual(before);
});
it('rejects missing identity', async () => {
  await expect(createMockService().admin.getOverview('missing')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
it('minimizes nested responses and omits credentials, unknown secrets, drafts and attachments', async () => {
  const store = createMockStore();
  store.commit(state => {
    Object.assign(state.users[0]!, { password: 'secret-password', accessToken: 'secret-token', hash: 'secret-hash' });
    Object.assign(state.workshops[0]!, { secret: 'secret-workshop' });
    state.workshops[0]!.location.address = 'private-street-address';
    state.workshops[0]!.coordinates = { latitude: 18.5, longitude: 73.8 };
    Object.assign(state.workshops[0]!.machines[0]!, { token: 'secret-machine' });
    Object.assign(state.jobs[0]!, { token: 'secret-job' });
    state.jobs[0]!.designFiles = [{ id: 'f', name: 'private-drawing.pdf', mediaType: 'application/pdf', sizeBytes: 10 }];
    state.inspections[0]!.draft = { summary: 'private-draft-findings', items: [] };
    Object.assign(state.inspections[0]!, { token: 'secret-inspection' });
    Object.assign(state.orders[0]!.milestones[0]!, { token: 'secret-milestone' });
    Object.assign(state.quotes[0]!, { token: 'secret-quote' });
    Object.assign(state.inspections.find(item => item.history?.length)!.history![0]!, { token: 'secret-history' });
  });
  const data = await createMockService(store).admin.getOverview('admin-1');
  const raw = JSON.stringify(data);
  for (const value of ['secret-', 'private-', 'synthetic-dimensional-report.pdf', 'DemoPass123!']) expect(raw).not.toContain(value);
  expect(data.users.every(user => Object.keys(user).sort().join(',') === 'email,id,name,role')).toBe(true);
  expect(data.workshops[0]).not.toHaveProperty('coordinates');
  expect(data.inspections[0]).not.toHaveProperty('draft');
});
it('surfaces broken joins only to an authorized admin', async () => {
  const store = createMockStore(); store.commit(state => { state.workshops = []; });
  const service = createMockService(store);
  await expect(service.admin.getOverview('admin-1')).rejects.toMatchObject({ code: 'SERVER' });
  await expect(service.admin.getOverview('buyer-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('reads new buyer and inspector changes consistently without changing QC policy', async () => {
  const service = createMockService(); const data = await service.inspector.getInspection('inspector-1', 'inspection-qc');
  const findings = { summary: 'Admin consistency test with human inspection findings.', items: data.inspection.checklist!.map(check => ({ id: check.id, result: 'PASS' as const, notes: '', evidence: check.evidenceRequired ? [{ id: 'f', name: 'demo.pdf', mediaType: 'application/pdf', sizeBytes: 10 }] : [] })) };
  await service.inspector.saveDraft('inspector-1', 'inspection-qc', findings);
  expect((await service.admin.getOverview('admin-1')).inspections.find(item => item.id === 'inspection-qc')).not.toHaveProperty('draft');
  await service.inspector.submitDecision('inspector-1', 'inspection-qc', { decision: 'ACCEPTED', findings });
  const admin = await service.admin.getOverview('admin-1'); const buyer = await service.buyer.getOrder('buyer-1', 'order-qc'); const inspector = await service.inspector.getInspection('inspector-1', 'inspection-qc');
  expect(admin.orders.find(order => order.id === 'order-qc')?.qcStatus).toBe(buyer.order.qcStatus);
  expect(admin.inspections.find(item => item.id === 'inspection-qc')?.history).toHaveLength(inspector.inspection.history!.length);
  expect(admin.orders.find(order => order.id === 'order-qc')?.status).toBe('QC_PENDING');
  expect(admin.inspections.find(item => item.id === 'inspection-qc')?.decision).toBe('ACCEPTED');
});
it('restores shared persistent state and reset without an admin-specific persistence system', async () => {
  let service = createMockService(createMockStore(fixtures, sessionStorage));
  await service.buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-3');
  const beforeRead = sessionStorage.getItem('kaarigarlink.demo-data.v1');
  await service.admin.getOverview('admin-1');
  expect(sessionStorage.getItem('kaarigarlink.demo-data.v1')).toBe(beforeRead);
  service = createMockService(createMockStore(fixtures, sessionStorage));
  expect((await service.admin.getOverview('admin-1')).invitations.some(item => item.jobId === 'job-1' && item.workshopId === 'workshop-3')).toBe(true);
  await service.demo!.reset();
  expect((await service.admin.getOverview('admin-1')).invitations).toEqual(fixtures.invitations);
});
it('handles an empty platform for a valid admin without fabricating records', async () => {
  const seed = structuredClone(fixtures);
  for (const key of Object.keys(seed) as (keyof typeof seed)[]) seed[key] = [];
  seed.users = [fixtures.users.find(user => user.id === 'admin-1')!];
  const data = await createMockService(createMockStore(seed)).admin.getOverview('admin-1');
  expect(data.jobs).toEqual([]); expect(data.orders).toEqual([]); expect(data.users).toHaveLength(1);
});
it('projects optional dates and ratings without inventing values', async () => {
  const store = createMockStore();
  store.commit(state => {
    delete state.jobs[0]!.createdAt; delete state.orders[0]!.createdAt;
    delete state.workshops[0]!.rating; delete state.inspections[0]!.dueOn;
  });
  const data = await createMockService(store).admin.getOverview('admin-1');
  expect(data.jobs[0]).not.toHaveProperty('createdAt'); expect(data.orders[0]).not.toHaveProperty('createdAt');
  expect(data.workshops[0]).not.toHaveProperty('rating'); expect(data.inspections[0]).not.toHaveProperty('dueOn');
});
