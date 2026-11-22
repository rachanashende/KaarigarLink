import { expect, it, vi } from 'vitest';
import type { BuyerDashboardData } from '@/services/jobs';
import { fixtures } from '@/services/mock/fixtures';
import { dashboardStats, dateLabel, filterJobs, upcomingJobs } from './model';

it('derives each dashboard count from data rather than fixed values', () => {
  const job = fixtures.jobs[0]!;
  const data: BuyerDashboardData = {
    jobs: [job, { ...job, id: 'closed', status: 'CLOSED' }],
    quotes: [{ id: 'quote', jobId: job.id, workshopId: 'workshop-1', amount: 100, estimatedDelivery: job.deadline, notes: '', status: 'SUBMITTED' }],
    orders: [{ id: 'order', jobId: job.id, buyerId: job.buyerId, workshopId: 'workshop-1', quoteId: 'quote', status: 'IN_PRODUCTION', milestones: [] }],
    activity: [],
  };
  expect(dashboardStats(data)).toEqual({ total: 2, active: 1, pendingQuotes: 1, inProduction: 1 });
  expect(dashboardStats({ jobs: [], quotes: [], orders: [], activity: [] })).toEqual({ total: 0, active: 0, pendingQuotes: 0, inProduction: 0 });
});
it('searches titles, filters status and sorts without mutating the source', () => {
  const source = structuredClone(fixtures.jobs.slice(0, 4));
  expect(filterJobs(source, '  BRASS  ', 'POSTED', 'newest').map(job => job.id)).toEqual(['job-3']);
  expect(filterJobs(source, '', 'QUOTING', 'newest').map(job => job.id)).toEqual(['job-2']);
  expect(filterJobs(source, '', 'all', 'oldest')[0]?.id).toBe('job-1');
  expect(filterJobs(source, '', 'all', 'deadline')[0]?.id).toBe('job-4');
  expect(filterJobs(source, '', 'all', 'deadline-desc')[0]?.id).toBe('job-1');
  expect(source).toEqual(fixtures.jobs.slice(0, 4));
});
it('keeps unknown creation dates last and excludes expired or closed deadlines', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T08:00:00Z'));
  try {
    const job = fixtures.jobs[0]!;
    const legacy = { ...job, id: 'legacy' }; delete legacy.createdAt;
    expect(filterJobs([legacy, job], '', 'all', 'oldest')[0]?.id).toBe(job.id);
    expect(upcomingJobs([{ ...job, deadline: '2026-11-17' }, { ...job, status: 'CLOSED' }])).toEqual([]);
    expect(dateLabel()).toBe('Not recorded');
    expect(dateLabel('invalid')).toBe('Not recorded');
  } finally { vi.useRealTimers(); }
});
