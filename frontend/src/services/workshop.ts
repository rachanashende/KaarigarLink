import type { WorkshopCommands, invitationActions, quotationActions } from './workshopCommands';
import type { Inspection, InspectionDecisionRecord, InspectionFinding, Invitation, Job, Order, PaymentRecord, Quote, User, Workshop } from '@/types';

export type WorkshopJob = Omit<Job, 'designFiles'>;
export type WorkshopBuyer = Pick<User, 'id' | 'name'>;
export type WorkshopDecision = Pick<InspectionDecisionRecord, 'id' | 'inspectorId' | 'submittedAt'> & {
  findings: { summary: string; items: Pick<InspectionFinding, 'id' | 'result' | 'notes'>[] };
} & ({ decision: 'ACCEPTED' } | { decision: 'REWORK'; reason: string; correctiveAction: string; reworkDeadline: string });
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
// Mock contracts only; actor IDs emulate scoping, not server authentication.
export interface WorkshopService extends WorkshopCommands {
  getWorkspace(actorId: string): Promise<WorkshopWorkspace>;
  getInvitation(actorId: string, invitationId: string): Promise<WorkshopInvitationData>;
  getOrder(actorId: string, orderId: string): Promise<WorkshopOrderData>;
}
