import { z } from 'zod';
import type {
  BackendJobStatus, Inspection, InspectionCheck, InspectionDecisionRecord, InspectionFinding, InspectionFindings, Invitation, Job, JobStatus,
  Milestone, Order, OrderStatus, PaymentRecord, QCStatus, Quote, Review, Role, User, Workshop,
} from '@/types';
import { ServiceError } from '../contracts';
import type { PaymentSummary } from '../orders';

/**
 * Backend record schemas (only the fields the frontend reads; unknown fields are
 * stripped) and their mapping into the frontend domain model. Backend values with
 * no exact frontend equivalent are kept in "live mode only" fields (Order.backendStatus,
 * Milestone.stage, ...) so nothing is lost.
 */

const str = z.string();
const maybe = <T extends z.ZodType>(schema: T) => schema.nullable().optional();

// ---------- Schemas ----------

export const backendRole = z.enum(['BUYER', 'WORKSHOP', 'INSPECTOR', 'ADMIN']);
export const userSchema = z.object({
  id: str, name: str, email: str, role: backendRole,
  createdAt: str.optional(),
  workshop: maybe(z.object({ id: str, businessName: str, verificationStatus: str })),
});
export const authResultSchema = z.object({ token: str, user: userSchema });

const requirementSchema = z.object({ requirementType: str, requirementValue: str, isMandatory: z.boolean().optional() });
export const jobSchema = z.object({
  id: str, buyerId: str.optional(), title: str, description: maybe(str), material: str, manufacturingProcess: str,
  quantity: z.number(), quantityUnit: str, deadline: str, address: maybe(str), technicalSpecifications: z.unknown().optional(),
  status: str, createdAt: str.optional(), requirements: z.array(requirementSchema).optional(),
  buyer: maybe(z.object({ id: str, name: str })),
});
export type BackendJob = z.infer<typeof jobSchema>;

export const workshopSchema = z.object({
  id: str, userId: str, businessName: str, address: maybe(str), city: maybe(str),
  latitude: maybe(z.number()), longitude: maybe(z.number()), rating: z.number(), ratingCount: z.number(),
  verificationStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
  machines: z.array(z.object({ id: str, machineName: str, machineType: str })).optional(),
  capabilities: z.array(z.object({ manufacturingProcess: str })).optional(),
  capacities: z.array(z.object({ id: str, availableCapacity: z.number(), capacityUnit: str, startDate: str, endDate: str })).optional(),
});
export type BackendWorkshop = z.infer<typeof workshopSchema>;

export const quoteSchema = z.object({
  id: str, invitationId: str.optional(), jobId: str, workshopId: str, totalPrice: str, estimatedDays: z.number(),
  notes: maybe(str), status: str, createdAt: str, updatedAt: str.optional(),
  workshop: maybe(z.object({ id: str, businessName: str, city: maybe(str) })),
});
export type BackendQuote = z.infer<typeof quoteSchema>;

export const milestoneSchema = z.object({
  id: str, orderId: str, title: str, description: maybe(str), sequence: z.number(), status: str,
  dueDate: maybe(str), startedAt: maybe(str), completedAt: maybe(str), notes: maybe(str),
});
export const inspectionSchema = z.object({
  id: str, orderId: str, inspectorId: str, status: z.enum(['PASSED', 'FAILED', 'REWORK_REQUIRED']), findings: maybe(str),
  inspectedAt: str, milestoneId: maybe(str), inspector: maybe(z.object({ id: str, name: str })),
  /** M11: structured checklist (null for inspections recorded before M11). */
  checklist: z.unknown().optional(),
});
/** M11: Inspection.checklist / InspectionDraft.checklist as stored by the backend. */
export const storedChecklistSchema = z.object({
  items: z.array(z.object({
    id: str, label: str, result: z.enum(['UNRECORDED', 'PASS', 'FAIL', 'NOT_APPLICABLE']), notes: str,
    evidence: z.array(z.object({ name: str, mediaType: str, sizeBytes: z.number(), documentId: str.optional() })),
  })),
  rework: z.object({ reason: str, correctiveAction: str, deadline: str.optional() }).optional(),
});
export type StoredChecklist = z.infer<typeof storedChecklistSchema>;
/** Frontend findings -> the backend checklist body (evidence is metadata only). */
export function checklistBody(checklist: InspectionCheck[], findings: InspectionFindings, rework?: { reason: string; correctiveAction: string; reworkDeadline: string }) {
  return {
    items: findings.items.map(item => ({
      id: item.id, label: checklist.find(check => check.id === item.id)?.label ?? item.id, result: item.result, notes: item.notes.trim(),
      evidence: item.evidence.map(file => ({ name: file.name, mediaType: file.mediaType, sizeBytes: Math.min(file.sizeBytes, 100 * 1024 * 1024), ...(file.documentId ? { documentId: file.documentId } : {}) })),
    })),
    ...(rework ? { rework: { reason: rework.reason.trim(), correctiveAction: rework.correctiveAction.trim(), ...(rework.reworkDeadline ? { deadline: rework.reworkDeadline } : {}) } } : {}),
  };
}
/** Stored checklist -> frontend findings items. */
export function findingsFromStored(stored: StoredChecklist, idPrefix: string): InspectionFinding[] {
  return stored.items.map((item, index) => ({
    id: item.id, result: item.result, notes: item.notes,
    evidence: item.evidence.map((file, n) => ({ id: idPrefix + ':' + index + ':' + n, name: file.name, mediaType: file.mediaType, sizeBytes: file.sizeBytes, ...(file.documentId ? { documentId: file.documentId } : {}) })),
  }));
}
export type BackendInspection = z.infer<typeof inspectionSchema>;
export const paymentSchema = z.object({
  id: str, orderId: str, amount: str, status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED']), description: maybe(str),
  paidAt: maybe(str), refundedAt: maybe(str), createdAt: str,
});
export const paymentSummarySchema = z.object({ agreedPrice: str, paid: str, pending: str, remaining: str, refunded: str, refundDue: str });

export const orderSchema = z.object({
  id: str, jobId: str, quoteId: str, buyerId: str, workshopId: str, agreedPrice: str,
  status: z.enum(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  expectedCompletionDate: maybe(str), actualCompletionDate: maybe(str), cancellationReason: maybe(str), createdAt: str, updatedAt: str.optional(),
  job: jobSchema.optional(), quote: quoteSchema.optional(),
  workshop: maybe(z.object({ id: str, businessName: str, city: maybe(str) })),
  buyer: maybe(z.object({ id: str, name: str })),
  rating: maybe(z.object({ id: str, score: z.number(), review: maybe(str) })),
  milestones: z.array(milestoneSchema).optional(),
  inspections: z.array(inspectionSchema).optional(),
  payments: z.array(paymentSchema).optional(),
});
export type BackendOrder = z.infer<typeof orderSchema>;

export const invitationSchema = z.object({ id: str, jobId: str, workshopId: str, status: z.enum(['INVITED', 'ACCEPTED', 'DECLINED', 'EXPIRED']) });

// ---------- Primitive helpers ----------

/**
 * A backend calendar date (job deadline, milestone due date, capacity window) -> YYYY-MM-DD.
 * The backend stores a date-only input as that UTC day (00:00 or 23:59:59.999 UTC), so the
 * stored day is read back as-is: converting it to India time would move end-of-day dates to
 * the next day.
 */
export function calendarDay(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** ISO date-time (a moment, e.g. createdAt) -> India calendar date (YYYY-MM-DD). */
export function dayInIndia(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function addDays(day: string, days: number): string {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}
export const amount = (value: string) => Number(value);
const opt = <K extends string, V>(key: K, value: V | null | undefined) => (value === null || value === undefined || value === '' ? {} : { [key]: value }) as Partial<Record<K, V>>;

export function role(value: z.infer<typeof backendRole>): Role {
  return value.toLowerCase() as Role;
}
export function userView(user: z.infer<typeof userSchema>): User {
  return { id: user.id, name: user.name, email: user.email, role: role(user.role) };
}

// ---------- Manufacturing vocabulary ----------

export const PROCESS_LABELS: Record<string, string> = {
  CNC_MACHINING: 'CNC machining', LATHE_TURNING: 'Lathe turning', SHEET_METAL_FABRICATION: 'Sheet metal fabrication',
  LASER_CUTTING: 'Laser cutting', WELDING: 'Welding', INJECTION_MOLDING: 'Injection moulding', CASTING: 'Casting',
  FORGING: 'Forging', THREE_D_PRINTING: '3D printing', POWDER_COATING: 'Powder coating',
};
const PROCESS_KEYWORDS: [RegExp, string][] = [
  [/cnc\s*(turning|lathe)|lathe|turning/, 'LATHE_TURNING'],
  [/cnc|machining|milling/, 'CNC_MACHINING'],
  [/sheet\s*metal|fabrication|bending/, 'SHEET_METAL_FABRICATION'],
  [/laser/, 'LASER_CUTTING'],
  [/weld/, 'WELDING'],
  [/injection|moulding|molding/, 'INJECTION_MOLDING'],
  [/cast/, 'CASTING'],
  [/forg/, 'FORGING'],
  [/3d|additive|printing/, 'THREE_D_PRINTING'],
  [/powder|coating/, 'POWDER_COATING'],
];
/** Free-text capability -> backend ManufacturingProcess, or VALIDATION. */
export function processFor(capability: string): string {
  const text = capability.trim().toLowerCase();
  const exact = Object.entries(PROCESS_LABELS).find(([key, label]) => key.toLowerCase() === text.replace(/\s+/g, '_') || label.toLowerCase() === text);
  if (exact) return exact[0];
  const keyword = PROCESS_KEYWORDS.find(([pattern]) => pattern.test(text));
  if (keyword) return keyword[1];
  throw new ServiceError('VALIDATION', 'Choose a supported manufacturing capability: ' + Object.values(PROCESS_LABELS).join(', ') + '.');
}
export const processLabel = (value: string) => PROCESS_LABELS[value] ?? value.replaceAll('_', ' ').toLowerCase();

export const MACHINE_TYPES = ['CNC_MILL', 'CNC_LATHE', 'MANUAL_LATHE', 'LASER_CUTTER', 'PRESS_BRAKE', 'PUNCH_PRESS', 'WELDING_STATION', 'INJECTION_MOLDER', 'CASTING_FURNACE', 'FORGING_HAMMER', 'THREE_D_PRINTER', 'POWDER_COATING_BOOTH'];
/** "CNC lathe" -> CNC_LATHE when it names a machine type exactly; otherwise null (free text). */
export function machineTypeFor(text: string): string | null {
  const key = text.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return MACHINE_TYPES.includes(key) ? key : null;
}
const machineLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^cnc/, 'CNC').replace(/^./, c => c.toUpperCase());

// ---------- Jobs ----------

/** Frontend-only job fields the backend has no column for, kept in technicalSpecifications.kaarigarlink. */
export const jobMetaSchema = z.object({
  capability: str.optional(), specification: str.optional(), unit: str.optional(), processes: z.array(str).optional(),
  location: z.object({ city: str, state: str }).optional(), budget: z.number().optional(),
  designFiles: z.array(z.object({ id: str, name: str, mediaType: str, sizeBytes: z.number() })).optional(),
});
function jobMeta(job: BackendJob): z.infer<typeof jobMetaSchema> {
  const specs = job.technicalSpecifications;
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return {};
  const parsed = jobMetaSchema.safeParse((specs as Record<string, unknown>).kaarigarlink);
  return parsed.success ? parsed.data : {};
}
function otherSpecs(job: BackendJob): string {
  const specs = job.technicalSpecifications;
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return '';
  const rest = Object.fromEntries(Object.entries(specs as Record<string, unknown>).filter(([key]) => key !== 'kaarigarlink'));
  return Object.keys(rest).length ? JSON.stringify(rest) : '';
}
const BACKEND_JOB_STATUSES: BackendJobStatus[] = ['DRAFT', 'OPEN', 'MATCHED', 'AWARDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export function jobStatus(value: string): JobStatus {
  switch (value) {
    case 'DRAFT': return 'DRAFT';
    case 'MATCHED': return 'QUOTING';
    case 'AWARDED': case 'IN_PROGRESS': return 'AWARDED';
    case 'COMPLETED': return 'CLOSED';
    case 'CANCELLED': return 'CANCELLED';
    default: return 'POSTED'; // OPEN
  }
}
export const QUOTABLE_JOB = ['OPEN', 'MATCHED'];

function locationFrom(address: string | null | undefined): { city: string; state: string } {
  if (!address) return { city: 'Not recorded', state: '' };
  const parts = address.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return { city: parts[0] ?? address, state: '' };
  return { city: parts[parts.length - 2]!, state: parts[parts.length - 1]! };
}
export function jobView(job: BackendJob, buyerId?: string): Job {
  const meta = jobMeta(job);
  const requirements = (job.requirements ?? []).map(req => req.requirementType === 'MACHINE_TYPE' ? machineLabel(req.requirementValue) : req.requirementValue);
  const location = meta.location ?? locationFrom(job.address);
  return {
    id: job.id, buyerId: job.buyerId ?? job.buyer?.id ?? buyerId ?? '', title: job.title, description: job.description ?? '',
    capability: meta.capability ?? processLabel(job.manufacturingProcess), material: job.material,
    specification: meta.specification ?? otherSpecs(job), quantity: job.quantity,
    unit: meta.unit ?? (job.quantityUnit === 'KG' ? 'kg' : 'pieces'),
    processes: meta.processes ?? (requirements.length ? requirements : [processLabel(job.manufacturingProcess)]),
    deadline: calendarDay(job.deadline), location: { ...location, ...opt('address', job.address) },
    designFiles: meta.designFiles ?? [], status: jobStatus(job.status),
    ...(BACKEND_JOB_STATUSES.includes(job.status as BackendJobStatus) ? { backendStatus: job.status as BackendJobStatus } : {}),
    ...opt('createdAt', job.createdAt), ...opt('budget', meta.budget),
  };
}

// ---------- Workshops ----------

export function workshopView(item: BackendWorkshop): Workshop {
  return {
    id: item.id, ownerId: item.userId, name: item.businessName,
    location: { city: item.city ?? 'Not recorded', state: '', ...opt('address', item.address) },
    capabilities: (item.capabilities ?? []).map(cap => processLabel(cap.manufacturingProcess)),
    machines: (item.machines ?? []).map(machine => ({ id: machine.id, name: machine.machineName, process: machineLabel(machine.machineType) })),
    capacitySlots: (item.capacities ?? []).map(slot => ({
      id: slot.id, startsOn: calendarDay(slot.startDate), endsOn: calendarDay(slot.endDate),
      availableQuantity: slot.availableCapacity, unit: slot.capacityUnit === 'KG' ? 'kg' : 'units',
    })),
    verificationStatus: item.verificationStatus,
    ...(item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined ? { coordinates: { latitude: item.latitude, longitude: item.longitude } } : {}),
    ...(item.ratingCount > 0 ? { rating: Math.round(item.rating * 10) / 10 } : {}),
  };
}
/** A workshop known only by its summary (orders, quotes): no machinery or capacity is implied. */
export function workshopStub(item: { id: string; businessName: string; city?: string | null | undefined }, ownerId = ''): Workshop {
  return { id: item.id, ownerId, name: item.businessName, location: { city: item.city ?? 'Not recorded', state: '' }, capabilities: [], machines: [], capacitySlots: [] };
}

// ---------- Invitations and quotes ----------

export function invitationStatus(value: z.infer<typeof invitationSchema>['status']): Invitation['status'] {
  return value === 'INVITED' ? 'PENDING' : value;
}
export function invitationView(item: z.infer<typeof invitationSchema>): Invitation {
  return { id: item.id, jobId: item.jobId, workshopId: item.workshopId, status: invitationStatus(item.status) };
}
/** The frontend shows a delivery date; the backend stores days from the quote's creation. */
export function quoteDelivery(quote: Pick<BackendQuote, 'createdAt' | 'estimatedDays'>): string {
  return addDays(dayInIndia(quote.createdAt), quote.estimatedDays);
}
export function quoteStatus(value: string): Quote['status'] {
  if (value === 'ACCEPTED') return 'AWARDED';
  if (value === 'WITHDRAWN') return 'WITHDRAWN';
  if (value === 'SUBMITTED') return 'SUBMITTED';
  if (value === 'CANCELLED') return 'CANCELLED'; // the job was cancelled before an award
  return 'REJECTED';
}
export function quoteView(quote: BackendQuote): Quote {
  return {
    id: quote.id, jobId: quote.jobId, workshopId: quote.workshopId, amount: amount(quote.totalPrice),
    estimatedDelivery: quoteDelivery(quote), notes: quote.notes ?? '', status: quoteStatus(quote.status),
    ...opt('version', quote.updatedAt),
  };
}

// ---------- QC findings (the backend stores one free-text `findings` field) ----------

/** A standard checklist used in live mode: the backend has no checklist model. */
export function liveChecklist(job: Job): InspectionCheck[] {
  return [
    { id: 'dimensions', label: 'Dimensions & tolerances', requirement: job.specification || 'Measured against the drawing and specification.', required: true, evidenceRequired: false },
    { id: 'material', label: 'Material', requirement: 'Material matches: ' + job.material, required: true, evidenceRequired: false },
    { id: 'quantity', label: 'Quantity', requirement: 'Delivered quantity: ' + job.quantity + ' ' + job.unit, required: true, evidenceRequired: false },
    { id: 'finish', label: 'Surface finish & workmanship', requirement: 'No visible defects, burrs or damage.', required: true, evidenceRequired: false },
    { id: 'requirements', label: 'Job requirements', requirement: job.processes.join(', ') || job.capability, required: false, evidenceRequired: false },
  ];
}
const RESULTS: InspectionFinding['result'][] = ['UNRECORDED', 'PASS', 'FAIL', 'NOT_APPLICABLE'];
const FINDINGS_LIMIT = 2000;

/** Readable text the backend stores; parseFindings() reads it back. */
export function serializeFindings(
  checklist: InspectionCheck[], findings: InspectionFindings,
  rework?: { reason: string; correctiveAction: string; reworkDeadline: string },
): string {
  const lines = [findings.summary.trim()];
  if (rework) lines.push('Rework reason: ' + rework.reason.trim(), 'Corrective action: ' + rework.correctiveAction.trim(), 'Rework deadline: ' + rework.reworkDeadline);
  lines.push('Checklist:');
  for (const item of findings.items) {
    const label = checklist.find(check => check.id === item.id)?.label ?? item.id;
    const evidence = item.evidence.length ? ' [evidence: ' + item.evidence.map(file => file.name).join(', ') + ']' : '';
    lines.push('- ' + label + ': ' + item.result + (item.notes.trim() ? ' — ' + item.notes.trim().replace(/\s*\n\s*/g, ' ') : '') + evidence);
  }
  const text = lines.join('\n');
  if (text.length > FINDINGS_LIMIT) {
    throw new ServiceError('VALIDATION', 'The recorded findings are ' + text.length + ' characters; the server accepts at most ' + FINDINGS_LIMIT + '. Shorten the summary or notes.');
  }
  return text;
}
export function parseFindings(text: string, checklist: InspectionCheck[]) {
  const lines = text.split('\n');
  const summary: string[] = [];
  const items: InspectionFinding[] = [];
  let reason: string | undefined; let correctiveAction: string | undefined; let reworkDeadline: string | undefined;
  let inChecklist = false;
  for (const line of lines) {
    if (line === 'Checklist:') { inChecklist = true; continue; }
    if (inChecklist) {
      const match = /^- (.+?): (UNRECORDED|PASS|FAIL|NOT_APPLICABLE)(?: — (.*?))?(?: \[evidence: .*\])?$/.exec(line);
      if (match) {
        const label = match[1]!; const result = match[2] as InspectionFinding['result'];
        const id = checklist.find(check => check.label === label)?.id ?? label;
        if (RESULTS.includes(result)) items.push({ id, result, notes: match[3] ?? '', evidence: [] });
        continue;
      }
    }
    if (line.startsWith('Rework reason: ')) { reason = line.slice(15); continue; }
    if (line.startsWith('Corrective action: ')) { correctiveAction = line.slice(19); continue; }
    if (line.startsWith('Rework deadline: ')) { reworkDeadline = line.slice(17); continue; }
    if (!inChecklist) summary.push(line);
  }
  return { summary: summary.join('\n').trim(), items, reason, correctiveAction, reworkDeadline };
}

export function qcStatus(value: BackendInspection['status']): QCStatus {
  return value === 'PASSED' ? 'ACCEPTED' : value === 'FAILED' ? 'FAILED' : 'REWORK';
}
export function decisionRecord(item: BackendInspection, checklist: InspectionCheck[]): InspectionDecisionRecord {
  const stored = storedChecklistSchema.safeParse(item.checklist);
  if (stored.success) {
    // M11: structured record; findings is the free-text summary only.
    const common = { id: item.id, inspectorId: item.inspectorId, submittedAt: item.inspectedAt, findings: { summary: item.findings || 'No findings recorded.', items: findingsFromStored(stored.data, item.id) } };
    if (item.status === 'PASSED') return { ...common, decision: 'ACCEPTED' };
    if (item.status === 'FAILED') return { ...common, decision: 'FAILED' };
    const rework = stored.data.rework;
    return { ...common, decision: 'REWORK', reason: rework?.reason ?? (item.findings ?? ''), correctiveAction: rework?.correctiveAction ?? '', reworkDeadline: rework?.deadline ?? '' };
  }
  // Inspections recorded before M11 kept the checklist inside the findings text.
  const parsed = parseFindings(item.findings ?? '', checklist);
  const common = { id: item.id, inspectorId: item.inspectorId, submittedAt: item.inspectedAt, findings: { summary: parsed.summary || 'No findings recorded.', items: parsed.items } };
  if (item.status === 'PASSED') return { ...common, decision: 'ACCEPTED' };
  if (item.status === 'FAILED') return { ...common, decision: 'FAILED' };
  return { ...common, decision: 'REWORK', reason: parsed.reason ?? parsed.summary, correctiveAction: parsed.correctiveAction ?? '', reworkDeadline: parsed.reworkDeadline ?? '' };
}
/** One backend inspection as a read-only frontend inspection record (buyer, workshop and admin views). */
export function inspectionView(item: BackendInspection, checklist: InspectionCheck[] = []): Inspection {
  const record = decisionRecord(item, checklist);
  const deadline = record.decision === 'REWORK' ? record.reworkDeadline : '';
  return {
    id: item.id, orderId: item.orderId, inspectorId: item.inspectorId, decision: qcStatus(item.status),
    notes: item.findings ?? '', evidence: [], updatedAt: item.inspectedAt, history: [record], ...opt('reworkDeadline', deadline),
  };
}
/** Newest first, as the backend orders them. */
export const latestInspection = (items: BackendInspection[]) =>
  [...items].sort((a, b) => b.inspectedAt.localeCompare(a.inspectedAt) || b.id.localeCompare(a.id))[0];

// ---------- Orders, milestones, payments ----------

export function milestoneView(item: z.infer<typeof milestoneSchema>, fallbackDue: string): Milestone {
  const stage = (['PENDING', 'IN_PROGRESS', 'COMPLETED', 'APPROVED', 'REWORK_REQUIRED'] as const).find(value => value === item.status) ?? 'PENDING';
  const status: Milestone['status'] = stage === 'APPROVED' || stage === 'COMPLETED' ? 'COMPLETED' : stage === 'PENDING' ? 'PENDING' : 'IN_PROGRESS';
  const notes = stage === 'REWORK_REQUIRED' ? 'Rework required' + (item.notes ? ': ' + item.notes : '') : item.notes;
  return {
    id: item.id, orderId: item.orderId, title: item.title, dueOn: calendarDay(item.dueDate) || fallbackDue, status, stage, sequence: item.sequence,
    ...opt('completedAt', item.completedAt), ...opt('description', item.description), ...opt('notes', notes),
  };
}
export function orderStatus(order: Pick<BackendOrder, 'status'>, latest: BackendInspection | undefined): OrderStatus {
  if (order.status === 'CONFIRMED') return 'AWARDED';
  if (order.status === 'COMPLETED') return 'CLOSED';
  if (order.status === 'CANCELLED') return 'CANCELLED';
  if (!latest) return 'IN_PRODUCTION';
  return latest.status === 'PASSED' ? 'ACCEPTED' : 'REWORK';
}
export function orderView(order: Omit<BackendOrder, 'job'>, fallbackDue = ''): Order {
  const inspections = order.inspections ?? [];
  const latest = latestInspection(inspections);
  const due = dayInIndia(order.expectedCompletionDate) || fallbackDue;
  return {
    id: order.id, jobId: order.jobId, workshopId: order.workshopId, buyerId: order.buyerId, quoteId: order.quoteId,
    status: orderStatus(order, latest), createdAt: order.createdAt, backendStatus: order.status, agreedPrice: amount(order.agreedPrice),
    milestones: (order.milestones ?? []).map(step => milestoneView(step, due)),
    ...(latest ? { qcStatus: qcStatus(latest.status) } : {}), ...opt('cancellationReason', order.cancellationReason),
  };
}
const PAYMENT_STATUS: Record<z.infer<typeof paymentSchema>['status'], PaymentRecord['simulationStatus']> = {
  PENDING: 'PENDING', SUCCEEDED: 'SIMULATED_PAID', FAILED: 'SIMULATED_FAILED', REFUNDED: 'SIMULATED_REFUNDED',
};
export function paymentView(item: z.infer<typeof paymentSchema>): PaymentRecord {
  return {
    id: item.id, orderId: item.orderId, simulationStatus: PAYMENT_STATUS[item.status], amount: amount(item.amount), createdAt: item.createdAt,
    ...opt('description', item.description), ...opt('paidAt', item.paidAt), ...opt('refundedAt', item.refundedAt),
  };
}
export function summaryView(item: z.infer<typeof paymentSummarySchema>): PaymentSummary {
  return {
    agreedPrice: amount(item.agreedPrice), paid: amount(item.paid), pending: amount(item.pending),
    remaining: amount(item.remaining), refunded: amount(item.refunded), refundDue: amount(item.refundDue),
  };
}
export function reviewView(orderId: string, rating: { id: string; score: number; review?: string | null | undefined }): Review {
  return { id: rating.id, orderId, rating: rating.score, ...opt('comment', rating.review) };
}
