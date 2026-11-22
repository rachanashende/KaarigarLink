import { fixtures } from '@/services/mock/fixtures';
import userEvent from '@testing-library/user-event';
import { AppRoutes } from '@/app/router';
import { createMockStore } from '@/services/mock/store';
import { createMockService } from '@/services/adapters/mock';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppProviders } from '@/app/App';
import { createServices, type DataService } from '@/services';
import { createMockAuthService, MOCK_SESSION_KEY } from '@/services/adapters/mockAuth';
import { BuyerDashboard } from './BuyerDashboard';

beforeEach(() => sessionStorage.clear());
function renderDashboard(data: DataService = createServices()) {
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: 'buyer-1', expiresAt: Date.now() + 60000 }));
  render(<MemoryRouter><AppProviders services={{ data, auth: createMockAuthService(data) }}><BuyerDashboard /></AppProviders></MemoryRouter>);
}
it('renders dashboard counts, realistic jobs, activity and linked deadlines', async () => {
  renderDashboard();
  expect(await screen.findByRole('group', { name: 'Total posted jobs' })).toHaveTextContent(String(fixtures.jobs.length));
  expect(screen.getByRole('group', { name: 'Active jobs' })).toHaveTextContent(String(fixtures.jobs.filter(job => ['POSTED', 'QUOTING', 'AWARDED'].includes(job.status)).length));
  expect(screen.getByRole('group', { name: 'Pending quotations' })).toHaveTextContent(String(fixtures.quotes.filter(quote => quote.status === 'SUBMITTED').length));
  expect(screen.getByRole('group', { name: 'Orders in production' })).toHaveTextContent(String(fixtures.orders.filter(order => order.status === 'IN_PRODUCTION').length));
  expect(within(screen.getByRole('table')).getByRole('link', { name: /brass bushings/ })).toHaveAttribute('href', '/buyer/jobs/job-3');
  expect(screen.getByText(/Welcome back, Ananya/)).toBeVisible();
});
it('renders an actionable empty dashboard', async () => {
  const data = createServices();
  vi.spyOn(data.buyer, 'getDashboard').mockResolvedValue({ jobs: [], orders: [], quotes: [], activity: [] });
  renderDashboard(data);
  expect(await screen.findByRole('heading', { name: 'Post your first manufacturing job' })).toBeVisible();
  expect(screen.getByRole('group', { name: 'Total posted jobs' })).toHaveTextContent('0');
});
it('shows skeleton loading instead of fabricated metrics', async () => {
  const data = createServices();
  vi.spyOn(data.buyer, 'getDashboard').mockImplementation(() => new Promise(() => {}));
  renderDashboard(data);
  expect(await screen.findByText('Loading buyer data…')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Total posted jobs' })).not.toBeInTheDocument();
});
it('surfaces dashboard service errors', async () => {
  const data = createServices();
  vi.spyOn(data.buyer, 'getDashboard').mockRejectedValue(new Error('Service unavailable'));
  renderDashboard(data);
  expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
});


function renderBuyerRoute(path: string, data: DataService = createServices()) {
  sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ version: 1, userId: 'buyer-1', expiresAt: Date.now() + 60000 }));
  render(<MemoryRouter initialEntries={[path]}><AppProviders services={{ data, auth: createMockAuthService(data) }}><AppRoutes /></AppProviders></MemoryRouter>);
  return userEvent.setup();
}
function fillJob() {
  for (const [label, value] of [
    ['Job title', 'Test pump couplers'], ['Manufacturing capability', 'CNC machining'],
    ['Job description', 'Machine couplers for pump repairs.'], ['Material', 'Stainless steel 304'],
    ['Required machinery or capabilities', 'CNC lathe, drilling'], ['Quantity', '120'],
    ['Delivery deadline', '2099-01-01'], ['Delivery city', 'Pune'], ['State or union territory', 'Maharashtra'],
  ]) fireEvent.change(screen.getByLabelText(label!), { target: { value } });
}
it('shows inline required-field validation and focuses the first invalid field', async () => {
  const user = renderBuyerRoute('/buyer/jobs/new');
  await user.click(await screen.findByRole('button', { name: 'Post job' }));
  expect(await screen.findByText('Job title is required.')).toBeVisible();
  expect(screen.getByLabelText('Job title')).toHaveAccessibleDescription('Job title is required.');
  expect(screen.getByLabelText('Job title')).toHaveFocus();
});
it.each([
  ['Quantity', '0', 'Quantity must be greater than 0.'],
  [/Budget \(INR\)/, '-1', 'Budget must be greater than 0.'],
  ['Delivery deadline', '2020-01-01', 'Delivery deadline must be a future date (India time).'],
])('blocks invalid form values for %s', async (label, value, message) => {
  const user = renderBuyerRoute('/buyer/jobs/new');
  await screen.findByRole('heading', { name: 'Post a manufacturing job' });
  fillJob();
  fireEvent.change(screen.getByLabelText(label!), { target: { value } });
  await user.click(screen.getByRole('button', { name: 'Post job' }));
  expect(await screen.findByText(String(message))).toBeVisible();
});
it('posts metadata through the service, navigates to detail and refreshes cached dashboard statistics', async () => {
  const data = createServices();
  const user = renderBuyerRoute('/buyer/dashboard', data);
  expect(await screen.findByRole('group', { name: 'Total posted jobs' })).toHaveTextContent(String(fixtures.jobs.length));
  await user.click(screen.getByRole('link', { name: 'Post a job' }));
  await screen.findByRole('heading', { name: 'Post a manufacturing job' });
  fillJob();
  await user.upload(screen.getByLabelText(/Design files/), new File(['demo drawing'], 'coupler.pdf', { type: 'application/pdf' }));
  await user.click(screen.getByRole('button', { name: 'Post job' }));
  expect(await screen.findByRole('heading', { name: 'Test pump couplers' })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Job posted successfully');
  expect(screen.getByText('coupler.pdf')).toBeVisible();
  const jobs = await data.buyer.listJobs('buyer-1');
  expect(jobs).toHaveLength(fixtures.jobs.length + 1);
  expect(jobs.at(-1)?.designFiles[0]).toMatchObject({ name: 'coupler.pdf', sizeBytes: 12, mediaType: 'application/pdf' });
  expect(Object.keys(jobs.at(-1)?.designFiles[0] ?? {}).sort()).toEqual(['id', 'mediaType', 'name', 'sizeBytes']);
  await user.click(screen.getByRole('link', { name: 'Buyer overview' }));
  expect(await screen.findByRole('group', { name: 'Total posted jobs' })).toHaveTextContent(String(fixtures.jobs.length + 1));
  expect(screen.getByRole('group', { name: 'Active jobs' })).toHaveTextContent(String(fixtures.jobs.filter(job => ['POSTED', 'QUOTING', 'AWARDED'].includes(job.status)).length + 1));
});
it('prevents duplicate submissions while the service is pending', async () => {
  const data = createServices();
  const original = data.buyer.createJob.bind(data.buyer);
  let release!: () => void;
  const create = vi.spyOn(data.buyer, 'createJob').mockImplementation(async (...args) => {
    await new Promise<void>(resolve => { release = resolve; });
    return original(...args);
  });
  const user = renderBuyerRoute('/buyer/jobs/new', data);
  await screen.findByRole('heading', { name: 'Post a manufacturing job' });
  fillJob();
  await user.dblClick(screen.getByRole('button', { name: 'Post job' }));
  expect(create).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Posting job…' })).toBeDisabled();
  release();
  await screen.findByRole('heading', { name: 'Test pump couplers' });
  expect(await data.buyer.listJobs('buyer-1')).toHaveLength(fixtures.jobs.length + 1);
});
it('preserves the draft and reports a failed post without mock success', async () => {
  const data = createServices();
  vi.spyOn(data.buyer, 'createJob').mockRejectedValue(new Error('Service unavailable'));
  const user = renderBuyerRoute('/buyer/jobs/new', data);
  await screen.findByRole('heading', { name: 'Post a manufacturing job' });
  fillJob();
  await user.click(screen.getByRole('button', { name: 'Post job' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  expect(screen.getByLabelText('Job title')).toHaveValue('Test pump couplers');
  expect(await data.buyer.listJobs('buyer-1')).toHaveLength(fixtures.jobs.length);
});
it('lists, searches, filters and sorts jobs using real service data', async () => {
  const user = renderBuyerRoute('/buyer/jobs?sort=oldest');
  const table = await screen.findByRole('table');
  expect(within(within(table).getAllByRole('row')[1]!).getByRole('link')).toHaveTextContent('aluminium mounting brackets');
  await user.type(screen.getByLabelText('Search job titles'), 'brass');
  expect(await screen.findByText('1 of ' + fixtures.jobs.length + ' jobs')).toBeVisible();
  await user.selectOptions(screen.getByLabelText('Status'), 'QUOTING');
  expect(await screen.findByRole('heading', { name: 'No jobs match these filters' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  await user.selectOptions(screen.getByLabelText('Sort jobs'), 'deadline');
  const sortedTable = screen.getByRole('table');
  expect(within(within(sortedTable).getAllByRole('row')[1]!).getByRole('link')).toHaveTextContent('drive shafts');
});
it.each(['missing', 'private-job'])('handles unavailable job %s without leaking another buyer brief', async id => {
  const store = createMockStore();
  store.commit(state => {
    state.users.push({ id: 'buyer-2', role: 'buyer', name: 'Other Buyer', email: 'other@kaarigarlink.example' });
    state.jobs.push({ ...state.jobs[0]!, id: 'private-job', buyerId: 'buyer-2', title: 'Confidential requirement' });
  });
  renderBuyerRoute('/buyer/jobs/' + id, createMockService(store));
  expect(await screen.findByRole('heading', { name: 'Job unavailable' })).toBeVisible();
  expect(screen.queryByText('Confidential requirement')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Return to jobs' })).toHaveAttribute('href', '/buyer/jobs');
});
