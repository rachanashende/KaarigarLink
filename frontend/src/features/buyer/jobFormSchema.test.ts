import { expect, it, vi } from 'vitest';
import { jobFormSchema } from './jobFormSchema';
import { todayInIndia } from '@/services/jobs';
const form = { title: 'Test job', capability: 'CNC turning', description: 'A clear manufacturing brief.', material: 'Steel', specification: '', quantity: 1, unit: 'pieces', processes: 'CNC lathe, bore finishing', deadline: '2099-01-01', location: { city: 'Pune', state: 'Maharashtra' }, designFiles: [] };
it('uses the shared service schema and parses comma-separated requirements', () => {
  const parsed = jobFormSchema.parse(form);
  expect(parsed.processes).toEqual(['CNC lathe', 'bore finishing']);
  expect(parsed.budget).toBeUndefined();
});
it('validates future calendar dates in India time, including the midnight boundary', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T20:00:00Z'));
  try {
    expect(todayInIndia()).toBe('2026-11-19');
    expect(jobFormSchema.safeParse({ ...form, deadline: '2026-11-19' }).success).toBe(false);
    expect(jobFormSchema.safeParse({ ...form, deadline: '2026-11-20' }).success).toBe(true);
  } finally { vi.useRealTimers(); }
});
