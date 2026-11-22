import { beforeEach, expect, it } from 'vitest';
import { createMockService } from './adapters/mock';
import { createMockStore } from './mock/store';
import { fixtures } from './mock/fixtures';
import { DEMO_DATA_KEY } from './mock/persistence';
import type { InspectionFindings } from '@/types';

beforeEach(() => sessionStorage.clear());
function setup() { const store = createMockStore(); return { store, service: createMockService(store) }; }
it.each([1, 2, 3, 4])('scopes every workspace collection to canonical owner %s', async number => {
  const { service } = setup();
  const data = await service.workshop.getWorkspace('workshop-user-' + number);
  expect(data.profile?.id).toBe('workshop-' + number);
  expect(data.profile?.ownerId).toBe(data.account.id);
  expect(data.invitations.map(row => row.invitation)).toEqual(fixtures.invitations.filter(row => row.workshopId === data.profile!.id));
  expect(data.quotations.map(row => row.quote)).toEqual(fixtures.quotes.filter(row => row.workshopId === data.profile!.id));
  expect(data.orders.map(row => row.order)).toEqual(fixtures.orders.filter(row => row.workshopId === data.profile!.id));
  for (const row of data.invitations) {
    expect(row.job.id).toBe(row.invitation.jobId); expect(row.buyer.id).toBe(row.job.buyerId);
    expect(row.quotes.every(quote => quote.jobId === row.job.id && quote.workshopId === data.profile!.id)).toBe(true);
  }
  for (const row of data.orders) {
    expect(row.job.buyerId).toBe(row.order.buyerId);
    expect(row.quote.id).toBe(row.order.quoteId); expect(row.quote.workshopId).toBe(data.profile!.id);
    expect(row.inspections.every(inspection => inspection.orderId === row.order.id)).toBe(true);
    expect(row.payments.every(payment => payment.orderId === row.order.id)).toBe(true);
  }
});
it('uses owner IDs despite identical names, email labels and changed array order', async () => {
  const { store, service } = setup();
  store.commit(state => {
    state.workshops.reverse(); state.users.reverse();
    for (const user of state.users.filter(item => item.role === 'workshop')) { user.name = 'Same name'; user.email = 'same@example.test'; }
    for (const profile of state.workshops) profile.name = 'Same workshop';
  });
  expect((await service.workshop.getWorkspace('workshop-user-2')).profile?.id).toBe('workshop-2');
  expect((await service.workshop.getWorkspace('workshop-user-1')).orders).toHaveLength(6);
});
it.each(['buyer-1', 'admin-1', 'inspector-1', 'unknown'])('guards all workshop selectors against %s', async actor => {
  const { service } = setup(); const code = actor === 'unknown' ? 'UNAUTHORIZED' : 'FORBIDDEN';
  await expect(service.workshop.getWorkspace(actor)).rejects.toMatchObject({ code });
  await expect(service.workshop.getInvitation(actor, 'seed-invitation-1')).rejects.toMatchObject({ code });
  await expect(service.workshop.getOrder(actor, 'order-production')).rejects.toMatchObject({ code });
});
it('does not reveal foreign invitation or order IDs through direct detail selectors', async () => {
  const { service } = setup();
  for (const id of ['seed-invitation-1', 'missing']) await expect(service.workshop.getInvitation('workshop-user-2', id)).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'This invitation is unavailable.' });
  for (const id of ['order-production', 'missing']) await expect(service.workshop.getOrder('workshop-user-2', id)).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'This order is unavailable.' });
  expect((await service.workshop.getInvitation('workshop-user-1', 'seed-invitation-1')).job.id).toBe('job-1');
});
it('reports a missing profile without falling back to another workshop', async () => {
  const { store, service } = setup();
  store.commit(state => state.users.push({ id: 'unmapped', role: 'workshop', name: 'New workshop account', email: 'new@example.test' }));
  const data = await service.workshop.getWorkspace('unmapped');
  expect(data.account.id).toBe('unmapped'); expect(data.profile).toBeNull();
  expect(data.invitations).toEqual([]); expect(data.quotations).toEqual([]); expect(data.orders).toEqual([]);
  await expect(service.workshop.getOrder('unmapped', 'order-production')).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('rejects ambiguous owner or profile ID mappings', async () => {
  const { store, service } = setup();
  store.commit(state => state.workshops.push({ ...structuredClone(state.workshops[0]!), id: 'extra-profile' }));
  await expect(service.workshop.getWorkspace('workshop-user-1')).rejects.toMatchObject({ code: 'CONFLICT' });
  store.reset();
  store.commit(state => { state.workshops[1]!.id = 'workshop-1'; });
  await expect(service.workshop.getWorkspace('workshop-user-1')).rejects.toMatchObject({ code: 'SERVER' });
});
it.each(['invitation-job', 'quote-job', 'order-quote', 'order-buyer', 'milestone-order', 'inspection-inspector'])('rejects broken %s references without returning mixed data', async problem => {
  const { store, service } = setup();
  store.commit(state => {
    if (problem === 'invitation-job') state.invitations[0]!.jobId = 'missing';
    if (problem === 'quote-job') state.quotes[0]!.jobId = 'missing';
    if (problem === 'order-quote') state.orders[0]!.quoteId = 'quote-2';
    if (problem === 'order-buyer') state.orders[0]!.buyerId = 'other-buyer';
    if (problem === 'milestone-order') state.orders[0]!.milestones[0]!.orderId = 'foreign';
    if (problem === 'inspection-inspector') state.inspections[0]!.inspectorId = 'buyer-1';
  });
  await expect(service.workshop.getWorkspace('workshop-user-1')).rejects.toMatchObject({ code: 'SERVER' });
});
it('projects only known fields and submitted QC, never drafts, private attachment metadata or credentials', async () => {
  const { store, service } = setup();
  store.commit(state => {
    Object.assign(state.users.find(row => row.id === 'workshop-user-1')!, { passwordHash: 'private-secret' });
    Object.assign(state.jobs[0]!, { internalNotes: 'private-secret' });
    state.jobs[0]!.designFiles.push({ id: 'file', name: 'private-drawing.pdf', mediaType: 'application/pdf', sizeBytes: 1 });
    state.inspections[0]!.draft = { summary: 'private-draft', items: [] };
    Object.assign(state.orders[0]!.milestones[0]!, { privateToken: 'private-secret' });
  });
  const data = await service.workshop.getWorkspace('workshop-user-1'); const json = JSON.stringify(data);
  expect(json).not.toMatch(/private-secret|private-draft|private-drawing|synthetic-dimensional-report/);
  expect(data.orders.flatMap(row => row.inspections).some(row => row.history.length > 0)).toBe(true);
  expect(data.invitations[0]!.job).not.toHaveProperty('designFiles');
});
it('derives metrics and keeps lifecycle, QC and payment records separate', async () => {
  const { service } = setup(); const data = await service.workshop.getWorkspace('workshop-user-1');
  expect(data.summary).toEqual({ invitations: 1, submittedQuotes: 1, activeOrders: 4, pendingInspections: 1, openRework: 2, closedOrders: 1 });
  const production = await service.workshop.getOrder('workshop-user-1', 'order-production');
  expect(production.order.status).toBe('IN_PRODUCTION'); expect(production.order.qcStatus).toBe('REWORK');
  expect(production.inspections[0]!.history[0]).toMatchObject({ decision: 'REWORK', correctiveAction: expect.any(String) });
  expect((await service.workshop.getOrder('workshop-user-1', 'order-paid')).payments).toEqual([]);
});
it('shows actual payment simulation records without inferring payment from lifecycle', async () => {
  const { store, service } = setup();
  store.commit(state => state.payments.push({ id: 'payment-1', orderId: 'order-production', simulationStatus: 'SIMULATED_FAILED' }));
  expect((await service.workshop.getOrder('workshop-user-1', 'order-production')).payments).toEqual([{ id: 'payment-1', orderId: 'order-production', simulationStatus: 'SIMULATED_FAILED' }]);
  expect((await service.workshop.getWorkspace('workshop-user-2')).orders).toEqual([]);
});
it('returns detached read models and exposes only scoped invitation and quotation commands', async () => {
  const { store, service } = setup(); const before = store.snapshot();
  expect(Object.keys(service.workshop).sort()).toEqual(['editQuote', 'getInvitation', 'getOrder', 'getWorkspace', 'respondToInvitation', 'submitQuote', 'withdrawQuote']);
  const data = await service.workshop.getWorkspace('workshop-user-1');
  data.profile!.machines[0]!.name = 'changed'; data.orders[0]!.order.status = 'PAID';
  data.invitations[0]!.job.title = 'changed';
  expect(store.snapshot()).toEqual(before);
});
it('reads and restores buyer invitations from the shared persistence key without writes during reads', async () => {
  let service = createMockService(createMockStore(fixtures, sessionStorage));
  const invitation = await service.buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-3');
  const saved = sessionStorage.getItem(DEMO_DATA_KEY);
  expect((await service.workshop.getWorkspace('workshop-user-3')).invitations[0]!.invitation.id).toBe(invitation.id);
  await service.workshop.getInvitation('workshop-user-3', invitation.id);
  expect(sessionStorage.getItem(DEMO_DATA_KEY)).toBe(saved);
  service = createMockService(createMockStore(fixtures, sessionStorage));
  expect((await service.workshop.getWorkspace('workshop-user-3')).invitations[0]!.invitation).toEqual(invitation);
  await service.demo!.reset();
  expect((await service.workshop.getWorkspace('workshop-user-3')).invitations).toEqual([]);
  expect((await service.admin.getOverview('admin-1')).invitations).toEqual(fixtures.invitations);
  expect((await service.buyer.getMatches('buyer-1', 'job-1')).results.find(row => row.workshop.id === 'workshop-3')?.invitation).toBeNull();
});
it('reads submitted inspector changes after restore without exposing drafts or changing production', async () => {
  let service = createMockService(createMockStore(fixtures, sessionStorage));
  const inspection = (await service.inspector.getInspection('inspector-1', 'inspection-qc')).inspection;
  const findings: InspectionFindings = { summary: 'Shared workshop inspection verified by human inspector.', items: inspection.checklist!.map(check => ({ id: check.id, result: 'PASS', notes: '', evidence: check.evidenceRequired ? [{ id: 'e', name: 'private.pdf', mediaType: 'application/pdf', sizeBytes: 1 }] : [] })) };
  await service.inspector.saveDraft('inspector-1', inspection.id, findings);
  expect(JSON.stringify(await service.workshop.getOrder('workshop-user-1', 'order-qc'))).not.toContain(findings.summary);
  await service.inspector.submitDecision('inspector-1', inspection.id, { decision: 'ACCEPTED', findings });
  service = createMockService(createMockStore(fixtures, sessionStorage));
  const row = await service.workshop.getOrder('workshop-user-1', 'order-qc');
  expect(row.order.status).toBe('QC_PENDING'); expect(row.order.qcStatus).toBe('ACCEPTED');
  expect(row.inspections[0]!.history[0]!.findings.summary).toBe(findings.summary);
  expect(JSON.stringify(row)).not.toContain('private.pdf');
  await service.demo!.reset();
  expect((await service.workshop.getOrder('workshop-user-1', 'order-qc')).order.qcStatus).toBe('PENDING');
});
it.each(['invalid-json', JSON.stringify({ version: 2, jobs: [{ id: 'injected' }], invitations: [], reviews: [], auditEvents: [], inspectionUpdates: [] })])('uses shared malformed-storage recovery and reset', async raw => {
  sessionStorage.setItem(DEMO_DATA_KEY, raw);
  const service = createMockService(createMockStore(fixtures, sessionStorage));
  expect(service.demo!.warning).toMatch(/could not be restored/);
  expect((await service.workshop.getWorkspace('workshop-user-1')).profile?.id).toBe('workshop-1');
  expect(sessionStorage.getItem(DEMO_DATA_KEY)).toBe(raw);
  await expect(service.buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-3')).rejects.toMatchObject({ code: 'SERVER' });
  await service.demo!.reset();
  expect(service.demo!.warning).toBeNull(); expect(sessionStorage.getItem(DEMO_DATA_KEY)).toBeNull();
});
