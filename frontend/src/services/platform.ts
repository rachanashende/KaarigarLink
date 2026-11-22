/**
 * M12 platform services (live mode only; optional on DataService so mock mode is
 * unchanged): stored documents, audit history and in-app notifications.
 */
export interface StoredDocument {
  id: string; kind: 'DESIGN_FILE' | 'INSPECTION_EVIDENCE'; name: string; mediaType: string; sizeBytes: number;
  uploadedAt: string; uploaderId: string; uploaderName: string; inspectionId: string | null;
}
export interface FileService {
  /** For <input accept>: the extensions the server accepts. */
  readonly accept: string;
  listJobFiles(jobId: string): Promise<StoredDocument[]>;
  uploadJobFile(jobId: string, file: File): Promise<StoredDocument>;
  listOrderFiles(orderId: string): Promise<StoredDocument[]>;
  uploadEvidence(orderId: string, file: File): Promise<StoredDocument>;
  /** Downloads with the session token and hands the file to the browser. */
  download(document: StoredDocument): Promise<void>;
  remove(documentId: string): Promise<void>;
}

export interface AuditRecord {
  id: string; actorId: string | null; actorRole: string | null; action: string; entityType: string; entityId: string;
  orderId: string | null; jobId: string | null; metadata: Record<string, unknown> | null; createdAt: string;
}
export interface Page<T> { items: T[]; page: number; totalPages: number; total: number }
export interface AuditFilters { action?: string; entityType?: string; actorId?: string; orderId?: string; page?: number }
export interface AuditService {
  list(filters: AuditFilters): Promise<Page<AuditRecord>>;
  orderHistory(orderId: string): Promise<AuditRecord[]>;
}

export interface AppNotification { id: string; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: string }
export interface NotificationService {
  list(options: { unread?: boolean; page?: number }): Promise<Page<AppNotification> & { unread: number }>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}

/** Human-readable audit action, e.g. ORDER_COMPLETED -> "Order completed". */
export function auditLabel(action: string): string {
  const text = action.replaceAll('_', ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
