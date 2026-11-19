import { fixtures } from '@/services/mock/fixtures';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppProviders } from '@/app/App';
import { AppRoutes } from '@/app/router';
import { createServices, type DataService } from '@/services';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';
import { createMockStore } from '@/services/mock/store';
import { createMockService } from '@/services/adapters/mock';
import { sortQuotes } from './quoteModel';

beforeEach(() => sessionStorage.clear());
function setup(path: string, data: DataService = createServices()) {
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: 'buyer-1', expiresAt: Date.now() + 60000 }));
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
it('renders service ranking, explanations and workshop facts', async () => {
  setup('/buyer/jobs/job-1/matches');
  const heading = await screen.findByRole('heading', { name: 'Sahyadri Precision Works' }, { timeout: 5000 });
  const card = heading.closest('article')!;
  expect(within(card).getByText('92')).toBeVisible();
  expect(within(card).getByText('CNC machining capability is listed.')).toBeVisible();
  expect(within(card).getByText('Invitation: Accepted')).toBeVisible();
  expect(within(card).getByRole('button', { name: 'Invite workshop' })).toBeDisabled();
});
it('records a confirmed invitation once and refreshes invitation state', async () => {
  const data = createServices();
  const spy = vi.spyOn(data.buyer, 'inviteWorkshop');
  const user = setup('/buyer/jobs/job-1/matches', data);
  const heading = await screen.findByRole('heading', { name: 'Deccan Toolcraft' });
  await user.click(within(heading.closest('article')!).getByRole('button', { name: 'Invite workshop' }));
  await user.dblClick(within(screen.getByRole('dialog', { name: 'Invite this workshop?' })).getByRole('button', { name: 'Send invitation' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Invitation recorded for Deccan Toolcraft. Status: Pending.');
  expect(spy).toHaveBeenCalledTimes(1);
  expect(within(screen.getByRole('heading', { name: 'Deccan Toolcraft' }).closest('article')!).getByText('Invitation: Pending')).toBeVisible();
});
it('reports invitation failure inside the confirmation without a fake success', async () => {
  const data = createServices();
  vi.spyOn(data.buyer, 'inviteWorkshop').mockRejectedValue(new Error('Invitation service unavailable'));
  const user = setup('/buyer/jobs/job-1/matches', data);
  const heading = await screen.findByRole('heading', { name: 'Deccan Toolcraft' });
  await user.click(within(heading.closest('article')!).getByRole('button', { name: 'Invite workshop' }));
  await user.click(within(screen.getByRole('dialog', { name: 'Invite this workshop?' })).getByRole('button', { name: 'Send invitation' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invitation service unavailable');
  expect(screen.queryByText(/Invitation recorded for/)).not.toBeInTheDocument();
});
it('shows no-match guidance and no invite buttons when the service returns none', async () => {
  setup('/buyer/jobs/job-3/matches');
  expect(await screen.findByRole('heading', { name: 'No eligible workshop matches' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Invite workshop' })).not.toBeInTheDocument();
});
it.each(['matches', 'quotes'])('handles loading and failures for %s', async route => {
  const data = createServices();
  const method = route === 'matches' ? 'getMatches' : 'getQuotes';
  vi.spyOn(data.buyer, method).mockRejectedValue(new Error('Service unavailable'));
  setup('/buyer/jobs/job-1/' + route, data);
  expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
});
it.each(['matches', 'quotes'])('shows actual loading feedback before %s resolve', async route => {
  const data = createServices();
  vi.spyOn(data.buyer, route === 'matches' ? 'getMatches' : 'getQuotes').mockImplementation(() => new Promise<never>(() => {}));
  setup('/buyer/jobs/job-1/' + route, data);
  expect(await screen.findByText(route === 'matches' ? 'Loading workshop matches…' : 'Loading quotations…')).toBeInTheDocument();
});
it('compares and sorts only selected-job quotations and opens truthful award confirmation', async () => {
  const data = createServices();
  const user = setup('/buyer/jobs/job-1/quotes', data);
  const table = await screen.findByRole('table', { name: 'Job quotations' });
  expect(within(table).queryByText('₹1,18,000.00')).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: /Compare quotation quote-1 / }));
  await user.click(screen.getByRole('checkbox', { name: /Compare quotation quote-2 / }));
  expect(screen.getByRole('heading', { name: 'Selected quotation comparison' })).toBeVisible();
  expect(screen.getByRole('article', { name: 'Compare Sahyadri Precision Works' })).toHaveTextContent('₹58,000.00');
  await user.selectOptions(screen.getByLabelText('Sort quotations'), 'amount-desc');
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Sahyadri Precision Works');
  const row = within(table).getAllByRole('row').find(row => row.textContent?.includes('Sahyadri Precision Works'))!;
  await user.click(within(row).getByRole('button', { name: 'Review award' }));
  const dialog = screen.getByRole('dialog', { name: 'Review award' });
  expect(within(dialog).getByText('₹58,000.00')).toBeVisible();
  expect(within(dialog).getByText('12 Dec 2026')).toBeVisible();
  expect(within(dialog).getByRole('button', { name: 'Award order' })).toBeDisabled();
  expect(await data.list('orders')).toEqual(fixtures.orders);
});
it('prevents rejected quote review and already-awarded jobs without executing transitions', async () => {
  const store = createMockStore();
  store.commit(state => { state.jobs[0]!.status = 'AWARDED'; });
  setup('/buyer/jobs/job-1/quotes', createMockService(store));
  const table = await screen.findByRole('table', { name: 'Job quotations' });
  within(table).getAllByRole('button', { name: 'Review award' }).forEach(button => expect(button).toBeDisabled());
  expect(store.snapshot().orders).toEqual(fixtures.orders);
});
it.each([['job-3', 0], ['job-2', 1]])('handles job %s with %s quotations', async (jobId, count) => {
  setup('/buyer/jobs/' + jobId + '/quotes');
  if (count === 0) expect(await screen.findByRole('heading', { name: 'No quotations yet' })).toBeVisible();
  else expect(within(await screen.findByRole('table', { name: 'Job quotations' })).getAllByRole('row')).toHaveLength(2);
});
it('sorts quotation data without mutating service results', async () => {
  const data = await createServices().buyer.getQuotes('buyer-1', 'job-1');
  const original = structuredClone(data.quotations);
  expect(sortQuotes(data.quotations, 'amount')[0]?.quote.id).toBe('quote-3');
  expect(sortQuotes(data.quotations, 'delivery')[0]?.quote.id).toBe('quote-3');
  expect(sortQuotes(data.quotations, 'amount-desc')[0]?.quote.id).toBe('quote-1');
  expect(data.quotations).toEqual(original);
});

it.each(['matches', 'quotes'])('hides another buyer job on the %s page', async route => {
  const store = createMockStore();
  store.commit(state => {
    state.users.push({ id: 'buyer-2', role: 'buyer', name: 'Other Buyer', email: 'other@kaarigarlink.example' });
    state.jobs.push({ ...state.jobs[0]!, id: 'private-job', buyerId: 'buyer-2', title: 'Private manufacturing brief' });
  });
  setup('/buyer/jobs/private-job/' + route, createMockService(store));
  expect(await screen.findByRole('alert')).toHaveTextContent('does not belong to your account');
  expect(screen.queryByText('Private manufacturing brief')).not.toBeInTheDocument();
});
it('limits comparison to three quotations and allows clearing selection', async () => {
  const store = createMockStore();
  store.commit(state => { state.quotes.push({ ...state.quotes[0]!, id: 'quote-extra', workshopId: 'workshop-3' }); });
  const user = setup('/buyer/jobs/job-1/quotes', createMockService(store));
  const table = await screen.findByRole('table', { name: 'Job quotations' });
  const checkboxes = within(table).getAllByRole('checkbox');
  await user.click(checkboxes[0]!);
  await user.click(checkboxes[1]!);
  await user.click(checkboxes[2]!);
  expect(checkboxes[3]).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByRole('status')).toHaveTextContent('0 of 3 quotations selected');
  expect(checkboxes[3]).toBeEnabled();
});
