import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { FilterPanel, NavigationTabs, Pagination, SearchField } from './design-system';
import { DesignSystemPreview } from '@/app/DesignSystemPreview';

it('keeps pagination bounded with named controls and live page feedback', async () => {
  const change = vi.fn(); const user = userEvent.setup();
  const view = render(<Pagination page={1} pageCount={2} onPageChange={change} />);
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Next' })); expect(change).toHaveBeenCalledWith(2);
  view.rerender(<Pagination page={2} pageCount={2} onPageChange={change} />);
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.getByText('Page 2 of 2')).toHaveAttribute('aria-live', 'polite');
  view.rerender(<Pagination page={1} pageCount={1} onPageChange={change} />);
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
it('keeps search visibly labelled with unique field IDs and forwards input handlers', async () => {
  const change = vi.fn(); render(<><SearchField label="Search materials" onChange={change} /><SearchField label="Search capabilities" /></>);
  const field = screen.getByRole('searchbox', { name: 'Search materials' });
  expect(field.id).not.toBe(screen.getByRole('searchbox', { name: 'Search capabilities' }).id);
  await userEvent.setup().type(field, 'CNC'); expect(change).toHaveBeenCalledTimes(3);
});
it('uses native disclosure semantics and canonical navigation links', async () => {
  render(<MemoryRouter initialEntries={['/buyer/jobs']}><FilterPanel title="Process filters"><p>Machining</p></FilterPanel><NavigationTabs label="Browse jobs" items={[{ label: 'Jobs', to: '/buyer/jobs' }, { label: 'Orders', to: '/buyer/orders' }]} /></MemoryRouter>);
  await userEvent.setup().click(screen.getByText('Process filters')); expect(screen.getByText('Process filters').closest('details')).toHaveAttribute('open');
  expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute('href', '/buyer/orders');
});
it('filters and paginates design specimens without exposing a business mutation', async () => {
  render(<DesignSystemPreview />); const user = userEvent.setup();
  expect(screen.getByRole('table', { name: 'Design token specimens' })).toHaveTextContent('Cobalt');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('table', { name: 'Design token specimens' })).toHaveTextContent('Slate');
  await user.type(screen.getByRole('searchbox', { name: 'Search design tokens' }), 'no token');
  expect(screen.getByRole('heading', { name: 'No matching tokens' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Preview confirmation' }));
  expect(screen.getByRole('dialog', { name: 'Shared confirmation preview' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Close preview' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
