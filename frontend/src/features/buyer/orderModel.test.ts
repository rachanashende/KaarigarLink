import { expect, it } from 'vitest';
import { createMockService } from '@/services/adapters/mock';
import { milestoneLabel, milestoneProgress, filterOrders } from './orderModel';
import { fixtures } from '@/services/mock/fixtures';

it('derives completed-count progress, including empty, partial and fully completed plans', () => {
  expect(milestoneProgress([])).toBeNull();
  expect(milestoneProgress(fixtures.orders.find(order => order.id === 'order-production')!.milestones)).toBe(25);
  expect(milestoneProgress(fixtures.orders.find(order => order.id === 'order-closed')!.milestones)).toBe(100);
  expect(milestoneProgress(fixtures.orders.find(order => order.id === 'order-cancelled')!.milestones)).toBe(0);
});
it('distinguishes delayed, upcoming, active, completed and cancelled milestones using India calendar dates', () => {
  const milestone = fixtures.orders[0]!.milestones[1]!;
  expect(milestoneLabel(milestone, false, '2026-11-18')).toBe('Delayed · In progress');
  expect(milestoneLabel({ ...milestone, dueOn: '2026-11-18' }, false, '2026-11-18')).toBe('In progress');
  expect(milestoneLabel({ ...milestone, status: 'PENDING', dueOn: '2026-11-19' }, false, '2026-11-18')).toBe('Upcoming');
  expect(milestoneLabel({ ...milestone, status: 'COMPLETED' }, false, '2026-11-18')).toBe('Completed');
  expect(milestoneLabel(milestone, true, '2026-11-18')).toContain('cancelled');
});
it('searches order IDs, jobs and workshops; filters and sorts immutable input with unknown dates last', async () => {
  const rows = await createMockService().buyer.listOrders('buyer-1');
  expect(filterOrders(rows, ' ORDER-REWORK ', 'all', 'newest').map(item => item.order.id)).toEqual(['order-rework']);
  expect(filterOrders(rows, 'conveyor', 'all', 'newest')).toHaveLength(1);
  expect(filterOrders(rows, 'SAHYADRI', 'all', 'newest')).toHaveLength(6);
  expect(filterOrders(rows, '', 'CLOSED', 'newest')).toHaveLength(1);
  const early = structuredClone(rows[0]!); early.order.id = 'early'; early.order.createdAt = '2026-01-01T00:00:00Z'; early.quote.estimatedDelivery = '2026-01-01';
  const unknown = structuredClone(rows[1]!); delete unknown.order.createdAt;
  const source = [unknown, rows[2]!, early]; const before = structuredClone(source);
  expect(filterOrders(source, '', 'all', 'oldest')[0]?.order.id).toBe('early');
  expect(filterOrders(source, '', 'all', 'newest').at(-1)?.order.id).toBe(unknown.order.id);
  expect(filterOrders(source, '', 'all', 'deadline')[0]?.order.id).toBe('early');
  expect(filterOrders(source, '', 'all', 'deadline-desc').at(-1)?.order.id).toBe('early');
  expect(source).toEqual(before);
});
