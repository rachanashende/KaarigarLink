import * as calendar from '@/services/jobs';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppProviders } from '@/app/App';
import { AppRoutes } from '@/app/router';
import { createMockService } from '@/services/adapters/mock';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';

const routes = [
  ['/workshop', 'Workshop workspace'],
  ['/workshop/dashboard', 'Workshop workspace'],
  ['/workshop/invitations', 'Invitations'],
  ['/workshop/invitations/KL-2841', 'Invitation details'],
  ['/workshop/orders', 'My orders'],
  ['/workshop/orders/order-production', 'Order details'],
  ['/workshop/profile', 'Workshop profile'],
  ['/workshop/settings', 'Settings'],
  ['/workshop/onboarding', 'Workshop onboarding'],
] as const;
const legacyKeys = ['kaarigarlink-workshop-data-v1', 'kaarigarlink-demo-quotes-v1', 'kaarigarlink-demo-onboarding-v1', 'kaarigarlink-demo-workshop-session'];

const legacyData = new Map<string, string>();
const legacyStorage = {
  getItem: vi.fn((key: string) => legacyData.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { legacyData.set(key, value); }),
  removeItem: vi.fn((key: string) => { legacyData.delete(key); }),
  clear: vi.fn(() => legacyData.clear()),
  key: (index: number) => [...legacyData.keys()][index] ?? null,
  get length() { return legacyData.size; },
};
beforeEach(() => {
  vi.spyOn(calendar, 'todayInIndia').mockReturnValue('2026-11-19');
  sessionStorage.clear();
  legacyData.clear();
  for (const method of [legacyStorage.getItem, legacyStorage.setItem, legacyStorage.removeItem, legacyStorage.clear]) method.mockClear();
  vi.stubGlobal('localStorage', legacyStorage);
});
function setup(path: string, actor: string | null = 'workshop-user-1') {
  if (actor) sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: actor, expiresAt: Date.now() + 60000 }));
  const data = createMockService();
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
it.each(routes)('renders guarded %s without loading standalone records or writing during rendering', async (path, title) => {
  for (const key of legacyKeys) window.localStorage.setItem(key, 'corrupt private standalone records');
  const read = legacyStorage.getItem;
  const write = legacyStorage.setItem;
  setup(path);
  write.mockClear();
  expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeVisible();
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getByRole('region', { name: 'Workshop integration status' })).toHaveTextContent('Ravi Patil');
  expect(screen.getByRole('heading', { name: 'Workshop workflow availability' })).toBeVisible();
  for (const name of ['Rohan Sharma', 'Precision Works', 'Apex Components']) expect(screen.queryByText(name, { exact: true })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Loading shared workshop records...')).not.toBeInTheDocument());
  for (const button of within(screen.getByRole('main')).queryAllByRole('button')) {
    const row = button.closest('tr');
    const supportedQuote = path === '/workshop/invitations' && row && within(row).queryByText('quote-1', { exact: true }) && ['Edit quote', 'Withdraw quote'].includes(button.textContent ?? '');
    if (supportedQuote) expect(button).toBeEnabled(); else expect(button).toBeDisabled();
  }
  expect(read.mock.calls.filter(([key]) => legacyKeys.includes(key))).toHaveLength(0);
  expect(write).not.toHaveBeenCalled();
  expect(legacyStorage.removeItem).not.toHaveBeenCalled();
  expect(legacyStorage.clear).not.toHaveBeenCalled();
});
it.each(['buyer-1', 'inspector-1', 'admin-1'].flatMap(actor => routes.map(([path]) => [actor, path] as const)))('denies %s access to %s', async (actor, path) => {
  setup(path, actor);
  expect(await screen.findByRole('heading', { name: 'Access restricted' })).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Workshop integration status' })).not.toBeInTheDocument();
});
it.each(['/workshop/onboarding', '/workshop/orders/order-production'])('requires the shared session for %s even when a legacy session exists', async path => {
  sessionStorage.setItem('kaarigarlink-demo-workshop-session', 'active');
  setup(path, null);
  expect(await screen.findByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
});
it('navigates with the keyboard and uses the single shared logout flow', async () => {
  const user = setup('/workshop');
  await screen.findByRole('heading', { name: 'Workshop workspace' });
  const link = within(screen.getByRole('navigation', { name: 'Workspace navigation' })).getByRole('link', { name: 'Invitations' });
  link.focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('heading', { name: 'Invitations' })).toBeVisible();
  expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Invitations')).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Log out' })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Log out' }));
  await user.click(within(screen.getByRole('dialog', { name: 'Log out of KaarigarLink?' })).getByRole('button', { name: 'Log out' }));
  expect(await screen.findByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
  expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBeNull();
});
it('keeps unknown workshop paths behind the same role guard and shows the shared 404', async () => {
  setup('/workshop/not-a-page');
  expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
});
