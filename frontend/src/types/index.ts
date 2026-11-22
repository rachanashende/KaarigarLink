// Provisional contracts: backend owners must approve enums, money and date formats.
export type Role = 'buyer' | 'workshop' | 'inspector' | 'admin';
export type OrderStatus = 'POSTED' | 'QUOTING' | 'AWARDED' | 'IN_PRODUCTION' | 'QC_PENDING' | 'ACCEPTED' | 'REWORK' | 'PAID' | 'CLOSED' | 'CANCELLED';
export type JobStatus = 'POSTED' | 'QUOTING' | 'AWARDED' | 'CLOSED' | 'CANCELLED';
export type QCStatus = 'PENDING' | 'ACCEPTED' | 'REWORK';
export interface User { id: string; role: Role; name: string; email: string }
export interface Location { city: string; state: string; address?: string }
export interface Machine { id: string; name: string; process: string }
export interface CapacitySlot { id: string; startsOn: string; endsOn: string; availableQuantity: number; unit: string }
export interface Workshop {
  id: string; ownerId: string; name: string; location: Location;
  coordinates?: { latitude: number; longitude: number };
  capabilities: string[]; machines: Machine[]; capacitySlots: CapacitySlot[]; rating?: number;
}
export interface FileMetadata { id: string; name: string; mediaType: string; sizeBytes: number }
export interface Job {
  id: string; buyerId: string; title: string; description: string; capability: string;
  material: string; specification: string; quantity: number; unit: string; processes: string[];
  createdAt?: string; deadline: string; location: Location; budget?: number; designFiles: FileMetadata[]; status: JobStatus;
}
export interface MatchResult { jobId: string; workshopId: string; score: number; explanations: string[]; eligibility: { eligible: boolean; reasons: string[] } }
export interface Invitation { id: string; jobId: string; workshopId: string; status: 'PENDING' | 'ACCEPTED' | 'DECLINED' }
export interface Quote { id: string; jobId: string; workshopId: string; amount: number; estimatedDelivery: string; notes: string; status: 'SUBMITTED' | 'AWARDED' | 'REJECTED' | 'WITHDRAWN' }
export interface Milestone { id: string; orderId: string; title: string; dueOn: string; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'; completedAt?: string; description?: string; notes?: string }
export interface Order { id: string; jobId: string; workshopId: string; buyerId: string; quoteId: string; status: OrderStatus; createdAt?: string; milestones: Milestone[]; qcStatus?: QCStatus }
export interface InspectionCheck { id: string; label: string; requirement: string; required: boolean; evidenceRequired: boolean }
export interface InspectionFinding { id: string; result: 'UNRECORDED' | 'PASS' | 'FAIL' | 'NOT_APPLICABLE'; notes: string; evidence: FileMetadata[] }
export interface InspectionFindings { items: InspectionFinding[]; summary: string }
export type InspectionDecisionRecord = { id: string; inspectorId: string; submittedAt: string; findings: InspectionFindings } & ({ decision: 'ACCEPTED' } | { decision: 'REWORK'; reason: string; correctiveAction: string; reworkDeadline: string });
export interface Inspection { id: string; orderId: string; inspectorId: string; decision: QCStatus; notes: string; evidence: FileMetadata[]; reworkDeadline?: string; dueOn?: string; assignedAt?: string; updatedAt?: string; checklist?: InspectionCheck[]; draft?: InspectionFindings; history?: InspectionDecisionRecord[] }
export interface PaymentRecord { id: string; orderId: string; simulationStatus: 'PENDING' | 'SIMULATED_PAID' | 'SIMULATED_FAILED' }
export interface Review { id: string; orderId: string; rating: number; comment?: string }
export interface AuditEvent { id: string; actorId: string; entityId: string; entityType: string; action: string; occurredAt: string }
export interface Collections {
  users: User[]; workshops: Workshop[]; jobs: Job[]; matches: MatchResult[]; invitations: Invitation[];
  quotes: Quote[]; orders: Order[]; milestones: Milestone[]; inspections: Inspection[];
  payments: PaymentRecord[]; reviews: Review[]; auditEvents: AuditEvent[];
}
