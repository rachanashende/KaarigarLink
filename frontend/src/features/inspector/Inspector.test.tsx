import * as calendar from '@/services/jobs';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '@/app/router';
import { AppProviders } from '@/app/App';
import { createMockService } from '@/services/adapters/mock';
import { createMockStore } from '@/services/mock/store';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';

beforeEach(() => { sessionStorage.clear(); vi.spyOn(calendar, 'todayInIndia').mockReturnValue('2026-11-19'); });
function route(path: string, data = createMockService(), actor = 'inspector-1') {
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: actor, expiresAt: Date.now() + 60000 }));
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
async function fillFindings(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText('Dimensional accuracy result');
  for (const label of ['Dimensional accuracy', 'Material conformity', 'Surface finish', 'Quantity verification']) fireEvent.change(screen.getByLabelText(label + ' result'), { target: { value: 'PASS' } });
  fireEvent.change(screen.getByLabelText('Overall inspection summary'), { target: { value: 'All measurements meet drawing revision B.' } });
  await user.upload(screen.getByLabelText('Dimensional accuracy evidence'), new File(['demo'], 'report.pdf', { type: 'application/pdf' }));
}
it('renders derived inspector metrics, assigned pending work, overdue follow-up and navigation', async () => {
  route('/inspector/dashboard');
  expect(await screen.findByRole('group', { name: 'Total assigned inspections' })).toHaveTextContent('5');
  expect(screen.getByRole('group', { name: 'Pending inspections' })).toHaveTextContent('1');
  expect(screen.getByRole('group', { name: 'Accepted inspections' })).toHaveTextContent('2');
  expect(screen.getByRole('group', { name: 'Rework requested' })).toHaveTextContent('2');
  expect(screen.getByRole('group', { name: 'Overdue inspections' })).toHaveTextContent('1');
  expect(screen.getByRole('table')).toHaveTextContent('inspection-qc');
  expect(screen.getByRole('link', { name: 'View rework cases' })).toHaveAttribute('href', '/inspector/rework');
});
it('lists, searches, filters, sorts and navigates assigned inspections', async () => {
  const user = route('/inspector/inspections');
  await screen.findByText('5 of 5 inspections');
  expect(screen.getByRole('table')).toHaveTextContent('Rework: 26 Nov 2026');
  fireEvent.change(screen.getByLabelText('Search inspections, orders, jobs or workshops'), { target: { value: 'sensor' } });
  expect(screen.getByText('1 of 5 inspections')).toBeVisible();
  await user.selectOptions(screen.getByLabelText('QC status'), 'ACCEPTED');
  expect(await screen.findByRole('heading', { name: 'No inspections found' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  await user.selectOptions(screen.getByLabelText('Sort deadlines'), 'latest');
  await user.click(screen.getByRole('link', { name: 'inspection-qc' }));
  expect(await screen.findByRole('heading', { name: 'inspection-qc' })).toBeVisible();
  expect(screen.getByText('Order production status')).toBeVisible();
  expect(screen.getByText('QC inspection status')).toBeVisible();
});
it('validates incomplete findings and preserves saved draft without changing QC status', async () => {
  const data = createMockService(); const user = route('/inspector/inspections/inspection-qc', data);
  await user.click(await screen.findByRole('button', { name: 'Review QC decision' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('inspection summary');
  fireEvent.change(screen.getByLabelText('Overall inspection summary'), { target: { value: 'Draft dimensional review is in progress.' } });
  await user.click(screen.getByRole('button', { name: 'Review QC decision' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('required checklist');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Draft saved. No QC decision');
  expect((await data.inspector.getInspection('inspector-1', 'inspection-qc')).inspection).toMatchObject({ decision: 'PENDING', draft: { summary: 'Draft dimensional review is in progress.' } });
});
it('confirms acceptance, blocks duplicate submits and updates read-only buyer QC', async () => {
  const data = createMockService(); const spy = vi.spyOn(data.inspector, 'submitDecision');
  const user = route('/inspector/inspections/inspection-qc', data); await fillFindings(user);
  await user.click(screen.getByRole('button', { name: 'Review QC decision' }));
  const dialog = screen.getByRole('dialog', { name: 'Confirm mock QC decision' });
  expect(dialog).toHaveTextContent('4 passed; 0 failed');
  await user.dblClick(within(dialog).getByRole('button', { name: 'Record QC decision' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Mock QC decision recorded');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Review QC decision' })).not.toBeInTheDocument());
  expect(spy).toHaveBeenCalledTimes(1);
  expect((await data.buyer.getOrder('buyer-1', 'order-qc')).order).toMatchObject({ status: 'QC_PENDING', qcStatus: 'ACCEPTED' });
  expect(screen.getByRole('heading', { name: 'Previous QC decisions & rework history' })).toBeVisible();
});
it('validates rework fields and records a confirmed failed finding', async () => {
  const data = createMockService(); const user = route('/inspector/inspections/inspection-qc', data); await fillFindings(user);
  await user.selectOptions(screen.getByLabelText('Proposed QC decision'), 'REWORK');
  await user.click(screen.getByRole('button', { name: 'Review QC decision' }));
  expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('rework reason');
  fireEvent.change(screen.getByLabelText('Rework reason'), { target: { value: 'Bore finish needs correction.' } });
  fireEvent.change(screen.getByLabelText('Corrective action notes'), { target: { value: 'Refinish and provide a new report.' } });
  fireEvent.change(screen.getByLabelText('Rework deadline'), { target: { value: '2020-01-01' } });
  await user.click(screen.getByRole('button', { name: 'Review QC decision' }));
  expect(screen.getByLabelText('Rework deadline')).toHaveAccessibleDescription(/future date/);
  fireEvent.change(screen.getByLabelText('Rework deadline'), { target: { value: '2099-01-01' } });
  fireEvent.change(screen.getByLabelText('Surface finish result'), { target: { value: 'FAIL' } });
  fireEvent.change(screen.getByLabelText('Surface finish notes'), { target: { value: 'Measured finish is outside specification.' } });
  await user.click(screen.getByRole('button', { name: 'Review QC decision' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record QC decision' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Mock QC decision recorded');
  expect((await data.buyer.getOrder('buyer-1', 'order-qc')).inspections[0]?.reworkDeadline).toBe('2099-01-01');
});
it('retains findings and reports a failed decision inside confirmation', async () => {
  const data = createMockService(); vi.spyOn(data.inspector, 'submitDecision').mockRejectedValue(new Error('QC service unavailable'));
  const user = route('/inspector/inspections/inspection-qc', data); await fillFindings(user);
  await user.click(screen.getByRole('button', { name: 'Review QC decision' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record QC decision' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('QC service unavailable');
  expect(screen.getByLabelText('Overall inspection summary')).toHaveValue('All measurements meet drawing revision B.');
});
it('shows rework overdue and historical decisions without automatic reinspection controls', async () => {
  route('/inspector/rework?status=overdue');
  expect(await screen.findByText('1 of 2 rework cases')).toBeVisible();
  expect(screen.getByRole('table')).toHaveTextContent('order-production');
  expect(screen.getByRole('table')).toHaveTextContent('pending backend support');
  expect(screen.queryByRole('button', { name: /Reinspect/ })).not.toBeInTheDocument();
});
it('shows full submitted history and immutable findings', async () => {
  const user = route('/inspector/history');
  expect(await screen.findByText('4 submitted decisions')).toBeVisible();
  expect(screen.getByRole('table')).toHaveTextContent('Meera Rao');
  expect(screen.getByRole('table')).toHaveTextContent('Bore surface finish exceeds');
  await user.selectOptions(screen.getByLabelText('Sort decisions'), 'oldest');
  expect(within(screen.getByRole('table')).getAllByRole('row')[1]).toHaveTextContent('order-production');
});
it.each(['missing', 'private'])('hides %s inspections from inspector detail', async id => {
  const store = createMockStore();
  if (id === 'private') store.commit(state => { state.inspections.find(item => item.id === 'inspection-qc')!.inspectorId = 'other'; });
  route('/inspector/inspections/' + (id === 'private' ? 'inspection-qc' : id), createMockService(store));
  expect(await screen.findByRole('heading', { name: 'Inspection unavailable' })).toBeVisible();
  expect(screen.queryByLabelText('Overall inspection summary')).not.toBeInTheDocument();
});
it.each(['/inspector/dashboard', '/inspector/inspections', '/inspector/rework', '/inspector/history', '/inspector/inspections/inspection-qc'])('blocks buyer access to %s', async path => {
  route(path, createMockService(), 'buyer-1');
  expect(await screen.findByRole('heading', { name: 'Access restricted' })).toBeVisible();
});
it.each(['listInspections', 'getInspection'] as const)('shows actual loading for %s', async method => {
  const data = createMockService(); vi.spyOn(data.inspector, method).mockImplementation(() => new Promise<never>(() => {}));
  route(method === 'listInspections' ? '/inspector/dashboard' : '/inspector/inspections/inspection-qc', data);
  expect(await screen.findByText(method === 'listInspections' ? 'Loading assigned inspections…' : 'Loading inspection details…')).toBeVisible();
});
it.each(['listInspections', 'getInspection'] as const)('surfaces service errors for %s', async method => {
  const data = createMockService(); vi.spyOn(data.inspector, method).mockRejectedValue(new Error('Inspection service unavailable'));
  route(method === 'listInspections' ? '/inspector/dashboard' : '/inspector/inspections/inspection-qc', data);
  expect(await screen.findByRole('alert')).toHaveTextContent('Inspection service unavailable');
});
it('handles an empty inspector workspace without fabricated metrics', async () => {
  const data = createMockService(); vi.spyOn(data.inspector, 'listInspections').mockResolvedValue([]);
  route('/inspector/dashboard', data);
  expect(await screen.findByRole('group', { name: 'Total assigned inspections' })).toHaveTextContent('0');
  expect(screen.getByRole('heading', { name: 'No inspections need attention' })).toBeVisible();
});
