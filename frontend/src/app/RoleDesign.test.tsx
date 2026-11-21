import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppProviders } from './App';
import { AppRoutes } from './router';
import { createMockService } from '@/services/adapters/mock';
import { createMockStore } from '@/services/mock/store';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';
import * as calendar from '@/services/jobs';

beforeEach(() => { sessionStorage.clear(); vi.spyOn(calendar, 'todayInIndia').mockReturnValue('2026-11-19'); });
function setup(path: string, actor: string, data = createMockService()) {
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: actor, expiresAt: Date.now() + 60000 }));
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
it('shows authorized workshop opportunity queues and refreshes them after a confirmed response without an order', async () => {
  const store = createMockStore(); const data = createMockService(store);
  await data.buyer.inviteWorkshop('buyer-1', 'job-1', 'workshop-3');
  const before = store.snapshot();
  const user = setup('/workshop/dashboard', 'workshop-user-3', data);
  expect(await screen.findByRole('group', { name: 'Available invitation responses' })).toHaveTextContent('1');
  expect(screen.getByRole('group', { name: 'Ready to quote' })).toHaveTextContent('0');
  await user.click(within(screen.getByRole('region', { name: 'Workshop opportunity actions' })).getByRole('link', { name: 'Machine aluminium mounting brackets' }));
  await user.click(await screen.findByRole('button', { name: 'Accept invitation' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Accept invitation' }));
  expect(await screen.findByText('Mock invitation accepted.')).toBeVisible();
  await user.click(within(screen.getByRole('navigation', { name: 'Workshop pages' })).getByRole('link', { name: 'Workshop overview' }));
  expect(await screen.findByRole('group', { name: 'Ready to quote' })).toHaveTextContent('1');
  expect(store.snapshot().orders).toEqual(before.orders);
  expect(store.snapshot().jobs).toEqual(before.jobs);
});
it('shows only submitted inspector activity and workshop-owned QC attention', async () => {
  const store = createMockStore(); const data = createMockService(store);
  const source = await data.workshop.getWorkspace('workshop-user-1'); const before = store.snapshot();
  setup('/workshop/dashboard', 'workshop-user-1', data);
  const activity = await screen.findByRole('region', { name: 'Recent workshop QC activity' });
  const expected = source.orders.flatMap(row => row.inspections.flatMap(item => item.history)).length;
  expect(within(activity).getAllByRole('link')).toHaveLength(Math.min(4, expected));
  expect(screen.getByRole('region', { name: 'Workshop quality attention' })).toHaveTextContent('Inspector decisions remain read-only.');
  expect(store.snapshot()).toEqual(before);
});
it('retains quote validation and cancellation in the restyled editor', async () => {
  const store = createMockStore(); const data = createMockService(store); const before = store.snapshot();
  const user = setup('/workshop/invitations/seed-invitation-1', 'workshop-user-1', data);
  await user.click(await screen.findByRole('button', { name: 'Edit quote' }));
  await user.clear(screen.getByLabelText('Quoted total (INR)')); await user.type(screen.getByLabelText('Quoted total (INR)'), '0');
  await user.click(screen.getByRole('button', { name: 'Review mock quotation' }));
  expect(screen.getByLabelText('Quoted total (INR)')).toHaveAttribute('aria-invalid', 'true');
  await user.click(screen.getByRole('button', { name: 'Cancel quotation' }));
  expect(screen.queryByRole('form', { name: 'Mock quotation form' })).not.toBeInTheDocument();
  expect(store.snapshot()).toEqual(before);
});
it('connects inspector priorities to canonical assignment filters', async () => {
  const store = createMockStore(); const data = createMockService(store); const before = store.snapshot();
  const user = setup('/inspector/dashboard', 'inspector-1', data);
  await user.click(await screen.findByRole('link', { name: 'Review pending inspections' }));
  const table = await screen.findByRole('table', { name: 'Assigned inspections' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(before.inspections.filter(item => item.inspectorId === 'inspector-1' && item.decision === 'PENDING').length);
  for (const row of rows) expect(row).toHaveTextContent('QC pending');
  expect(store.snapshot()).toEqual(before);
});
it('separates draft findings from the proposed rework outcome without recording a decision', async () => {
  const store = createMockStore(); const data = createMockService(store); const before = store.snapshot();
  const user = setup('/inspector/inspections/inspection-qc', 'inspector-1', data);
  const outcome = await screen.findByRole('region', { name: 'Proposed QC outcome' });
  expect(outcome).toHaveTextContent('Acceptance cannot include failed checks');
  await user.selectOptions(within(outcome).getByLabelText('Proposed QC decision'), 'REWORK');
  expect(within(outcome).getByLabelText('Rework reason')).toBeVisible();
  expect(within(outcome).getByLabelText('Corrective action notes')).toBeVisible();
  expect(within(outcome).getByLabelText('Rework deadline')).toBeVisible();
  expect(store.snapshot()).toEqual(before);
});
it('keeps accepted inspection history immutable and unavailable for new decisions', async () => {
  setup('/inspector/inspections/inspection-closed', 'inspector-1');
  expect(await screen.findByText('Submitted records are immutable. Current draft findings never replace a historical decision.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review QC decision' })).not.toBeInTheDocument();
});
it('preserves admin directory filtering, record context and read-only authority', async () => {
  const store = createMockStore(); const data = createMockService(store); const before = store.snapshot();
  const user = setup('/admin/users', 'admin-1', data);
  await user.selectOptions(await screen.findByLabelText('Role'), 'buyer');
  expect(screen.getByRole('status')).toHaveTextContent('1 of 7 records');
  await user.click(screen.getByText('Compact record summaries'));
  expect(within(screen.getByRole('article', { name: 'Ananya Shah summary' })).getByRole('link', { name: 'Open details for Ananya Shah' })).toHaveAttribute('href', '/admin/users/buyer-1');
  await user.click(within(screen.getByRole('table')).getByRole('link', { name: 'Ananya Shah' }));
  const account = await screen.findByRole('region', { name: 'Account information' });
  expect(account).toHaveTextContent('Not supplied by the current contract');
  expect(screen.queryByRole('button', { name: /Suspend|Delete|Change role/ })).not.toBeInTheDocument();
  expect(store.snapshot()).toEqual(before);
});
it('uses a shared role header and preserves admin-only authority', async () => {
  setup('/admin/dashboard', 'admin-1');
  expect(await screen.findByRole('complementary', { name: 'Administrative authority' })).toHaveTextContent('No moderation, award, production or payment command');
  expect(document.querySelector('.role-workspace .workspace-heading')).toBeInTheDocument();
});

it('preserves the verified Buyer header selectors and content after sharing the primitive', async () => {
  setup('/buyer/dashboard', 'buyer-1');
  expect(await screen.findByRole('heading', { name: 'Buyer workspace' })).toBeVisible();
  expect(document.querySelector('.buyer-heading.workspace-heading')).toBeInTheDocument();
  expect(document.querySelector('.buyer-workspace')).toBeInTheDocument();
});
