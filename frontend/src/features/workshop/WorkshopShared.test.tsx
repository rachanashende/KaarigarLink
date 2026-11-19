import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppProviders } from '@/app/App';
import { AppRoutes } from '@/app/router';
import { createMockService } from '@/services/adapters/mock';
import { createMockStore } from '@/services/mock/store';
import { fixtures } from '@/services/mock/fixtures';
import { DEMO_DATA_KEY } from '@/services/mock/persistence';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';

beforeEach(() => sessionStorage.clear());
function setup(path: string, service = createMockService(), actor = 'workshop-user-1') {
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: actor, expiresAt: Date.now() + 60000 }));
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data: service, auth: createMockAuthService(service) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
it('shows workshop-owned metrics derived from shared records without capacity or payment inventions', async () => {
  setup('/workshop');
  expect(await screen.findByRole('group', { name: 'Total invitations' })).toHaveTextContent('1');
  expect(screen.getByRole('group', { name: 'Submitted quotations' })).toHaveTextContent('1');
  expect(screen.getByRole('group', { name: 'Active orders' })).toHaveTextContent('4');
  expect(screen.getByRole('group', { name: 'Pending inspections' })).toHaveTextContent('1');
  expect(screen.getByRole('group', { name: 'Open rework requests' })).toHaveTextContent('2');
  expect(screen.getByRole('group', { name: 'Closed orders' })).toHaveTextContent('1');
  expect(screen.getByRole('heading', { name: 'Sahyadri Precision Works' })).toBeVisible();
  expect(screen.queryByText(/68%|Rohan|Deposit received/)).not.toBeInTheDocument();
});
it('links canonical invitations to real job briefs and only the workshop own quotations', async () => {
  const user = setup('/workshop/invitations');
  const table = await screen.findByRole('table', { name: 'Workshop invitations' });
  expect(table).toHaveTextContent('Machine aluminium mounting brackets');
  expect(table).toHaveTextContent('ACCEPTED');
  const quotes = screen.getByRole('table', { name: 'Workshop quotation history' });
  expect(quotes).toHaveTextContent('quote-1'); expect(quotes).not.toHaveTextContent('quote-2');
  expect(within(quotes).getAllByRole('row')).toHaveLength(8);
  await user.type(screen.getByLabelText('Search invitations'), 'no matching job');
  expect(screen.getByRole('heading', { name: 'No invitations recorded' })).toBeVisible();
  await user.clear(screen.getByLabelText('Search invitations'));
  await user.click(screen.getByRole('link', { name: 'seed-invitation-1' }));
  expect(await screen.findByText('Buyer budget')).toBeVisible();
  expect(screen.getByText('₹60,000.00')).toBeVisible();
  expect(screen.getByRole('table', { name: 'Workshop quotation history' })).toHaveTextContent('₹58,000.00');
  for (const label of ['Accept invitation', 'Decline invitation', 'Submit quote', 'Edit quote', 'Withdraw quote']) expect(screen.getByRole('button', { name: label })).toBeDisabled();
});
it('presents actual production, submitted rework and payment information separately', async () => {
  setup('/workshop/orders/order-production');
  expect(await screen.findByText('IN PRODUCTION')).toBeVisible();
  expect(screen.getAllByText('REWORK').length).toBeGreaterThan(0);
  expect(screen.getByText('No payment record supplied')).toBeVisible();
  expect(screen.getByText('Corrective action')).toBeVisible();
  expect(screen.getByRole('table', { name: 'Workshop production milestones' })).toHaveTextContent('Machining');
  expect(screen.getByRole('progressbar', { name: 'Production progress' })).toHaveAttribute('value', '25');
  expect(screen.getByRole('button', { name: 'Update production status' })).toBeDisabled();
  expect(screen.queryByText(/synthetic-dimensional-report|Save draft|Record QC decision/)).not.toBeInTheDocument();
});
it('does not infer paid payment from the historical PAID lifecycle state', async () => {
  setup('/workshop/orders/order-paid');
  expect(await screen.findByText('PAID')).toBeVisible();
  expect(screen.getByText('No payment record supplied')).toBeVisible();
});
it('shows canonical profile machinery, capabilities and capacity windows', async () => {
  setup('/workshop/profile');
  expect(await screen.findByRole('table', { name: 'Workshop machinery' })).toHaveTextContent('3-axis CNC mill');
  expect(screen.getByRole('table', { name: 'Published workshop capacity' })).toHaveTextContent('500 pieces');
  expect(screen.getByText('CNC machining', { exact: true })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Edit profile' })).toBeDisabled();
});
it.each([['/workshop/settings', 'workshop@kaarigarlink.example'], ['/workshop/onboarding', 'Canonical profile linked']])('shows supported account/profile linkage on %s without writes', async (path, value) => {
  setup(path);
  expect(await screen.findByText(value, { exact: true })).toBeVisible();
  for (const button of within(screen.getByRole('main')).getAllByRole('button')) expect(button).toBeDisabled();
});
it('shows onboarding required for an unmapped account instead of another profile', async () => {
  const seed = structuredClone(fixtures); seed.users.push({ id: 'new-workshop', role: 'workshop', name: 'New owner', email: 'new@example.test' });
  setup('/workshop/onboarding', createMockService(createMockStore(seed)), 'new-workshop');
  expect(await screen.findByRole('heading', { name: 'Workshop profile required' })).toBeVisible();
  expect(screen.queryByText('Sahyadri Precision Works')).not.toBeInTheDocument();
  expect(screen.getByText('new@example.test', { exact: true })).toBeVisible();
});
it.each(['/workshop/orders/order-production', '/workshop/invitations/seed-invitation-1'])('does not expose another workshop record through %s', async path => {
  setup(path, createMockService(), 'workshop-user-2');
  expect(await screen.findByRole('heading', { name: /^(Order|Invitation) unavailable$/ })).toBeVisible();
  expect(screen.queryByText('Machine conveyor bearing housings', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText('₹58,000.00')).not.toBeInTheDocument();
});
it('reports canonical mapping failures with a retry without falling back to demo data', async () => {
  const service = createMockService();
  vi.spyOn(service.workshop, 'getWorkspace').mockRejectedValueOnce(new Error('Mapping unavailable')).mockImplementation(() => createMockService().workshop.getWorkspace('workshop-user-1'));
  const user = setup('/workshop/profile', service);
  expect(await screen.findByRole('alert')).toHaveTextContent('Mapping unavailable');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('table', { name: 'Workshop machinery' })).toBeVisible();
});
it('shows shared loading state without fabricated metrics', async () => {
  const service = createMockService();
  vi.spyOn(service.workshop, 'getWorkspace').mockImplementation(() => new Promise(() => {}));
  setup('/workshop', service);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading shared workshop records'));
  expect(screen.queryByRole('group', { name: 'Active orders' })).not.toBeInTheDocument();
});
it('surfaces shared malformed-storage recovery while showing the original canonical seed', async () => {
  sessionStorage.setItem(DEMO_DATA_KEY, '{broken');
  const service = createMockService(createMockStore(fixtures, sessionStorage));
  setup('/workshop/profile', service);
  expect(await screen.findByRole('table', { name: 'Workshop machinery' })).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('Saved demo data could not be restored');
  expect(screen.getByRole('alert')).toHaveTextContent('same data for all roles');
  expect(sessionStorage.getItem(DEMO_DATA_KEY)).toBe('{broken');
});
