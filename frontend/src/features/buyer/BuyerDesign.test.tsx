import { beforeEach, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppProviders } from '@/app/App';
import { AppRoutes } from '@/app/router';
import { createMockService } from '@/services/adapters/mock';
import { createMockStore } from '@/services/mock/store';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';
import { quoteRange } from './quoteModel';

beforeEach(() => sessionStorage.clear());
function setup(path: string) {
  const store = createMockStore(); const data = createMockService(store);
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: 'buyer-1', expiresAt: Date.now() + 60000 }));
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return { store, data, user: userEvent.setup() };
}
it('derives quotation activity, attention orders and linked pipeline from the canonical snapshot', async () => {
  const { store } = setup('/buyer/dashboard');
  const panel = await screen.findByRole('region', { name: 'Orders requiring attention' });
  const expected = store.snapshot().orders.filter(order => order.buyerId === 'buyer-1' && (order.qcStatus === 'REWORK' || order.status === 'QC_PENDING' || order.status === 'REWORK'));
  expect(within(panel).getAllByRole('link')).toHaveLength(expected.length);
  for (const order of expected) expect(within(panel).getByRole('link', { name: order.id })).toHaveAttribute('href', '/buyer/orders/' + order.id);
  expect(screen.getByRole('region', { name: 'Quotation activity' })).toHaveTextContent('Quote timestamps are not supplied.');
  expect(screen.getByRole('link', { name: 'Post a Manufacturing Job' })).toHaveAttribute('href', '/buyer/jobs/new');
  expect(within(screen.getByRole('region', { name: 'Job status overview' })).getByRole('link', { name: 'Quoting' })).toHaveAttribute('href', '/buyer/jobs?status=QUOTING');
});
it('adds quote counts and contextual next steps to jobs without mutating shared data', async () => {
  const { store } = setup('/buyer/jobs'); const before = store.snapshot();
  const table = await screen.findByRole('table', { name: 'Manufacturing jobs' });
  const row = within(table).getByRole('link', { name: 'Machine aluminium mounting brackets' }).closest('tr')!;
  expect(await within(row).findByText('2 submitted')).toBeVisible();
  expect(within(row).getByRole('button', { name: 'Find workshops' })).toBeEnabled();
  expect(store.snapshot()).toEqual(before);
});
it('shows the actual requirement with service-ranked workshop evidence', async () => {
  setup('/buyer/jobs/job-1/matches');
  const summary = await screen.findByRole('region', { name: 'Job requirement summary' });
  expect(summary).toHaveTextContent('Aluminium 6061');
  expect(summary).toHaveTextContent('CNC machining');
  expect(screen.getByRole('heading', { name: 'Sahyadri Precision Works' }).closest('article')).toHaveTextContent('CNC machining capability is listed.');
});
it('compares selected offer differences while keeping the final award disabled', async () => {
  const { user, store } = setup('/buyer/jobs/job-1/quotes'); const before = store.snapshot();
  await user.click(await screen.findByRole('checkbox', { name: /Compare quotation quote-1 / }));
  await user.click(screen.getByRole('checkbox', { name: /Compare quotation quote-2 / }));
  const comparison = screen.getByRole('region', { name: 'Selected quotation comparison' });
  expect(comparison).toHaveTextContent('Lowest amount among selected offers.');
  expect(comparison).toHaveTextContent('above the lowest selected amount.');
  expect(screen.getByRole('complementary', { name: 'Awarding restriction' })).toHaveTextContent('Awarding unavailable');
  await user.click(within(screen.getByRole('table')).getAllByRole('button', { name: 'Review award' }).find(button => !button.hasAttribute('disabled'))!);
  expect(within(screen.getByRole('dialog', { name: 'Review award' })).getByRole('button', { name: 'Award order' })).toBeDisabled();
  expect(store.snapshot()).toEqual(before);
});
it('does not turn accepted QC or a closed order into a payment claim', async () => {
  setup('/buyer/orders/order-closed');
  const payment = await screen.findByRole('region', { name: 'Payment status' });
  expect(payment).toHaveTextContent('No separate payment record is supplied');
  expect(payment).toHaveTextContent('do not confirm payment');
  expect(screen.queryByRole('button', { name: /Pay|Close order|Accept QC/ })).not.toBeInTheDocument();
});
it('computes factual quotation ranges and handles empty comparison data', async () => {
  const data = createMockService(createMockStore()); const offers = (await data.buyer.getQuotes('buyer-1', 'job-1')).quotations;
  expect(quoteRange([])).toBeNull();
  const range = quoteRange(offers)!;
  expect(range.min).toBe(Math.min(...offers.map(entry => entry.quote.amount)));
  expect(range.max).toBe(Math.max(...offers.map(entry => entry.quote.amount)));
  expect(range.earliest).toBe([...offers.map(entry => entry.quote.estimatedDelivery)].sort()[0]);
  expect(quoteRange([...offers].reverse())).toEqual(range);
});
