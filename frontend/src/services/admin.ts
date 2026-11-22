import type { AuditEvent, Inspection, Invitation, Job, MatchResult, Order, Quote, User, Workshop } from '@/types';

// A bounded mock read model, not an approved HTTP endpoint or a moderation capability.
export interface AdminOverview {
  users: User[]; workshops: Workshop[]; jobs: Job[]; orders: Order[];
  inspections: Inspection[]; matches: MatchResult[]; invitations: Invitation[]; quotes: Quote[]; activity: AuditEvent[];
  /** Live mode only: the current inspector assignment per order id. */
  assignments?: Record<string, { inspectorId: string; assignedAt: string }>;
}
export interface InspectorOption { id: string; name: string; email: string; activeAssignments: number }
export interface AssignmentRecord { id: string; inspectorId: string; inspectorName: string; assignedByName: string; assignedAt: string; endedAt?: string; endedByName?: string; active: boolean }
export interface AdminService {
  getOverview(adminId: string): Promise<AdminOverview>;
  // Optional admin commands: implemented by the live adapter only (backend-authorised).
  verifyWorkshop?(adminId: string, workshopId: string, status: 'PENDING' | 'VERIFIED' | 'REJECTED'): Promise<void>;
  listInspectors?(adminId: string): Promise<InspectorOption[]>;
  listAssignments?(adminId: string, orderId: string): Promise<AssignmentRecord[]>;
  assignInspector?(adminId: string, orderId: string, inspectorId: string): Promise<void>;
  unassignInspector?(adminId: string, orderId: string): Promise<void>;
}
