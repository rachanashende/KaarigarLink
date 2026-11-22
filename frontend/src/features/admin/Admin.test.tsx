import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import * as calendar from '@/services/jobs';
import { AppProviders } from '@/app/App';
import { AppRoutes } from '@/app/router';
import { createMockService } from '@/services/adapters/mock';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';
import type { AdminOverview } from '@/services/admin';

beforeEach(() => { sessionStorage.clear(); vi.spyOn(calendar, 'todayInIndia').mockReturnValue('2026-11-19'); });
function route(path: string, data = createMockService(), actor = 'admin-1') {
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: actor, expiresAt: Date.now() + 60000 }));
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
it('renders derived dashboard metrics, actual marketplace activity and linked alerts', async () => {
  route('/admin/dashboard');
  expect(await screen.findByRole('group', { name: 'Total registered users' })).toHaveTextContent('7');
  expect(screen.getByRole('group', { name: 'Total buyers' })).toHaveTextContent('1');
  expect(screen.getByRole('group', { name: 'Total workshops' })).toHaveTextContent('4');
  expect(screen.getByRole('group', { name: 'Active manufacturing jobs' })).toHaveTextContent('8');
  expect(screen.getByRole('group', { name: 'Active orders' })).toHaveTextContent('4');
  expect(screen.getByRole('group', { name: 'Pending inspections' })).toHaveTextContent('1');
  expect(screen.getByRole('group', { name: 'Open rework cases' })).toHaveTextContent('2');
  expect(screen.getByRole('link', { name: 'Rework deadline passed' })).toHaveAttribute('href', '/admin/quality/inspection-overdue');
  expect(screen.getByRole('navigation', { name: 'Admin management' })).toHaveTextContent('Quality operations');
  expect(screen.queryByRole('group', { name: /revenue|commission/i })).not.toBeInTheDocument();
});
it('searches, filters and sorts users, then shows an account without unsupported actions', async () => {
  const user = route('/admin/users');
  await screen.findByText('7 of 7 records');
  await user.selectOptions(screen.getByLabelText('Role'), 'buyer');
  expect(await screen.findByText('1 of 7 records')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'Ananya' } });
  await user.click(within(screen.getByRole('table')).getByRole('link', { name: 'Ananya Shah' }));
  expect(await screen.findByRole('heading', { name: 'Ananya Shah' })).toBeVisible();
  expect(screen.getByText('Not supplied by the current contract')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Suspend|Delete|Change role/ })).not.toBeInTheDocument();
});
it('filters workshops by capability and navigates profile, related jobs and orders', async () => {
  const user = route('/admin/workshops');
  await screen.findByText('4 of 4 records');
  await user.selectOptions(screen.getByLabelText('Capability'), 'Sheet metal fabrication');
  expect(await screen.findByText('1 of 4 records')).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Vishwakarma Sheet Metal' }));
  expect(await screen.findByRole('heading', { name: 'Vishwakarma Sheet Metal' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Related jobs and marketplace activity' })).toBeVisible();
  expect(screen.getByText(/No verification|no verification/)).toBeVisible();
});
it('filters job status and opens matching, invitation and quotation records without award controls', async () => {
  const user = route('/admin/jobs');
  await screen.findByText('10 of 10 records');
  fireEvent.change(screen.getByLabelText('Search jobs'), { target: { value: 'mounting brackets' } });
  expect(await screen.findByText('1 of 10 records')).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Machine aluminium mounting brackets' }));
  expect(await screen.findByRole('heading', { name: 'Matching records' })).toBeVisible();
  expect(screen.getByRole('table', { name: 'Job match records' })).toHaveTextContent('92');
  expect(screen.getByRole('table', { name: 'Job quotations' })).toHaveTextContent('₹58,000.00');
  expect(screen.queryByRole('button', { name: /Award/ })).not.toBeInTheDocument();
});
it('shows platform-wide order values, source status, progress and related QC', async () => {
  route('/admin/orders/order-rework');
  expect(await screen.findByRole('heading', { name: 'order-rework' })).toBeVisible();
  expect(screen.getByText('₹64,000.00')).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50');
  expect(screen.getByRole('table', { name: 'Platform quality inspections' })).toHaveTextContent('inspection-rework');
  expect(screen.queryByRole('button', { name: /Change status|Payment/ })).not.toBeInTheDocument();
});
it('shows submitted QC history and rework as read-only information', async () => {
  route('/admin/quality/inspection-rework');
  expect(await screen.findByRole('heading', { name: 'inspection-rework' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Inspection history & rework findings' })).toBeVisible();
  expect(screen.getAllByText(/Bore surface finish exceeds/).length).toBeGreaterThan(0);
  expect(screen.getByText('Surface finish: Fail')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Record QC|Save draft|Request rework/ })).not.toBeInTheDocument();
});
it('filters overdue rework on the quality overview', async () => {
  const user = route('/admin/quality');
  await screen.findByText('5 of 5 records');
  await user.selectOptions(screen.getByLabelText('QC status'), 'overdue');
  expect(await screen.findByText('1 of 5 records')).toBeVisible();
  expect(screen.getByRole('table')).toHaveTextContent('inspection-overdue');
});
it.each(['users', 'workshops', 'jobs', 'orders', 'quality'])('handles missing %s records', async section => {
  route('/admin/' + section + '/missing');
  expect(await screen.findByRole('heading', { name: 'Record unavailable' })).toBeVisible();
  expect(screen.getByRole('link', { name: /^Return to/ })).toHaveAttribute('href', '/admin/' + section);
});
it.each(['buyer-1', 'workshop-user-1', 'inspector-1'])('denies admin UI to %s without requesting admin data', async actor => {
  const data = createMockService(); const read = vi.spyOn(data.admin, 'getOverview');
  route('/admin/users', data, actor);
  expect(await screen.findByRole('heading', { name: 'Access restricted' })).toBeVisible();
  expect(read).not.toHaveBeenCalled();
});
it('renders actual loading and a recoverable service error', async () => {
  const data = createMockService(); vi.spyOn(data.admin, 'getOverview').mockRejectedValue(new Error('Platform unavailable'));
  const user = route('/admin/dashboard', data);
  expect(await screen.findByRole('alert')).toHaveTextContent('Platform unavailable');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Platform unavailable');
});
it('does not render fabricated dashboard counts while loading', async () => {
  const data = createMockService(); vi.spyOn(data.admin, 'getOverview').mockImplementation(() => new Promise<never>(() => {}));
  route('/admin/dashboard', data);
  expect(await screen.findByText('Loading platform operations…')).toBeVisible();
  expect(screen.queryByRole('group', { name: 'Total registered users' })).not.toBeInTheDocument();
});
it('shows meaningful empty data and zero counts', async () => {
  const data = createMockService();
  const empty: AdminOverview = { users: [], workshops: [], jobs: [], orders: [], inspections: [], matches: [], invitations: [], quotes: [], activity: [] };
  vi.spyOn(data.admin, 'getOverview').mockResolvedValue(empty);
  route('/admin/dashboard', data);
  expect(await screen.findByRole('group', { name: 'Total registered users' })).toHaveTextContent('0');
  expect(screen.getByText('No operational alerts match the current demo rules.')).toBeVisible();
});
it('clears empty search results and retains native keyboard links', async () => {
  const user = route('/admin/orders');
  await screen.findByText('6 of 6 records');
  fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'no-such-order' } });
  expect(await screen.findByRole('heading', { name: 'No records found' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  await screen.findByText('6 of 6 records');
  const link = screen.getByRole('link', { name: 'order-rework' });
  link.focus(); await user.keyboard('{Enter}');
  expect(await screen.findByRole('heading', { name: 'order-rework' })).toBeVisible();
});
