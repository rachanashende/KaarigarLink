import { Dialog } from './ui/dialog';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DataTable } from './DataTable';
import { ErrorState, LoadingState } from './feedback';
import { StatusBadge } from './StatusBadge';

it('renders an accessible data table and text statuses', () => {
  render(<DataTable caption="Module readiness" columns={[{ key: 'name', header: 'Module', cell: row => row.name }, { key: 'state', header: 'State', cell: () => <StatusBadge tone="info">Available</StatusBadge> }]} rows={[{ id: 'shell', name: 'Shared shell' }]} rowKey={row => row.id} />);
  const table = screen.getByRole('table', { name: 'Module readiness' });
  expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
  expect(within(table).getByText('Available')).toBeVisible();
});
it('replaces empty tables with a meaningful empty state', () => {
  render(<DataTable caption="Records" columns={[]} rows={[]} rowKey={() => ''} emptyTitle="No records" />);
  expect(screen.getByRole('heading', { name: 'No records' })).toBeVisible();
});
it('announces loading and errors', () => {
  render(<><LoadingState label="Restoring session" /><ErrorState message="Please retry." /></>);
  expect(screen.getByRole('status')).toHaveTextContent('Restoring session');
  expect(screen.getByRole('alert')).toHaveTextContent('Please retry.');
});
it('keeps keyboard focus in a busy dialog with no enabled controls', () => {
  render(<Dialog open onOpenChange={() => {}} title="Saving" busy><button disabled>Saving…</button></Dialog>);
  const dialog = screen.getByRole('dialog', { name: 'Saving' });
  dialog.focus();
  expect(fireEvent.keyDown(dialog, { key: 'Tab', cancelable: true })).toBe(false);
  expect(dialog).toHaveFocus();
});
