import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppProviders } from '@/app/App';
import { AppRoutes } from '@/app/router';
import { roleOrder } from '@/app/roles';
import { createServices } from '@/services';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';
import { fixtures } from '@/services/mock/fixtures';
import type { Role } from '@/types';
import { publicCapabilities } from './content';

beforeEach(() => sessionStorage.clear());
function setup(path = '/', role?: Role) {
  if (role) sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: role === 'workshop' ? 'workshop-user-1' : role + '-1', expiresAt: Date.now() + 60000 }));
  const data = createServices(); const list = vi.spyOn(data, 'list');
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return { user: userEvent.setup(), list };
}
it('opens the public homepage anonymously with real sections and no protected data queries', async () => {
  const { list } = setup();
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Where manufacturing meets opportunity.');
  expect(document.title).toBe('KaarigarLink · Manufacturing connections');
  const nav = screen.getByRole('navigation', { name: 'Public navigation' });
  for (const label of ['How It Works', 'Capabilities', 'Why KaarigarLink']) {
    const link = within(nav).getByRole('link', { name: label });
    expect(document.querySelector(link.getAttribute('href')!)).toBeInTheDocument();
  }
  expect(screen.getByRole('complementary', { name: 'Current demo availability' })).toHaveTextContent('not yet enabled');
  expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  expect(screen.queryByText(fixtures.users[0]!.email)).not.toBeInTheDocument();
  expect(list).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBeNull();
});
it('uses only capability categories supported by current seed jobs/workshops', () => {
  const supported = new Set([...fixtures.jobs.map(job => job.capability), ...fixtures.workshops.flatMap(workshop => workshop.capabilities)]);
  for (const item of publicCapabilities) expect(supported.has(item.name), item.name).toBe(true);
});
it.each(['Find a Workshop', 'Join as a Workshop', 'Get Started', 'Log In'])('%s leads to existing login without signing in or registering', async label => {
  const { user } = setup(); await screen.findByRole('heading', { level: 1 });
  await user.click(screen.getAllByRole('link', { name: label })[0]!);
  expect(await screen.findByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
  expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBeNull();
  for (const name of ['Buyer', 'Workshop', 'Inspector', 'Admin']) expect(screen.getByRole('button', { name })).toBeEnabled();
});
it.each(roleOrder)('retains the authenticated default redirect for %s', async role => {
  setup('/', role);
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(role[0]!.toUpperCase() + role.slice(1) + ' workspace');
  expect(screen.queryByRole('heading', { name: /Where manufacturing/ })).not.toBeInTheDocument();
});
it.each(roleOrder)('keeps anonymous %s workspace access guarded', async role => {
  setup('/' + role + '/dashboard');
  expect(await screen.findByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: /Where manufacturing/ })).not.toBeInTheDocument();
});
it('preserves an authenticated buyer record deep link', async () => {
  setup('/buyer/jobs/job-1', 'buyer');
  expect(await screen.findByRole('heading', { name: 'Machine aluminium mounting brackets' })).toBeVisible();
});
it('exposes an accessible mobile navigation disclosure with existing dialog cancellation', async () => {
  const { user } = setup(); await screen.findByRole('heading', { level: 1 });
  const trigger = screen.getByRole('button', { name: 'Open public navigation' }); await user.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const dialog = screen.getByRole('dialog', { name: 'KaarigarLink navigation' });
  expect(within(dialog).getByRole('link', { name: 'Capabilities' })).toHaveAttribute('href', '#capabilities');
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
