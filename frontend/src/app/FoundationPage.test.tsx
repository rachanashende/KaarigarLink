import { beforeEach, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppProviders } from './App';
import { AppRoutes } from './router';
import { createServices } from '@/services';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';
import { roleOrder } from './roles';
import type { Role } from '@/types';

/** The platform guide at /foundation (M13: replaces the Phase 0 placeholder). */
beforeEach(() => sessionStorage.clear());
function setup(path: string, role?: Role) {
  if (role) sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: role === 'workshop' ? 'workshop-user-1' : role + '-1', expiresAt: Date.now() + 60000 }));
  const data = createServices();
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}

it('signed out: the guide is public, accurate and offers sign-in; no Phase 0 placeholder text remains', async () => {
  const user = setup('/foundation');
  expect(await screen.findByRole('heading', { level: 1, name: 'Platform guide' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'How an order moves' })).toBeVisible();
  for (const role of ['Buyer', 'Workshop', 'Inspector', 'Admin']) expect(screen.getByRole('heading', { level: 3, name: role })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Demo workspace' })).toBeVisible();
  expect(document.body).not.toHaveTextContent(/Phase 0|will follow|reserved|not implemented/i);
  expect(screen.queryByRole('navigation', { name: 'Workspace navigation' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  await user.click(screen.getAllByRole('link', { name: 'Sign in' })[0]!);
  expect(await screen.findByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
});

it.each(roleOrder)('signed in as %s: the guide opens inside the workspace with the role\'s own shortcuts', async role => {
  const user = setup('/foundation', role);
  expect(await screen.findByRole('heading', { level: 1, name: 'Platform guide' })).toBeVisible();
  const nav = screen.getByRole('navigation', { name: 'Workspace navigation' });
  expect(within(nav).getByRole('link', { name: 'Platform guide' })).toHaveAttribute('aria-current', 'page');
  expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Platform guide')).toBeVisible();
  // Shortcuts only for the signed-in role (other roles' areas are protected).
  expect(screen.getAllByRole('navigation', { name: / shortcuts$/ })).toHaveLength(1);
  const label = { buyer: 'Buyer', workshop: 'Workshop', inspector: 'Inspector', admin: 'Admin' }[role];
  expect(screen.getByRole('navigation', { name: label + ' shortcuts' })).toBeVisible();

  await user.click(screen.getByRole('link', { name: 'Go to my workspace' }));
  expect(await screen.findByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  expect(screen.queryByRole('heading', { level: 1, name: 'Platform guide' })).not.toBeInTheDocument();

  // And back through the menu item.
  await user.click(within(screen.getByRole('navigation', { name: 'Workspace navigation' })).getByRole('link', { name: 'Platform guide' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Platform guide' })).toBeVisible();
});

it('a role shortcut opens that role\'s page', async () => {
  const user = setup('/foundation', 'buyer');
  await user.click(within(await screen.findByRole('navigation', { name: 'Buyer shortcuts' })).getByRole('link', { name: 'Post a job' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Post a manufacturing job' })).toBeVisible();
});

it('/ goes to sign-in when signed out and to the role workspace when signed in, never to the guide', async () => {
  setup('/');
  expect(await screen.findByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
});
it.each(roleOrder)('/ for a signed-in %s opens the role dashboard', async role => {
  setup('/', role);
  expect(await screen.findByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  expect(screen.queryByRole('heading', { level: 1, name: 'Platform guide' })).not.toBeInTheDocument();
});

it('role protection is unchanged: another role\'s area is still restricted, and the guide links back', async () => {
  const user = setup('/admin/dashboard', 'buyer');
  expect(await screen.findByRole('heading', { level: 1, name: 'Access restricted' })).toBeVisible();
  await user.click(within(screen.getByRole('navigation', { name: 'Workspace navigation' })).getByRole('link', { name: 'Platform guide' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Platform guide' })).toBeVisible();
  expect(screen.queryByRole('navigation', { name: 'Admin shortcuts' })).not.toBeInTheDocument();
});
