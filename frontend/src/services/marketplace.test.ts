import { fixtures } from '@/services/mock/fixtures';
import { beforeEach, expect, it } from 'vitest';
import { createMockStore } from './mock/store';
import { createMockService } from './adapters/mock';

let store = createMockStore();
beforeEach(() => { store = createMockStore(); });
it('returns ranked fixtures and explanations without calculating or reordering scores', async () => {
  store.commit(state => { state.matches[0]!.score = 7; });
  const data = await createMockService(store).buyer.getMatches('buyer-1', 'job-1');
  expect(data.results.map(result => result.workshop.id)).toEqual(['workshop-1', 'workshop-2', 'workshop-3', 'workshop-4']);
  expect(data.results[0]?.match.score).toBe(7);
  expect(data.results[0]?.match.explanations).toContain('CNC machining capability is listed.');
  expect(data.results[0]?.invitation?.status).toBe('ACCEPTED');
  expect(data.results[2]?.canInvite).toBe(true);
  expect(data.results[3]?.canInvite).toBe(false);
  data.results[0]!.match.explanations.length = 0;
  expect((await createMockService(store).buyer.getMatches('buyer-1', 'job-1')).results[0]?.match.explanations.length).toBeGreaterThan(0);
});
it('keeps zero matches, zero quotes and one quote exactly as returned', async () => {
  const buyer = createMockService(store).buyer;
  expect((await buyer.getMatches('buyer-1', 'job-3')).results).toEqual([]);
  expect((await buyer.getQuotes('buyer-1', 'job-3')).quotations).toEqual([]);
  expect((await buyer.getQuotes('buyer-1', 'job-2')).quotations.map(entry => entry.quote.id)).toEqual(['quote-4']);
});
it('atomically records one invitation/event, including concurrent duplicates, shared across readers', async () => {
  const buyer = createMockService(store).buyer;
  const before = store.snapshot();
  const [a, b] = await Promise.all([buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-3'), buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-3')]);
  expect(a).toEqual(b);
  expect(a).toMatchObject({ jobId: 'job-1', workshopId: 'workshop-3', status: 'PENDING' });
  const after = store.snapshot();
  expect(after.invitations).toHaveLength(before.invitations.length + 1);
  expect(after.auditEvents).toHaveLength(before.auditEvents.length + 1);
  expect(after.jobs).toEqual(before.jobs);
  expect(after.orders).toEqual(before.orders);
  expect((await createMockService(store).buyer.getMatches('buyer-1', 'job-1')).results[2]?.invitation).toEqual(a);
});
it('rejects ineligible/unmatched workshops and closed jobs without partial changes', async () => {
  const buyer = createMockService(store).buyer;
  store.commit(state => { state.invitations = state.invitations.filter(invitation => invitation.workshopId !== 'workshop-4'); });
  const before = store.snapshot();
  await expect(buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-4')).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(buyer.inviteWorkshop('buyer-1', 'job-3', 'workshop-3')).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(store.snapshot()).toEqual(before);
  store.commit(state => { state.jobs[0]!.status = 'CANCELLED'; });
  await expect(buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-3')).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('enforces buyer ownership on reads and invitations', async () => {
  store.commit(state => { state.users.push({ id: 'buyer-2', role: 'buyer', name: 'Other Buyer', email: 'other@kaarigarlink.example' }); });
  const buyer = createMockService(store).buyer;
  await expect(buyer.getMatches('buyer-2', 'job-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(buyer.getQuotes('buyer-2', 'job-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(buyer.inviteWorkshop('buyer-2', 'job-1', 'workshop-3')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(buyer.getQuotes('admin-1', 'job-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(buyer.getMatches('missing', 'job-1')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
it('filters quotations to the owned job and gates award review using existing status/eligibility', async () => {
  const data = await createMockService(store).buyer.getQuotes('buyer-1', 'job-1');
  expect(data.quotations.map(entry => entry.quote.id)).toEqual(['quote-1', 'quote-2', 'quote-3']);
  expect(data.quotations.map(entry => entry.canReviewAward)).toEqual([true, true, false]);
  expect(data.awardBlocker).toContain('no order will be created');
});
it.each(['AWARDED', 'CLOSED', 'CANCELLED'] as const)('blocks review and new invitations for %s jobs', async status => {
  store.commit(state => { state.jobs[0]!.status = status; });
  const buyer = createMockService(store).buyer;
  expect((await buyer.getQuotes('buyer-1', 'job-1')).quotations.every(entry => !entry.canReviewAward)).toBe(true);
  await expect(buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-3')).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('blocks stale awarded-quote, withdrawn, invalid amount/date and ineligible cases without any award command', async () => {
  const buyer = createMockService(store).buyer;
  store.commit(state => { state.quotes[0]!.status = 'AWARDED'; });
  expect((await buyer.getQuotes('buyer-1', 'job-1')).quotations.every(entry => !entry.canReviewAward)).toBe(true);
  store.reset();
  store.commit(state => { state.quotes[0]!.status = 'WITHDRAWN'; state.quotes[1]!.amount = -1; state.quotes[2]!.status = 'SUBMITTED'; });
  expect((await buyer.getQuotes('buyer-1', 'job-1')).quotations.every(entry => !entry.canReviewAward)).toBe(true);
  store.reset();
  store.commit(state => { state.quotes[0]!.estimatedDelivery = 'invalid'; });
  expect((await buyer.getQuotes('buyer-1', 'job-1')).quotations[0]?.canReviewAward).toBe(false);
  expect('awardQuote' in buyer).toBe(false);
  expect(store.snapshot().orders).toEqual(fixtures.orders);
});
it('surfaces missing workshop references instead of manufacturing successful results', async () => {
  store.commit(state => { state.workshops = state.workshops.filter(workshop => workshop.id !== 'workshop-1'); });
  const buyer = createMockService(store).buyer;
  await expect(buyer.getMatches('buyer-1', 'job-1')).rejects.toMatchObject({ code: 'SERVER' });
  await expect(buyer.getQuotes('buyer-1', 'job-1')).rejects.toMatchObject({ code: 'SERVER' });
});
