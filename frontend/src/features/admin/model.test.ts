import { beforeEach, expect, it, vi } from 'vitest';
import * as calendar from '@/services/jobs';
import { createMockService } from '@/services/adapters/mock';
import { metrics, operationalAlerts, usersRows, workshopRows, jobsRows, ordersRows, qualityRows, compareDates, dateLabel, progress } from './model';
import { milestoneProgress } from '@/features/buyer/orderModel';
import { inspectionStats } from '@/features/inspector/model';

beforeEach(() => { vi.spyOn(calendar, 'todayInIndia').mockReturnValue('2026-11-19'); });
const filters = { search: '', filter: 'all', sort: 'name' };
async function data() { return createMockService().admin.getOverview('admin-1'); }
it('derives platform metrics and matches inspector/buyer progress semantics', async () => {
  const value = await data();
  expect(metrics(value)).toEqual({ users: 7, buyers: 1, workshops: 4, jobs: 8, orders: 4, pending: 1, rework: 2 });
  const service = createMockService(); const inspector = await service.inspector.listInspections('inspector-1');
  expect(metrics(value).pending).toBe(inspectionStats(inspector).pending);
  expect(metrics(value).rework).toBe(inspectionStats(inspector).rework);
  for (const order of value.orders) expect(progress(order.milestones)).toBe(milestoneProgress(order.milestones));
  expect(progress([])).toBeNull();
});
it('handles truly empty read models', async () => {
  const value = await data();
  for (const key of Object.keys(value) as (keyof typeof value)[]) value[key] = [];
  expect(metrics(value)).toEqual({ users: 0, buyers: 0, workshops: 0, jobs: 0, orders: 0, pending: 0, rework: 0 });
  expect(operationalAlerts(value)).toEqual([]);
});
it('uses deterministic alert IDs, severity and record links without mutating data', async () => {
  const value = await data(); const before = structuredClone(value);
  const alerts = operationalAlerts(value, '2026-11-19');
  expect(alerts).toHaveLength(3);
  expect(alerts[0]).toMatchObject({ id: 'rework:inspection-overdue', severity: 'danger', href: '/admin/quality/inspection-overdue' });
  expect(alerts.some(alert => alert.id === 'milestone:order-production-m2')).toBe(true);
  expect(alerts.some(alert => alert.id === 'rework:inspection-rework' && alert.severity === 'warning')).toBe(true);
  expect(new Set(alerts.map(alert => alert.id)).size).toBe(alerts.length);
  expect(operationalAlerts(value, '2026-11-19')).toEqual(alerts); expect(value).toEqual(before);
});
it('handles same-day deadlines, historical closed/cancelled records, pending QC and delivery alerts', async () => {
  const value = await data();
  value.jobs[0]!.deadline = '2026-11-18';
  value.jobs.find(item => item.status === 'CLOSED')!.deadline = '2020-01-01';
  value.inspections.find(item => item.id === 'inspection-qc')!.dueOn = '2026-11-18';
  value.quotes.find(item => item.id === 'quote-order-qc')!.estimatedDelivery = '2026-11-18';
  const alerts = operationalAlerts(value, '2026-11-19');
  expect(alerts.some(alert => alert.id === 'job:job-1')).toBe(true);
  expect(alerts.some(alert => alert.id === 'job:job-order-closed')).toBe(false);
  expect(alerts.some(alert => alert.id === 'inspection:inspection-qc')).toBe(true);
  expect(alerts.some(alert => alert.id === 'delivery:order-qc')).toBe(true);
  expect(alerts.some(alert => alert.description.includes('order-cancelled'))).toBe(false);
  expect(alerts.some(alert => alert.description.includes('order-closed'))).toBe(false);
  const today = operationalAlerts(value, '2026-11-18');
  expect(today.some(alert => alert.id === 'job:job-1' || alert.id === 'inspection:inspection-qc' || alert.id === 'delivery:order-qc')).toBe(false);
});
it('searches users and workshops, filters roles/capabilities and sorts names', async () => {
  const value = await data();
  expect(usersRows(value, { ...filters, search: ' BUYER@ ' }).map(item => item.id)).toEqual(['buyer-1']);
  expect(usersRows(value, { ...filters, filter: 'inspector' }).map(item => item.id)).toEqual(['inspector-1']);
  expect(usersRows(value, { ...filters, sort: 'name-desc' })[0]?.name).toBe('Sana Kulkarni');
  expect(workshopRows(value, { ...filters, search: 'nashik' }).map(item => item.id)).toEqual(['workshop-2']);
  expect(workshopRows(value, { ...filters, filter: 'Sheet metal fabrication' }).map(item => item.id)).toEqual(['workshop-4']);
  expect(workshopRows(value, { ...filters, sort: 'name-desc' })[0]?.id).toBe('workshop-4');
});
it('searches related job/order names, filters lifecycle states and sorts actual source dates', async () => {
  const value = await data(); const before = structuredClone(value);
  expect(jobsRows(value, { ...filters, search: 'ANANYA' })).toHaveLength(10);
  expect(jobsRows(value, { ...filters, filter: 'QUOTING' }).map(item => item.id)).toEqual(['job-2']);
  expect(jobsRows(value, { ...filters, sort: 'newest' })[0]?.id).toBe('job-2');
  expect(jobsRows(value, { ...filters, sort: 'deadline' })[0]?.id).toBe('job-4');
  expect(jobsRows(value, { ...filters, sort: 'deadline-desc' })[0]?.id).toBe('job-1');
  expect(ordersRows(value, { ...filters, search: 'impeller' }).map(item => item.id)).toEqual(['order-rework']);
  expect(ordersRows(value, { ...filters, search: 'SAHYADRI' })).toHaveLength(6);
  expect(ordersRows(value, { ...filters, filter: 'CLOSED' }).map(item => item.id)).toEqual(['order-closed']);
  value.orders[0]!.createdAt = '2020-01-01T00:00:00Z';
  value.quotes.find(item => item.id === value.orders[0]!.quoteId)!.estimatedDelivery = '2020-01-01';
  expect(ordersRows(value, { ...filters, sort: 'oldest' })[0]?.id).toBe(value.orders[0]!.id);
  expect(ordersRows(value, { ...filters, sort: 'deadline-desc' }).at(-1)?.id).toBe(value.orders[0]!.id);
  expect(before.jobs).toEqual(value.jobs);
});
it('filters QC and overdue rework, sorts effective dates, and retains history', async () => {
  const value = await data();
  expect(qualityRows(value, { ...filters, search: 'Meera', filter: 'PENDING' }).map(item => item.id)).toEqual(['inspection-qc']);
  expect(qualityRows(value, { ...filters, filter: 'overdue' }).map(item => item.id)).toEqual(['inspection-overdue']);
  expect(qualityRows(value, { ...filters, sort: 'deadline-desc' })[0]?.id).toBe('inspection-rework');
  expect(qualityRows(value, { ...filters, filter: 'ACCEPTED' }).every(item => item.history?.length === 1)).toBe(true);
  expect(compareDates(undefined, '2026-01-01', false)).toBe(1);
  expect(compareDates('2026-01-01', undefined, true)).toBe(-1);
  expect(dateLabel()).toBe('Not recorded');
});
