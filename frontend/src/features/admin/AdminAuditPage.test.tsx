import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { ServicesContext } from '@/app/services';
import { createMockService } from '@/services/adapters/mock';
import type { AuditService } from '@/services/platform';
import { AdminAuditPage } from './AdminAuditPage';

/** M13 regression: two filter changes before a re-render must both apply (one used to be lost). */
function Location() {
  return <output data-testid="search">{useLocation().search}</output>;
}

it('changing two filters in quick succession keeps both changes', async () => {
  const list = vi.fn<AuditService['list']>(async () => ({ items: [], page: 1, totalPages: 1, total: 0 }));
  const data = { ...createMockService(), audit: { list, orderHistory: vi.fn() } };
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ServicesContext value={data}><MemoryRouter initialEntries={['/admin/audit?orderId=order-123']}>
      <Routes><Route path="/admin/audit" element={<><AdminAuditPage /><Location /></>} /></Routes>
    </MemoryRouter></ServicesContext>
  </QueryClientProvider>);

  const order = await screen.findByLabelText('Order ID');
  expect(order).toHaveValue('order-123');
  // Both events are handled before React re-renders the page.
  act(() => {
    fireEvent.change(order, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'WORKSHOP_VERIFICATION_VERIFIED' } });
  });
  await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?action=WORKSHOP_VERIFICATION_VERIFIED'));
  expect(screen.getByLabelText('Order ID')).toHaveValue('');
  await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'WORKSHOP_VERIFICATION_VERIFIED', orderId: '' })));
});
