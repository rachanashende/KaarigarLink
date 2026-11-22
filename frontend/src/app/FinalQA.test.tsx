import { beforeEach, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppProviders } from './App';
import { AppRoutes } from './router';
import { createMockService } from '@/services/adapters/mock';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';

beforeEach(() => sessionStorage.clear());
function setup(path: string) {
  const actor = path.startsWith('/buyer') ? 'buyer-1' : path.startsWith('/workshop') ? 'workshop-user-1' : null;
  if (actor) sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: actor, expiresAt: Date.now() + 60000 }));
  const data = createMockService();
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
it('keeps the sidebar visible label inside its accessible name before and after collapse', async () => {
  const user = setup('/buyer/dashboard');
  const collapse = await screen.findByRole('button', { name: 'Collapse sidebar' });
  expect(collapse).toHaveTextContent('Collapse sidebar');
  await user.click(collapse);
  await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
  expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveTextContent('Collapse sidebar');
});
it('distinguishes the recent-job overview landmark from its scrollable table region', async () => {
  setup('/buyer/dashboard');
  const overview = await screen.findByRole('region', { name: 'Recent job overview' });
  expect(within(overview).getByRole('heading', { name: 'Recent manufacturing jobs' })).toBeVisible();
  expect(within(overview).getByRole('region', { name: 'Recent manufacturing jobs' })).toBeVisible();
});
it('keeps the foundation return link in an identifiable navigation landmark', async () => {
  setup('/foundation');
  const navigation = await screen.findByRole('navigation', { name: 'Foundation navigation' });
  expect(within(navigation).getByRole('link', { name: 'Return to workspace' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('region', { name: 'Foundation scope' })).toHaveAttribute('tabindex', '-1');
});

it.each(['/login', '/foundation'])('keeps the %s skip link explicitly in sequential keyboard navigation', async path => {
  setup(path);
  expect(await screen.findByRole('link', { name: 'Skip to content' })).toHaveAttribute('tabindex', '0');
});

it('exposes quotation commands as a named group rather than naming a generic element', async () => {
  setup('/workshop/invitations');
  const commands = await screen.findByRole('group', { name: 'Commands for quote-1' });
  expect(within(commands).getByRole('button', { name: 'Edit quote' })).toBeVisible();
  expect(within(commands).getByRole('button', { name: 'Withdraw quote' })).toBeVisible();
});