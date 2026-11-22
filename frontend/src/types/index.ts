// Frontend domain model. Mock mode uses it directly; live mode maps backend records
// into it (src/services/live/mappers.ts). Fields marked "live mode only" carry exact
// backend values the mock fixtures do not have, so live data is never lost.
export type Role = 'buyer' | 'workshop' | 'inspector' | 'admin';
export type OrderStatus = 'POSTED' | 'QUOTING' | 'AWARDED' | 'IN_PRODUCTION' | 'QC_PENDING' | 'ACCEPTED' | 'REWORK' | 'PAID' | 'CLOSED' | 'CANCELLED';
export type JobStatus = 'DRAFT' | 'POSTED' | 'QUOTING' | 'AWARDED' | 'CLOSED' | 'CANCELLED';
/** Live mode only: the exact backend job status (JobStatus above is the workflow summary). */
export type BackendJobStatus = 'DRAFT' | 'OPEN' | 'MATCHED' | 'AWARDED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type QCStatus = 'PENDING' | 'ACCEPTED' | 'REWORK' | 'FAILED';
export interface User { id: string; role: Role; name: string; email: string }
export interface Location { city: string; state: string; address?: string }
export interface Machine { id: string; name: string; process: string }
export interface CapacitySlot { id: string; startsOn: string; endsOn: string; availableQuantity: number; unit: string }
export interface Workshop {
  id: string; ownerId: string; name: string; location: Location;
  coordinates?: { latitude: number; longitude: number };
  capabilities: string[]; machines: Machine[]; capacitySlots: CapacitySlot[]; rating?: number;
  /** Live mode only: the backend verification status. */
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
}
export interface FileMetadata {
  id: string; name: string; mediaType: string; sizeBytes: number;
  /** Live mode only (M12): the stored document holding the file contents. */
  documentId?: string | undefined;
}
export interface Job {
  id: string; buyerId: string; title: string; description: string; capability: string;
  material: string; specification: string; quantity: number; unit: string; processes: string[];
  createdAt?: string; deadline: string; location: Location; budget?: number; designFiles: FileMetadata[]; status: JobStatus;
  backendStatus?: BackendJobStatus;
}
export interface MatchResult { jobId: string; workshopId: string; score: number; explanations: string[]; eligibility: { eligible: boolean; reasons: string[] } }
export interface Invitation { id: string; jobId: string; workshopId: string; status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' }
export interface Quote {
  id: string; jobId: string; workshopId: string; amount: number; estimatedDelivery: string; notes: string;
  /** CANCELLED: the job was cancelled before an award (a system action, not a buyer rejection). */
  status: 'SUBMITTED' | 'AWARDED' | 'REJECTED' | 'WITHDRAWN' | 'CANCELLED';
  /** Live mode only: the server version (updatedAt) used to reject stale edits. */
  version?: string;
}
export interface Milestone {
  id: string; orderId: string; title: string; dueOn: string; status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'; completedAt?: string; description?: string; notes?: string;
  /** Live mode only: the exact backend milestone status and sequence (status above is the display summary). */
  stage?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED' | 'REWORK_REQUIRED'; sequence?: number;
}
export interface Order {
  id: string; jobId: string; workshopId: string; buyerId: string; quoteId: string; status: OrderStatus; createdAt?: string; milestones: Milestone[]; qcStatus?: QCStatus;
  /** Live mode only: the exact backend order status and commercial details. */
  backendStatus?: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; agreedPrice?: number; cancellationReason?: string;
}
export interface InspectionCheck { id: string; label: string; requirement: string; required: boolean; evidenceRequired: boolean }
export interface InspectionFinding { id: string; result: 'UNRECORDED' | 'PASS' | 'FAIL' | 'NOT_APPLICABLE'; notes: string; evidence: FileMetadata[] }
export interface InspectionFindings { items: InspectionFinding[]; summary: string }
export type InspectionDecisionRecord = { id: string; inspectorId: string; submittedAt: string; findings: InspectionFindings } & ({ decision: 'ACCEPTED' } | { decision: 'FAILED' } | { decision: 'REWORK'; reason: string; correctiveAction: string; reworkDeadline: string });
export interface Inspection { id: string; orderId: string; inspectorId: string; decision: QCStatus; notes: string; evidence: FileMetadata[]; reworkDeadline?: string; dueOn?: string; assignedAt?: string; updatedAt?: string; checklist?: InspectionCheck[]; draft?: InspectionFindings; history?: InspectionDecisionRecord[] }
export interface PaymentRecord {
  id: string; orderId: string; simulationStatus: 'PENDING' | 'SIMULATED_PAID' | 'SIMULATED_FAILED' | 'SIMULATED_REFUNDED';
  /** Live mode only. */
  amount?: number; description?: string; createdAt?: string; paidAt?: string; refundedAt?: string;
}
export interface Review { id: string; orderId: string; rating: number; comment?: string }
export interface AuditEvent { id: string; actorId: string; entityId: string; entityType: string; action: string; occurredAt: string }
export interface Collections {
  users: User[]; workshops: Workshop[]; jobs: Job[]; matches: MatchResult[]; invitations: Invitation[];
  quotes: Quote[]; orders: Order[]; milestones: Milestone[]; inspections: Inspection[];
  payments: PaymentRecord[]; reviews: Review[]; auditEvents: AuditEvent[];
}
