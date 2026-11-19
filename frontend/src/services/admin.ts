import type { AuditEvent, Inspection, Invitation, Job, MatchResult, Order, Quote, User, Workshop } from '@/types';

// A bounded mock read model, not an approved HTTP endpoint or a moderation capability.
export interface AdminOverview {
  users: User[]; workshops: Workshop[]; jobs: Job[]; orders: Order[];
  inspections: Inspection[]; matches: MatchResult[]; invitations: Invitation[]; quotes: Quote[]; activity: AuditEvent[];
}
export interface AdminService { getOverview(adminId: string): Promise<AdminOverview> }
