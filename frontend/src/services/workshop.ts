import { z } from 'zod';
import type { WorkshopCommands, invitationActions, quotationActions } from './workshopCommands';
import type { Inspection, InspectionDecisionRecord, InspectionFinding, Invitation, Job, Order, PaymentRecord, Quote, User, Workshop } from '@/types';

export type WorkshopJob = Omit<Job, 'designFiles'>;
export type WorkshopBuyer = Pick<User, 'id' | 'name'>;
export type WorkshopDecision = Pick<InspectionDecisionRecord, 'id' | 'inspectorId' | 'submittedAt'> & {
  findings: { summary: string; items: Pick<InspectionFinding, 'id' | 'result' | 'notes'>[] };
} & ({ decision: 'ACCEPTED' } | { decision: 'FAILED' } | { decision: 'REWORK'; reason: string; correctiveAction: string; reworkDeadline: string });
export type WorkshopInspection = Pick<Inspection, 'id' | 'orderId' | 'inspectorId' | 'decision' | 'notes' | 'dueOn' | 'assignedAt' | 'updatedAt' | 'reworkDeadline'> & { history: WorkshopDecision[] };
export interface WorkshopInvitationData { invitation: Invitation; job: WorkshopJob; buyer: WorkshopBuyer; quotes: Quote[]; actions: ReturnType<typeof invitationActions> }
export interface WorkshopQuotationData { quote: Quote; job: WorkshopJob; buyer: WorkshopBuyer; actions: ReturnType<typeof quotationActions> }
export interface WorkshopOrderData {
  order: Order; job: WorkshopJob; buyer: WorkshopBuyer; quote: Quote;
  inspections: WorkshopInspection[]; payments: PaymentRecord[];
}
export interface WorkshopSummary {
  invitations: number; submittedQuotes: number; activeOrders: number;
  pendingInspections: number; openRework: number; closedOrders: number;
}
export interface WorkshopWorkspace {
  account: User; profile: Workshop | null;
  invitations: WorkshopInvitationData[]; quotations: WorkshopQuotationData[]; orders: WorkshopOrderData[];
  summary: WorkshopSummary;
}
/** Live mode: profile, machinery, capabilities and capacity management (backend /workshops/:id/...). */
export interface WorkshopProfileCommands {
  getProfileRecord?(actorId: string): Promise<WorkshopProfileRecord>;
  updateProfile?(actorId: string, input: WorkshopProfileInput): Promise<void>;
  saveMachine?(actorId: string, input: MachineInput, machineId?: string): Promise<void>;
  deleteMachine?(actorId: string, machineId: string): Promise<void>;
  saveCapability?(actorId: string, input: CapabilityInput, capabilityId?: string): Promise<void>;
  deleteCapability?(actorId: string, capabilityId: string): Promise<void>;
  saveCapacity?(actorId: string, input: CapacityInput, capacityId?: string): Promise<void>;
  deleteCapacity?(actorId: string, capacityId: string): Promise<void>;
}
export const MACHINE_TYPES = ['CNC_MILL', 'CNC_LATHE', 'MANUAL_LATHE', 'LASER_CUTTER', 'PRESS_BRAKE', 'PUNCH_PRESS', 'WELDING_STATION', 'INJECTION_MOLDER', 'CASTING_FURNACE', 'FORGING_HAMMER', 'THREE_D_PRINTER', 'POWDER_COATING_BOOTH', 'OTHER'] as const;
export const MACHINE_STATUSES = ['OPERATIONAL', 'MAINTENANCE', 'OFFLINE'] as const;
export const PROCESSES = ['CNC_MACHINING', 'LATHE_TURNING', 'SHEET_METAL_FABRICATION', 'LASER_CUTTING', 'WELDING', 'INJECTION_MOLDING', 'CASTING', 'FORGING', 'THREE_D_PRINTING', 'POWDER_COATING'] as const;
export const QUANTITY_UNITS = ['UNITS', 'KG'] as const;
/** The editable backend profile, with exact enum values (live mode only). */
export interface WorkshopProfileRecord {
  id: string; businessName: string; description: string; address: string; city: string;
  latitude: number | null; longitude: number | null; certifications: string[];
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED'; rating: number; ratingCount: number; totalCompletedJobs: number;
  machines: { id: string; machineName: string; machineType: string; quantity: number; operationalStatus: string }[];
  capabilities: { id: string; manufacturingProcess: string; supportedMaterials: string[]; leadTimeDays: number }[];
  capacities: { id: string; availableCapacity: number; capacityUnit: string; startDate: string; endDate: string }[];
}
const optionalText = (max: number) => z.string().trim().max(max, 'Use no more than ' + max + ' characters.');
export const workshopProfileSchema = z.strictObject({
  businessName: z.string().trim().min(2, 'Enter at least 2 characters.').max(120, 'Use no more than 120 characters.'),
  description: optionalText(2000), address: optionalText(300), city: optionalText(100),
  latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(),
  certifications: z.array(z.string().trim().min(1).max(50)).max(20, 'Use at most 20 certifications.'),
}).refine(value => (value.latitude === null) === (value.longitude === null), { path: ['longitude'], message: 'Enter latitude and longitude together, or neither.' });
export type WorkshopProfileInput = z.infer<typeof workshopProfileSchema>;
export const machineInputSchema = z.strictObject({
  machineName: z.string().trim().min(1, 'Enter a machine name.').max(120, 'Use no more than 120 characters.'),
  machineType: z.enum(MACHINE_TYPES), quantity: z.number().int('Use a whole number.').min(1).max(10000), operationalStatus: z.enum(MACHINE_STATUSES),
});
export type MachineInput = z.infer<typeof machineInputSchema>;
export const capabilityInputSchema = z.strictObject({
  manufacturingProcess: z.enum(PROCESSES),
  supportedMaterials: z.array(z.string().trim().min(1).max(60)).min(1, 'Enter at least one material.').max(50),
  leadTimeDays: z.number().int('Use a whole number.').min(0).max(365),
});
export type CapabilityInput = z.infer<typeof capabilityInputSchema>;
export const capacityInputSchema = z.strictObject({
  availableCapacity: z.number().int('Use a whole number.').min(0).max(10_000_000),
  capacityUnit: z.enum(QUANTITY_UNITS), startDate: z.iso.date({ error: 'Enter a start date.' }), endDate: z.iso.date({ error: 'Enter an end date.' }),
}).refine(value => value.endDate >= value.startDate, { path: ['endDate'], message: 'The end date must be on or after the start date.' });
export type CapacityInput = z.infer<typeof capacityInputSchema>;
/** Live mode: a new production milestone (backend POST /orders/:orderId/milestones). */
export const milestoneInputSchema = z.strictObject({
  title: z.string().trim().min(1, 'Enter a milestone title.').max(200, 'Use no more than 200 characters.'),
  sequence: z.number({ error: 'Enter a sequence number.' }).int('Use a whole number.').min(1, 'Use 1 or more.').max(1000, 'Use 1000 or less.'),
  dueOn: z.iso.date({ error: 'Enter a valid date.' }).optional(),
  description: z.string().trim().max(2000, 'Use no more than 2000 characters.').optional(),
});
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;
/**
 * Production, milestone and refund commands. Optional: only the live adapter
 * implements them (the mock workspace keeps these actions disabled), and the UI
 * shows the controls only when a command exists. The backend enforces ownership
 * and every state rule; the UI only reflects them.
 */
export interface WorkshopOrderCommands extends WorkshopProfileCommands {
  startOrder?(actorId: string, orderId: string): Promise<void>;
  createMilestone?(actorId: string, orderId: string, input: MilestoneInput): Promise<void>;
  startMilestone?(actorId: string, milestoneId: string): Promise<void>;
  completeMilestone?(actorId: string, milestoneId: string): Promise<void>;
  refundPayment?(actorId: string, paymentId: string): Promise<void>;
}
// Actor IDs scope the mock store; in live mode the backend authorises from the JWT.
export interface WorkshopService extends WorkshopCommands, WorkshopOrderCommands {
  getWorkspace(actorId: string): Promise<WorkshopWorkspace>;
  getInvitation(actorId: string, invitationId: string): Promise<WorkshopInvitationData>;
  getOrder(actorId: string, orderId: string): Promise<WorkshopOrderData>;
}
