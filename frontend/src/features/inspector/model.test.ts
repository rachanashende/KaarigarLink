import { beforeEach, expect, it, vi } from 'vitest';
import * as calendar from '@/services/jobs';

beforeEach(() => { vi.spyOn(calendar, 'todayInIndia').mockReturnValue('2026-11-19'); });
import { createMockService } from '@/services/adapters/mock';
import { dateLabel, filterInspections, followUpDate, inspectionHistory, inspectionStats, isOverdue } from './model';

it('derives all dashboard counts and excludes accepted records from overdue follow-ups', async () => {
  const data = await createMockService().inspector.listInspections('inspector-1');
  expect(inspectionStats(data)).toEqual({ total: 5, pending: 1, accepted: 2, rework: 2, overdue: 1 });
  expect(inspectionStats([])).toEqual({ total: 0, pending: 0, accepted: 0, rework: 0, overdue: 0 });
  const overdue = data.find(item => item.inspection.id === 'inspection-overdue')!;
  expect(followUpDate(overdue)).toBe('2026-11-18');
  expect(isOverdue(overdue, '2026-11-18')).toBe(false);
  expect(isOverdue(overdue, '2026-11-19')).toBe(true);
  const accepted = data.find(item => item.inspection.decision === 'ACCEPTED')!;
  expect(isOverdue(accepted, '2099-01-01')).toBe(false);
});
it('searches and filters only supplied data; sorts deadlines without mutating input', async () => {
  const data = await createMockService().inspector.listInspections('inspector-1'); const before = structuredClone(data);
  expect(filterInspections(data, ' SENSOR ', 'PENDING').map(item => item.inspection.id)).toEqual(['inspection-qc']);
  expect(filterInspections(data, 'Sahyadri', 'all')).toHaveLength(5);
  expect(filterInspections(data, 'order-rework', 'all')).toHaveLength(1);
  expect(filterInspections(data, '', 'overdue').map(item => item.inspection.id)).toEqual(['inspection-overdue']);
  expect(filterInspections(data, '', 'all')[0]?.inspection.id).toBe('inspection-closed');
  expect(filterInspections(data, '', 'all', true)[0]?.inspection.id).toBe('inspection-rework');
  const unknown = structuredClone(data[0]!); delete unknown.inspection.dueOn;
  expect(filterInspections([unknown, data[1]!], '', 'all').at(-1)?.inspection.id).toBe(unknown.inspection.id);
  expect(data).toEqual(before);
  expect(inspectionHistory(data)).toHaveLength(4);
  expect(inspectionHistory(data).at(-1)?.inspection.id).toBe('inspection-overdue');
  expect(dateLabel()).toBe('Not recorded');
});
