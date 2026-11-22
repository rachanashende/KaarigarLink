import type { Job, JobStatus } from '@/types';
import type { BuyerDashboardData } from '@/services/jobs';
import { todayInIndia } from '@/services/jobs';

export const jobStatuses: Record<JobStatus, string> = { POSTED: 'Posted', QUOTING: 'Quoting', AWARDED: 'Awarded', CLOSED: 'Closed', CANCELLED: 'Cancelled' };
export function isActive(job: Job) { return job.status === 'POSTED' || job.status === 'QUOTING' || job.status === 'AWARDED'; }
export function dashboardStats(data: BuyerDashboardData) {
  return {
    total: data.jobs.length,
    active: data.jobs.filter(isActive).length,
    pendingQuotes: data.quotes.filter(quote => quote.status === 'SUBMITTED').length,
    inProduction: data.orders.filter(order => order.status === 'IN_PRODUCTION').length,
  };
}
export type JobSort = 'newest' | 'oldest' | 'deadline' | 'deadline-desc';
export function filterJobs(jobs: Job[], search: string, status: string, sort: JobSort): Job[] {
  return jobs.filter(job => job.title.toLocaleLowerCase('en-IN').includes(search.trim().toLocaleLowerCase('en-IN')) && (status === 'all' || job.status === status)).sort((a, b) => {
    if (sort === 'deadline' || sort === 'deadline-desc') return a.deadline.localeCompare(b.deadline) * (sort === 'deadline' ? 1 : -1) || a.id.localeCompare(b.id);
    if (!a.createdAt && b.createdAt) return 1;
    if (!b.createdAt && a.createdAt) return -1;
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '') * (sort === 'oldest' ? 1 : -1) || a.id.localeCompare(b.id);
  });
}
export function upcomingJobs(jobs: Job[]): Job[] {
  return filterJobs(jobs.filter(job => isActive(job) && job.deadline >= todayInIndia()), '', 'all', 'deadline').slice(0, 4);
}
export function dateLabel(value?: string): string {
  if (!value) return 'Not recorded';
  const date = new Date(value.length === 10 ? value + 'T00:00:00Z' : value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(date);
}
export const quantityLabel = (job: Pick<Job, 'quantity' | 'unit'>) => new Intl.NumberFormat('en-IN').format(job.quantity) + ' ' + job.unit;
export const moneyLabel = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
