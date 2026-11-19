import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppProviders } from './App';
import { AppRoutes } from './router';
import { createServices } from '@/services';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';
import { roleOrder } from './roles';
import type { Role } from '@/types';

beforeEach(() => sessionStorage.clear());
function setup(path = '/login', role?: Role, logoutFailure = false) {
  if (role) sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: role === 'workshop' ? 'workshop-user-1' : role + '-1', expiresAt: Date.now() + 60000 }));
  const data = createServices();
  const auth = createMockAuthService(data);
  if (logoutFailure) auth.logout = vi.fn().mockRejectedValue(new Error('Storage unavailable'));
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
it('validates email and password, associates errors and focuses the first invalid input', async () => {
  const user = setup();
  await user.click(await screen.findByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Enter a valid email address.')).toBeVisible();
  expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Use at least 8 characters.');
  expect(screen.getByLabelText('Email address')).toHaveFocus();
});
it('logs in with mock email/password and reports invalid credentials', async () => {
  const user = setup();
  await user.type(await screen.findByLabelText('Email address'), 'buyer@kaarigarlink.example');
  await user.type(screen.getByLabelText('Password'), 'wrong-pass');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
  await user.clear(screen.getByLabelText('Password'));
  await user.type(screen.getByLabelText('Password'), 'DemoPass123!');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByRole('heading', { name: 'Buyer workspace' })).toBeVisible();
});
it.each(roleOrder)('demo login redirects %s to its own workspace', async role => {
  const user = setup();
  await user.click(await screen.findByRole('button', { name: role === 'buyer' ? 'Buyer' : role === 'workshop' ? 'Workshop' : role === 'admin' ? 'Admin' : 'Inspector' }));
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(role[0]!.toUpperCase() + role.slice(1) + ' workspace');
});
it.each(roleOrder)('restores %s and redirects away from login', async role => {
  setup('/login', role);
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(role[0]!.toUpperCase() + role.slice(1) + ' workspace');
});
it('redirects anonymous protected access to login', async () => {
  setup('/admin/dashboard');
  expect(await screen.findByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
});
it('denies another role, including unimplemented subroutes, and returns to the correct home', async () => {
  const user = setup('/admin/workshops', 'buyer');
  expect(await screen.findByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Return to my workspace' }));
  expect(await screen.findByRole('heading', { name: 'Buyer workspace' })).toBeVisible();
});
it('logout cancellation preserves session; confirmation ends it', async () => {
  const user = setup('/buyer/dashboard', 'buyer');
  await user.click(await screen.findByRole('button', { name: 'Log out' }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(sessionStorage.getItem(MOCK_SESSION_KEY)).not.toBeNull();
  await user.click(screen.getByRole('button', { name: 'Log out' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log out' }));
  expect(await screen.findByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
  expect(sessionStorage.getItem(MOCK_SESSION_KEY)).toBeNull();
});
it('retains the session and surfaces a failed logout', async () => {
  const user = setup('/buyer/dashboard', 'buyer', true);
  await user.click(await screen.findByRole('button', { name: 'Log out' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable');
  expect(sessionStorage.getItem(MOCK_SESSION_KEY)).not.toBeNull();
});
it('opens mobile navigation and responds to Escape', async () => {
  const user = setup('/buyer/dashboard', 'buyer');
  await user.click(await screen.findByRole('button', { name: 'Open navigation' }));
  const dialog = screen.getByRole('dialog', { name: 'Workspace navigation' });
  expect(dialog).toBeVisible();
  dialog.dispatchEvent(new Event('cancel', { cancelable: true, bubbles: true }));
  await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
});
it('collapses desktop navigation without losing accessible link names', async () => {
  const user = setup('/buyer/dashboard', 'buyer');
  await user.click(await screen.findByRole('button', { name: 'Collapse sidebar' }));
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toHaveAccessibleName('Workspace navigation');
});
it('shows a 404 for unknown pages', async () => {
  setup('/unavailable');
  expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeVisible();
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
});

it('surfaces restoration errors and retries without admitting anonymous access', async () => {
  const data = createServices();
  const auth = createMockAuthService(data);
  vi.spyOn(auth, 'restoreSession').mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(null);
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/admin/dashboard']}><AppProviders services={{ data, auth }}><AppRoutes /></AppProviders></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Unable to restore your session' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Admin workspace' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'Sign in to KaarigarLink' })).toBeVisible();
});
