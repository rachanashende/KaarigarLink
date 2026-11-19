import { beforeEach, expect, it, vi } from 'vitest';
import * as calendar from './jobs';
import { createMockService } from './adapters/mock';
import { createMockStore } from './mock/store';
import { fixtures } from './mock/fixtures';
import { DEMO_DATA_KEY } from './mock/persistence';
import type { QuoteTerms } from './workshopCommands';

const terms: QuoteTerms = { amount: 55000, estimatedDelivery: '2026-12-13', notes: 'Shared mock quotation includes machining and delivery.' };
beforeEach(() => { sessionStorage.clear(); vi.spyOn(calendar, 'todayInIndia').mockReturnValue('2026-11-19'); });
async function setup(persist = false, accept = false) {
  const store = createMockStore(fixtures, persist ? sessionStorage : undefined); const service = createMockService(store);
  const invitation = await service.buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-3');
  if (accept) await service.workshop.respondToInvitation('workshop-user-3', invitation.id, { response: 'ACCEPTED' });
  return { store, service, invitation };
}
function snapshotTerms(quote: QuoteTerms): QuoteTerms { return { amount: quote.amount, estimatedDelivery: quote.estimatedDelivery, notes: quote.notes }; }
it.each(['ACCEPTED', 'DECLINED'] as const)('records %s without creating orders/quotes or awarding; exact retries have no extra effects', async response => {
  const { store, service, invitation } = await setup(true);
  const before = store.snapshot();
  const result = await service.workshop.respondToInvitation('workshop-user-3', invitation.id, { response });
  expect(result).toEqual({ ...invitation, status: response });
  const after = store.snapshot(); const raw = sessionStorage.getItem(DEMO_DATA_KEY);
  expect(after.orders).toEqual(before.orders); expect(after.jobs).toEqual(before.jobs); expect(after.quotes).toEqual(before.quotes);
  expect(after.auditEvents).toHaveLength(before.auditEvents.length + 1);
  expect((await service.buyer.getMatches('buyer-1', 'job-1')).results.find(row => row.workshop.id === 'workshop-3')!.invitation!.status).toBe(response);
  expect(await service.workshop.respondToInvitation('workshop-user-3', invitation.id, { response })).toEqual(result);
  expect(store.snapshot()).toEqual(after); expect(sessionStorage.getItem(DEMO_DATA_KEY)).toBe(raw);
  await expect(service.workshop.respondToInvitation('workshop-user-3', invitation.id, { response: response === 'ACCEPTED' ? 'DECLINED' : 'ACCEPTED' })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.snapshot()).toEqual(after);
});
it.each(['buyer-1', 'inspector-1', 'admin-1', 'unknown'])('denies every enabled command to %s', async actor => {
  const { store, service, invitation } = await setup(); const before = store.snapshot();
  const code = actor === 'unknown' ? 'UNAUTHORIZED' : 'FORBIDDEN';
  await expect(service.workshop.respondToInvitation(actor, invitation.id, { response: 'ACCEPTED' })).rejects.toMatchObject({ code });
  await expect(service.workshop.submitQuote(actor, invitation.id, terms)).rejects.toMatchObject({ code });
  await expect(service.workshop.editQuote(actor, 'quote-1', { expected: terms, changes: terms })).rejects.toMatchObject({ code });
  await expect(service.workshop.withdrawQuote(actor, 'quote-1', { expected: terms })).rejects.toMatchObject({ code });
  expect(store.snapshot()).toEqual(before);
});
it('masks missing/foreign IDs and enforces canonical ownership on every command', async () => {
  const { store, service, invitation } = await setup(); const before = store.snapshot();
  for (const id of [invitation.id, 'missing']) {
    await expect(service.workshop.respondToInvitation('workshop-user-2', id, { response: 'ACCEPTED' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.workshop.submitQuote('workshop-user-2', id, terms)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  }
  for (const id of ['quote-1', 'missing']) {
    await expect(service.workshop.editQuote('workshop-user-2', id, { expected: terms, changes: terms })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.workshop.withdrawQuote('workshop-user-2', id, { expected: terms })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  }
  expect(store.snapshot()).toEqual(before);
});
it.each(['PENDING', 'DECLINED'] as const)('does not allow quoting an invitation in %s', async status => {
  const { store, service, invitation } = await setup();
  if (status === 'DECLINED') await service.workshop.respondToInvitation('workshop-user-3', invitation.id, { response: 'DECLINED' });
  const before = store.snapshot();
  await expect(service.workshop.submitQuote('workshop-user-3', invitation.id, terms)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.snapshot()).toEqual(before);
});
it('submits one canonical quote, shares it with Buyer/Admin, and makes concurrent exact retries idempotent', async () => {
  const { store, service, invitation } = await setup(true, true); const before = store.snapshot();
  const [a, b] = await Promise.all([service.workshop.submitQuote('workshop-user-3', invitation.id, terms), service.workshop.submitQuote('workshop-user-3', invitation.id, terms)]);
  expect(a).toEqual(b); expect(a).toMatchObject({ jobId: 'job-1', workshopId: 'workshop-3', status: 'SUBMITTED', ...terms });
  expect(store.snapshot().quotes).toHaveLength(before.quotes.length + 1);
  expect(store.snapshot().auditEvents).toHaveLength(before.auditEvents.length + 1);
  expect((await service.buyer.getQuotes('buyer-1', 'job-1')).quotations.find(row => row.quote.id === a.id)!.quote).toEqual(a);
  expect((await service.admin.getOverview('admin-1')).quotes.find(row => row.id === a.id)).toEqual(a);
  expect(store.snapshot().orders).toEqual(before.orders); expect(store.snapshot().jobs).toEqual(before.jobs);
  await expect(service.workshop.submitQuote('workshop-user-3', invitation.id, { ...terms, amount: 54000 })).rejects.toMatchObject({ code: 'CONFLICT' });
});
it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.001, 1_000_000_001])('rejects invalid amount %s atomically', async amount => {
  const { store, service, invitation } = await setup(false, true); const before = store.snapshot();
  await expect(service.workshop.submitQuote('workshop-user-3', invitation.id, { ...terms, amount })).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(store.snapshot()).toEqual(before);
});
it.each(['not-a-date', '2026-11-18', '2026-12-16'])('rejects invalid/out-of-window delivery %s', async estimatedDelivery => {
  const { store, service, invitation } = await setup(false, true); const before = store.snapshot();
  await expect(service.workshop.submitQuote('workshop-user-3', invitation.id, { ...terms, estimatedDelivery })).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(store.snapshot()).toEqual(before);
});
it.each([-1, 0, 1.5, 7])('rejects unsupported production duration %s instead of dropping it', async productionDays => {
  const { store, service, invitation } = await setup(false, true); const before = store.snapshot();
  const input = { ...terms, productionDays };
  await expect(service.workshop.submitQuote('workshop-user-3', invitation.id, input)).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(store.snapshot()).toEqual(before);
});
it('rejects extra relationship/state fields and overlong notes; trims valid notes', async () => {
  const { service, invitation } = await setup(false, true);
  const spoofed = { ...terms, workshopId: 'workshop-1', jobId: 'other-job', status: 'AWARDED' };
  await expect(service.workshop.submitQuote('workshop-user-3', invitation.id, spoofed)).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(service.workshop.submitQuote('workshop-user-3', invitation.id, { ...terms, notes: 'x'.repeat(4001) })).rejects.toMatchObject({ code: 'VALIDATION' });
  expect((await service.workshop.submitQuote('workshop-user-3', invitation.id, { ...terms, notes: '  trimmed notes  ' })).notes).toBe('trimmed notes');
});
it('edits with expected terms, rejects stale competing edits and returns exact replays without extra audit', async () => {
  const { store, service, invitation } = await setup(false, true);
  const original = await service.workshop.submitQuote('workshop-user-3', invitation.id, terms);
  const changes = { ...terms, amount: 56000, notes: 'Revised shared production quotation.' };
  const updated = await service.workshop.editQuote('workshop-user-3', original.id, { expected: snapshotTerms(original), changes });
  expect(updated).toMatchObject(changes);
  const after = store.snapshot();
  expect(await service.workshop.editQuote('workshop-user-3', original.id, { expected: terms, changes })).toEqual(updated);
  expect(store.snapshot()).toEqual(after);
  await expect(service.workshop.editQuote('workshop-user-3', original.id, { expected: terms, changes: { ...changes, amount: 57000 } })).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('changed') });
  await expect(service.workshop.withdrawQuote('workshop-user-3', original.id, { expected: terms })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.snapshot()).toEqual(after);
});
it('withdraws only a submitted own quote; exact retries are no-ops and resubmission is blocked', async () => {
  const { store, service, invitation } = await setup(true, true);
  const quote = await service.workshop.submitQuote('workshop-user-3', invitation.id, terms);
  const withdrawn = await service.workshop.withdrawQuote('workshop-user-3', quote.id, { expected: terms });
  expect(withdrawn.status).toBe('WITHDRAWN'); const after = store.snapshot(); const raw = sessionStorage.getItem(DEMO_DATA_KEY);
  expect(await service.workshop.withdrawQuote('workshop-user-3', quote.id, { expected: terms })).toEqual(withdrawn);
  expect(store.snapshot()).toEqual(after); expect(sessionStorage.getItem(DEMO_DATA_KEY)).toBe(raw);
  await expect(service.workshop.editQuote('workshop-user-3', quote.id, { expected: terms, changes: { ...terms, amount: 1 } })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(service.workshop.submitQuote('workshop-user-3', invitation.id, terms)).rejects.toMatchObject({ code: 'CONFLICT' });
});
it.each(['AWARDED', 'CLOSED', 'CANCELLED', 'expired', 'order', 'awarded-quote'])('rejects responses and quote mutations when the current job is blocked by %s', async reason => {
  const { store, service, invitation } = await setup();
  store.commit(state => {
    if (reason === 'expired') state.jobs.find(row => row.id === 'job-1')!.deadline = '2026-11-18';
    else if (reason === 'order') state.orders.push({ ...structuredClone(state.orders[0]!), id: 'external-order', jobId: 'job-1' });
    else if (reason === 'awarded-quote') state.quotes[0]!.status = 'AWARDED';
    else state.jobs.find(row => row.id === 'job-1')!.status = reason === 'CLOSED' ? 'CLOSED' : reason === 'CANCELLED' ? 'CANCELLED' : 'AWARDED';
  });
  const before = store.snapshot();
  await expect(service.workshop.respondToInvitation('workshop-user-3', invitation.id, { response: 'ACCEPTED' })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(service.workshop.submitQuote('workshop-user-3', invitation.id, terms)).rejects.toMatchObject({ code: 'CONFLICT' });
  const own = fixtures.quotes.find(row => row.id === 'quote-1')!;
  await expect(service.workshop.editQuote('workshop-user-1', own.id, { expected: snapshotTerms(own), changes: terms })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(service.workshop.withdrawQuote('workshop-user-1', own.id, { expected: snapshotTerms(own) })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.snapshot()).toEqual(before);
});
it.each(['quote-order-production', 'quote-3'])('cannot edit/withdraw awarded or rejected quotation %s', async id => {
  const { store, service } = await setup(); const row = fixtures.quotes.find(item => item.id === id)!; const actor = id === 'quote-3' ? 'workshop-user-4' : 'workshop-user-1'; const before = store.snapshot();
  await expect(service.workshop.editQuote(actor, id, { expected: snapshotTerms(row), changes: terms })).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(service.workshop.withdrawQuote(actor, id, { expected: snapshotTerms(row) })).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.snapshot()).toEqual(before);
});
it('cannot change order/QC/payment state through any supported command or extra fields', async () => {
  const { store, service, invitation } = await setup(false, true); const before = store.snapshot();
  const q = await service.workshop.submitQuote('workshop-user-3', invitation.id, terms);
  await service.workshop.editQuote('workshop-user-3', q.id, { expected: terms, changes: { ...terms, amount: 1 } });
  await service.workshop.withdrawQuote('workshop-user-3', q.id, { expected: { ...terms, amount: 1 } });
  const after = store.snapshot();
  for (const key of ['orders', 'milestones', 'inspections', 'payments', 'jobs', 'workshops'] as const) expect(after[key]).toEqual(before[key]);
  for (const method of ['awardOrder', 'updateOrderStatus', 'submitQC', 'acceptQC', 'markPaid', 'closeOrder', 'updateProfile']) expect(service.workshop).not.toHaveProperty(method);
});
it.each(['respond', 'submit', 'edit', 'withdraw'])('rolls back %s plus audit when shared persistence fails', async command => {
  const { store, service, invitation } = await setup(true, command !== 'respond');
  const quote = command === 'edit' || command === 'withdraw' ? await service.workshop.submitQuote('workshop-user-3', invitation.id, terms) : null;
  const before = store.snapshot(); const saved = sessionStorage.getItem(DEMO_DATA_KEY);
  vi.spyOn(Object.getPrototypeOf(sessionStorage) as Storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  const promise = command === 'respond' ? service.workshop.respondToInvitation('workshop-user-3', invitation.id, { response: 'ACCEPTED' }) :
    command === 'submit' ? service.workshop.submitQuote('workshop-user-3', invitation.id, terms) :
    command === 'edit' ? service.workshop.editQuote('workshop-user-3', quote!.id, { expected: terms, changes: { ...terms, amount: 1 } }) :
    service.workshop.withdrawQuote('workshop-user-3', quote!.id, { expected: terms });
  await expect(promise).rejects.toMatchObject({ code: 'SERVER' });
  expect(store.snapshot()).toEqual(before); expect(sessionStorage.getItem(DEMO_DATA_KEY)).toBe(saved);
});
it('restores v3 invitations/quotes/edits/withdrawals in the same key and shared reset restores every role', async () => {
  const { service, invitation } = await setup(true, true);
  const q = await service.workshop.submitQuote('workshop-user-3', invitation.id, terms);
  await service.workshop.editQuote('workshop-user-3', q.id, { expected: terms, changes: { ...terms, amount: 1 } });
  let restored = createMockService(createMockStore(fixtures, sessionStorage));
  expect(restored.demo!.warning).toBeNull();
  expect((await restored.buyer.getQuotes('buyer-1', 'job-1')).quotations.find(row => row.quote.id === q.id)!.quote.amount).toBe(1);
  await restored.workshop.withdrawQuote('workshop-user-3', q.id, { expected: { ...terms, amount: 1 } });
  restored = createMockService(createMockStore(fixtures, sessionStorage));
  expect(restored.demo!.warning).toBeNull();
  expect((await restored.workshop.getWorkspace('workshop-user-3')).quotations[0]!.quote.status).toBe('WITHDRAWN');
  expect(JSON.parse(sessionStorage.getItem(DEMO_DATA_KEY)!).version).toBe(3);
  await restored.demo!.reset();
  expect((await restored.workshop.getWorkspace('workshop-user-3')).quotations).toEqual([]);
  expect((await restored.admin.getOverview('admin-1')).quotes).toEqual(fixtures.quotes);
  expect((await restored.buyer.getMatches('buyer-1', 'job-1')).results.find(row => row.workshop.id === 'workshop-3')!.invitation).toBeNull();
});
it.each([1, 2])('restores older envelope v%s and upgrades only on a successful write', async version => {
  const { service } = await setup(true);
  const old = JSON.parse(sessionStorage.getItem(DEMO_DATA_KEY)!); delete old.quotes; if (version === 1) delete old.inspectionUpdates; old.version = version;
  const raw = JSON.stringify(old); sessionStorage.setItem(DEMO_DATA_KEY, raw);
  const restored = createMockService(createMockStore(fixtures, sessionStorage));
  expect(restored.demo!.warning).toBeNull(); expect(sessionStorage.getItem(DEMO_DATA_KEY)).toBe(raw);
  expect((await restored.list('quotes'))).toEqual(await service.list('quotes'));
  const invitation = (await restored.workshop.getWorkspace('workshop-user-3')).invitations[0]!;
  await restored.workshop.respondToInvitation('workshop-user-3', invitation.invitation.id, { response: 'ACCEPTED' });
  expect(JSON.parse(sessionStorage.getItem(DEMO_DATA_KEY)!).version).toBe(3);
});
it.each(['foreign-reference', 'duplicate-pair', 'new-award', 'changed-historical-award', 'missing-seed', 'unknown-duration'])('rejects malformed v3 quote data: %s', async problem => {
  const { service, invitation } = await setup(true, true); const q = await service.workshop.submitQuote('workshop-user-3', invitation.id, terms);
  const raw = JSON.parse(sessionStorage.getItem(DEMO_DATA_KEY)!);
  const row = raw.quotes.find((item: { id: string }) => item.id === q.id);
  if (problem === 'foreign-reference') row.workshopId = 'missing';
  if (problem === 'duplicate-pair') raw.quotes.push({ ...row, id: 'duplicate' });
  if (problem === 'new-award') row.status = 'AWARDED';
  if (problem === 'changed-historical-award') raw.quotes.find((item: { id: string }) => item.id === 'quote-order-production').amount = 1;
  if (problem === 'missing-seed') raw.quotes = raw.quotes.filter((item: { id: string }) => item.id !== 'quote-1');
  if (problem === 'unknown-duration') row.productionDays = 7;
  sessionStorage.setItem(DEMO_DATA_KEY, JSON.stringify(raw));
  const restored = createMockService(createMockStore(fixtures, sessionStorage));
  expect(restored.demo!.warning).toContain('could not be restored');
  expect(await restored.list('quotes')).toEqual(fixtures.quotes);
  await expect(restored.workshop.respondToInvitation('workshop-user-1', 'seed-invitation-1', { response: 'ACCEPTED' })).rejects.toMatchObject({ code: 'SERVER' });
  await restored.demo!.reset(); expect(restored.demo!.warning).toBeNull();
});
it('connects a newly posted job once an explicit matching result is supplied; never fabricates that result', async () => {
  const { store, service } = await setup();
  const job = await service.buyer.createJob('buyer-1', { title: 'New mock batch', description: 'Produce a validated small batch.', capability: 'CNC machining', material: 'Steel', specification: '', quantity: 10, unit: 'pieces', processes: ['Milling'], deadline: '2026-12-15', location: { city: 'Pune', state: 'Maharashtra' }, designFiles: [] });
  expect((await service.buyer.getMatches('buyer-1', job.id)).results).toEqual([]);
  await expect(service.buyer.inviteWorkshop('buyer-1', job.id, 'workshop-3')).rejects.toMatchObject({ code: 'CONFLICT' });
  store.commit(state => state.matches.push({ jobId: job.id, workshopId: 'workshop-3', score: 90, explanations: ['Explicit test-supplied matching result.'], eligibility: { eligible: true, reasons: [] } }));
  const inv = await service.buyer.inviteWorkshop('buyer-1', job.id, 'workshop-3');
  await service.workshop.respondToInvitation('workshop-user-3', inv.id, { response: 'ACCEPTED' });
  const q = await service.workshop.submitQuote('workshop-user-3', inv.id, terms);
  expect((await service.buyer.getQuotes('buyer-1', job.id)).quotations[0]!.quote).toEqual(q);
});
