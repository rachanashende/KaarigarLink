import type { AdminOverview } from '@/services/admin';
import type { Inspection, Job, Milestone, Order } from '@/types';
import { todayInIndia } from '@/services/jobs';

export const sections = ['users', 'workshops', 'jobs', 'orders', 'quality'] as const;
export type AdminSection = typeof sections[number];
export const sectionTitles: Record<AdminSection, string> = { users: 'User directory', workshops: 'Workshop oversight', jobs: 'Manufacturing jobs', orders: 'Manufacturing orders', quality: 'Quality operations' };
export const activeJob = (job: Job) => ['POSTED', 'QUOTING', 'AWARDED'].includes(job.status);
export const activeOrder = (order: Order) => order.status !== 'CLOSED' && order.status !== 'CANCELLED';
export const inspectionDeadline = (item: Inspection) => item.decision === 'REWORK' ? item.reworkDeadline : item.dueOn;
export function progress(milestones: Milestone[]) { return milestones.length ? Math.round(milestones.filter(item => item.status === 'COMPLETED').length / milestones.length * 100) : null; }
export function metrics(data: AdminOverview) {
  return {
    users: data.users.length, buyers: data.users.filter(user => user.role === 'buyer').length, workshops: data.workshops.length,
    jobs: data.jobs.filter(activeJob).length, orders: data.orders.filter(activeOrder).length,
    pending: data.inspections.filter(item => item.decision === 'PENDING').length, rework: data.inspections.filter(item => item.decision === 'REWORK').length,
  };
}
export interface OperationalAlert { id: string; severity: 'warning' | 'danger'; title: string; description: string; href: string; workshopId?: string }
export function operationalAlerts(data: AdminOverview, today = todayInIndia()): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  for (const job of data.jobs) if (activeJob(job) && job.deadline < today) alerts.push({ id: 'job:' + job.id, severity: 'warning', title: 'Job deadline passed', description: job.title, href: '/admin/jobs/' + encodeURIComponent(job.id) });
  for (const order of data.orders.filter(activeOrder)) {
    for (const step of order.milestones) if (step.status !== 'COMPLETED' && step.dueOn < today) alerts.push({ id: 'milestone:' + step.id, severity: 'warning', title: 'Production milestone overdue', description: order.id + ' · ' + step.title, href: '/admin/orders/' + encodeURIComponent(order.id), workshopId: order.workshopId });
    const quote = data.quotes.find(quote => quote.id === order.quoteId);
    if (quote && quote.estimatedDelivery < today) alerts.push({ id: 'delivery:' + order.id, severity: 'warning', title: 'Order delivery commitment passed', description: order.id, href: '/admin/orders/' + encodeURIComponent(order.id), workshopId: order.workshopId });
  }
  for (const inspection of data.inspections) {
    const order = data.orders.find(order => order.id === inspection.orderId);
    if (!order || !activeOrder(order)) continue;
    if (inspection.decision === 'PENDING' && inspection.dueOn && inspection.dueOn < today) alerts.push({ id: 'inspection:' + inspection.id, severity: 'danger', title: 'Pending inspection overdue', description: inspection.id + ' · ' + inspection.orderId, href: '/admin/quality/' + encodeURIComponent(inspection.id), workshopId: order.workshopId });
    if (inspection.decision === 'REWORK') alerts.push({ id: 'rework:' + inspection.id, severity: inspection.reworkDeadline && inspection.reworkDeadline < today ? 'danger' : 'warning', title: inspection.reworkDeadline && inspection.reworkDeadline < today ? 'Rework deadline passed' : 'Rework follow-up required', description: inspection.id + ' · ' + inspection.orderId, href: '/admin/quality/' + encodeURIComponent(inspection.id), workshopId: order.workshopId });
  }
  return alerts.sort((a, b) => Number(b.severity === 'danger') - Number(a.severity === 'danger') || a.id.localeCompare(b.id));
}
export interface AdminFilters { search: string; filter: string; sort: string }
const contains = (value: string, search: string) => value.toLocaleLowerCase('en-IN').includes(search.trim().toLocaleLowerCase('en-IN'));
export function compareDates(a: string | undefined, b: string | undefined, descending: boolean) {
  if (!a && b) return 1; if (a && !b) return -1;
  return (a ?? '').localeCompare(b ?? '') * (descending ? -1 : 1);
}
export function usersRows(data: AdminOverview, filters: AdminFilters) {
  return data.users.filter(item => contains(item.name + ' ' + item.email + ' ' + item.id, filters.search) && (filters.filter === 'all' || item.role === filters.filter)).sort((a, b) => a.name.localeCompare(b.name) * (filters.sort === 'name-desc' ? -1 : 1) || a.id.localeCompare(b.id));
}
export function workshopRows(data: AdminOverview, filters: AdminFilters) {
  return data.workshops.filter(item => contains([item.name, item.id, item.location.city, ...item.capabilities].join(' '), filters.search) && (filters.filter === 'all' || item.capabilities.includes(filters.filter))).sort((a, b) => a.name.localeCompare(b.name) * (filters.sort === 'name-desc' ? -1 : 1) || a.id.localeCompare(b.id));
}
export function jobsRows(data: AdminOverview, filters: AdminFilters) {
  return data.jobs.filter(item => contains([item.id, item.title, item.capability, data.users.find(user => user.id === item.buyerId)?.name ?? ''].join(' '), filters.search) && (filters.filter === 'all' || item.status === filters.filter)).sort((a, b) => compareDates(filters.sort.startsWith('deadline') ? a.deadline : a.createdAt, filters.sort.startsWith('deadline') ? b.deadline : b.createdAt, filters.sort === 'newest' || filters.sort === 'deadline-desc') || a.id.localeCompare(b.id));
}
export function ordersRows(data: AdminOverview, filters: AdminFilters) {
  const quoteDate = (id: string) => data.quotes.find(quote => quote.id === id)?.estimatedDelivery;
  return data.orders.filter(item => contains([item.id, data.jobs.find(job => job.id === item.jobId)?.title ?? '', data.users.find(user => user.id === item.buyerId)?.name ?? '', data.workshops.find(workshop => workshop.id === item.workshopId)?.name ?? ''].join(' '), filters.search) && (filters.filter === 'all' || item.status === filters.filter)).sort((a, b) => compareDates(filters.sort.startsWith('deadline') ? quoteDate(a.quoteId) : a.createdAt, filters.sort.startsWith('deadline') ? quoteDate(b.quoteId) : b.createdAt, filters.sort === 'newest' || filters.sort === 'deadline-desc') || a.id.localeCompare(b.id));
}
export function qualityRows(data: AdminOverview, filters: AdminFilters) {
  return data.inspections.filter(item => {
    const order = data.orders.find(order => order.id === item.orderId);
    return contains([item.id, item.orderId, data.users.find(user => user.id === item.inspectorId)?.name ?? '', data.workshops.find(workshop => workshop.id === order?.workshopId)?.name ?? ''].join(' '), filters.search) && (filters.filter === 'all' || item.decision === filters.filter || filters.filter === 'overdue' && item.decision === 'REWORK' && !!item.reworkDeadline && item.reworkDeadline < todayInIndia());
  }).sort((a, b) => compareDates(inspectionDeadline(a), inspectionDeadline(b), filters.sort === 'deadline-desc') || a.id.localeCompare(b.id));
}
export const dateLabel = (value?: string) => !value || Number.isNaN(Date.parse(value)) ? 'Not recorded' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value.length === 10 ? value + 'T00:00:00Z' : value));
export const moneyLabel = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
export function statusLabel(value: string) { return ({ QC_PENDING: 'QC pending', PENDING: 'Pending', REWORK: 'Rework requested', IN_PRODUCTION: 'In production' } as Record<string, string>)[value] ?? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replaceAll('_', ' '); }
