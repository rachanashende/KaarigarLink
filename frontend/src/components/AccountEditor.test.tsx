import { expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServicesContext } from '@/app/services';
import { AuthContext, type AuthContextValue } from '@/features/auth/context';
import { createMockService } from '@/services/adapters/mock';
import type { AccountProfile, AccountService } from '@/services/account';
import { AccountEditor } from './AccountEditor';

const user = { id: 'u1', name: 'Asha Buyer', email: 'asha@example.test', role: 'buyer' as const };

function setup(account: AccountService | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth: AuthContextValue = {
    user, kind: account ? 'live' : 'mock', notice: null,
    signIn: vi.fn(), demoSignIn: vi.fn(), signOut: vi.fn(), refreshUser: vi.fn().mockResolvedValue(undefined),
  };
  const data = { ...createMockService(), ...(account ? { account } : {}) };
  render(<QueryClientProvider client={client}><ServicesContext value={data}><AuthContext value={auth}><AccountEditor /></AuthContext></ServicesContext></QueryClientProvider>);
  return { client, events: userEvent.setup() };
}

function fakeAccount(): AccountService & { server: AccountProfile } {
  const server: AccountProfile = { id: 'u1', name: 'Asha Buyer', email: 'asha@example.test', role: 'buyer', phone: null };
  return {
    server,
    get: vi.fn(async () => ({ ...server })),
    update: vi.fn(async input => { server.name = input.name; server.phone = input.phone || null; return { ...server }; }),
    changePassword: vi.fn(async () => undefined),
  };
}

it('keeps unsaved edits when the profile is refetched in the background (M13 regression)', async () => {
  const account = fakeAccount();
  const { client, events } = setup(account);
  const name = await screen.findByLabelText('Full name');
  expect(name).toHaveValue('Asha Buyer');
  await events.clear(name);
  await events.type(name, 'Asha Typing');
  account.server.name = 'Changed Elsewhere';
  await act(() => client.invalidateQueries());
  expect(account.get).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('Full name')).toHaveValue('Asha Typing');

  await events.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByText('Profile saved.')).toBeVisible();
  expect(account.update).toHaveBeenCalledWith({ name: 'Asha Typing', phone: '' });
});

it('validates the password change before calling the service and clears the fields on success', async () => {
  const account = fakeAccount();
  const { events } = setup(account);
  await events.type(await screen.findByLabelText('Current password'), 'OldPassw0rd');
  await events.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
  await events.type(screen.getByLabelText('Confirm new password'), 'Different1!');
  await events.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText('The new passwords do not match.')).toBeVisible();
  expect(account.changePassword).not.toHaveBeenCalled();

  await events.clear(screen.getByLabelText('Confirm new password'));
  await events.type(screen.getByLabelText('Confirm new password'), 'NewPassw0rd!');
  await events.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText(/Password changed/)).toBeVisible();
  expect(account.changePassword).toHaveBeenCalledWith({ currentPassword: 'OldPassw0rd', newPassword: 'NewPassw0rd!', confirmPassword: 'NewPassw0rd!' });
  expect(screen.getByLabelText('Current password')).toHaveValue('');
});

it('mock mode shows the demo identity read-only, with no password form', async () => {
  setup(undefined);
  expect(screen.getByText(/Demo account/)).toBeVisible();
  expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
});
