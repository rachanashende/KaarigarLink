import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '@/app/router';
import { AppProviders } from '@/app/App';
import { createMockService } from '@/services/adapters/mock';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';
import { createMockStore } from '@/services/mock/store';

beforeEach(() => sessionStorage.clear());
function route(path: string, data = createMockService()) {
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: 'buyer-1', expiresAt: Date.now() + 60000 }));
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
it('lists seeded orders and filters by search/status with meaningful empty results', async () => {
  const user = route('/buyer/orders');
  expect(await screen.findByText('6 of 6 orders')).toBeVisible();
  expect(within(screen.getByRole('table')).getByText('₹72,000.00')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Search orders, jobs or workshops'), { target: { value: 'conveyor' } });
  expect(screen.getByText('1 of 6 orders')).toBeVisible();
  await user.selectOptions(screen.getByLabelText('Order status'), 'CLOSED');
  expect(await screen.findByRole('heading', { name: 'No orders match these filters' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  await user.selectOptions(screen.getByLabelText('Sort orders'), 'deadline');
  expect(screen.getByText('6 of 6 orders')).toBeVisible();
});
it.each([['order-production', '25%', 'Delayed · In progress'], ['order-qc', '75%', 'QC pending'], ['order-rework', '50%', 'Rework requested'], ['order-closed', '100%', 'Accepted']])('renders %s tracking, production and QC visibility', async (id, progress, text) => {
  route('/buyer/orders/' + id);
  await screen.findByRole('heading', { name: id });
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', progress.replace('%', ''));
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  expect(screen.getByRole('heading', { name: 'Manufacturing brief' })).toBeVisible();
  if (id === 'order-rework') {
    expect(screen.getByText(/Bore surface finish exceeds/)).toBeVisible();
    expect(screen.getByText('Rework deadline: 26 Nov 2026')).toBeVisible();
  }
  expect(screen.queryByRole('button', { name: /Accept QC|Update milestone/ })).not.toBeInTheDocument();
});
it('validates, confirms and submits one mock review, showing the existing review after refresh', async () => {
  const data = createMockService(); const submit = vi.spyOn(data.buyer, 'submitReview');
  const user = route('/buyer/orders/order-closed/review', data);
  await user.click(await screen.findByRole('button', { name: 'Review submission' }));
  expect(await screen.findByText('Choose a workshop rating.')).toBeVisible();
  expect(screen.getByLabelText('Workshop rating')).toHaveFocus();
  await user.selectOptions(screen.getByLabelText('Workshop rating'), '4');
  fireEvent.change(screen.getByLabelText('Written feedback'), { target: { value: 'Good dimensional accuracy and communication.' } });
  await user.click(screen.getByRole('button', { name: 'Review submission' }));
  const dialog = await screen.findByRole('dialog', { name: 'Submit demo review?' });
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeVisible();
  await user.dblClick(within(dialog).getByRole('button', { name: 'Submit demo review' }));
  expect(await screen.findByText(/Demo review recorded. No order/)).toBeVisible();
  expect(await screen.findByText('Your rating: 4 / 5')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Review submission' })).not.toBeInTheDocument();
  expect(submit).toHaveBeenCalledTimes(1);
});
it('keeps review feedback on service failure and permits retry', async () => {
  const data = createMockService(); vi.spyOn(data.buyer, 'submitReview').mockRejectedValue(new Error('Storage unavailable'));
  const user = route('/buyer/orders/order-closed', data);
  await screen.findByLabelText('Written feedback');
  await user.selectOptions(screen.getByLabelText('Workshop rating'), '5');
  fireEvent.change(screen.getByLabelText('Written feedback'), { target: { value: 'Accurate machining on the completed batch.' } });
  await user.click(screen.getByRole('button', { name: 'Review submission' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit demo review' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable');
  expect(screen.getByLabelText('Written feedback')).toHaveValue('Accurate machining on the completed batch.');
});
it('does not enable reviews on payment status alone', async () => {
  route('/buyer/orders/order-paid');
  expect(await screen.findByText(/Payment status alone does not qualify/)).toBeVisible();
  expect(screen.queryByLabelText('Written feedback')).not.toBeInTheDocument();
});
it.each(['missing', 'private'])('hides unavailable order %s', async id => {
  const store = createMockStore();
  store.commit(state => { state.orders.find(order => order.id === 'order-production')!.buyerId = 'buyer-2'; });
  route('/buyer/orders/' + (id === 'private' ? 'order-production' : id), createMockService(store));
  expect(await screen.findByRole('heading', { name: 'Order unavailable' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Production milestones' })).not.toBeInTheDocument();
});
it.each(['listOrders', 'getOrder'] as const)('renders loading and error states for %s', async method => {
  const data = createMockService();
  const mock = vi.spyOn(data.buyer, method).mockImplementation(() => new Promise<never>(() => {}));
  route(method === 'listOrders' ? '/buyer/orders' : '/buyer/orders/order-production', data);
  expect(await screen.findByText(method === 'listOrders' ? 'Loading your orders…' : 'Loading order tracking…')).toBeVisible();
  mock.mockRejectedValue(new Error('Tracking unavailable'));
});
it('renders empty orders and a recoverable list error', async () => {
  const data = createMockService(); vi.spyOn(data.buyer, 'listOrders').mockResolvedValue([]);
  route('/buyer/orders', data);
  expect(await screen.findByRole('heading', { name: 'No orders yet' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'View jobs' })).toBeVisible();
});
it.each(['listOrders', 'getOrder'] as const)('surfaces %s errors', async method => {
  const data = createMockService(); vi.spyOn(data.buyer, method).mockRejectedValue(new Error('Tracking unavailable'));
  route(method === 'listOrders' ? '/buyer/orders' : '/buyer/orders/order-production', data);
  expect(await screen.findByRole('alert')).toHaveTextContent('Tracking unavailable');
});
it('confirms demo reset and refreshes shared queries', async () => {
  const data = createMockService();
  await data.buyer.submitReview('buyer-1', 'order-closed', { rating: 5, comment: 'Synthetic feedback for a completed order.' });
  const user = route('/buyer/orders', data);
  await user.click(await screen.findByRole('button', { name: 'Reset demo data' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset demo data' }));
  expect(await data.list('reviews')).toEqual([]);
});
