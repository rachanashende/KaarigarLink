import type { InspectorInspectionData } from '@/services/inspections';
import { todayInIndia } from '@/services/jobs';

export const qcLabels = { PENDING: 'QC pending', ACCEPTED: 'Accepted', REWORK: 'Rework requested' };
export function followUpDate(item: InspectorInspectionData) {
  return item.inspection.decision === 'REWORK' ? item.inspection.reworkDeadline : item.inspection.dueOn;
}
export function isOverdue(item: InspectorInspectionData, today = todayInIndia()) {
  const due = followUpDate(item);
  return item.inspection.decision !== 'ACCEPTED' && !!due && due < today;
}
export function inspectionStats(items: InspectorInspectionData[]) {
  return { total: items.length, pending: items.filter(item => item.inspection.decision === 'PENDING').length, accepted: items.filter(item => item.inspection.decision === 'ACCEPTED').length, rework: items.filter(item => item.inspection.decision === 'REWORK').length, overdue: items.filter(item => isOverdue(item)).length };
}
export function filterInspections(items: InspectorInspectionData[], search: string, status: string, descending = false) {
  const term = search.trim().toLocaleLowerCase('en-IN');
  return items.filter(item => [item.inspection.id, item.order.id, item.job.title, item.workshop.name].some(value => value.toLocaleLowerCase('en-IN').includes(term)) && (status === 'all' || item.inspection.decision === status || status === 'overdue' && isOverdue(item))).sort((a, b) => {
    const first = followUpDate(a); const second = followUpDate(b);
    if (!first && second) return 1; if (first && !second) return -1;
    return (first ?? '').localeCompare(second ?? '') * (descending ? -1 : 1) || a.inspection.id.localeCompare(b.inspection.id);
  });
}
export function inspectionHistory(items: InspectorInspectionData[]) {
  return items.flatMap(item => (item.inspection.history ?? []).map(record => ({ ...item, record }))).sort((a, b) => b.record.submittedAt.localeCompare(a.record.submittedAt) || a.record.id.localeCompare(b.record.id));
}
export function dateLabel(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Not recorded';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }).format(new Date(value.length === 10 ? value + 'T00:00:00Z' : value));
}
