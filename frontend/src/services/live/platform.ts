import { z } from 'zod';
import type { AuditService, FileService, NotificationService, StoredDocument } from '../platform';
import { api, apiDownload, apiUpload } from './http';

const enc = encodeURIComponent;

// ---------- Documents ----------
const documentSchema = z.object({
  id: z.string(), kind: z.enum(['DESIGN_FILE', 'INSPECTION_EVIDENCE']), uploaderId: z.string(), inspectionId: z.string().nullable(),
  originalName: z.string(), mimeType: z.string(), sizeBytes: z.number(), createdAt: z.string(),
  uploader: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});
function documentView(doc: z.infer<typeof documentSchema>): StoredDocument {
  return {
    id: doc.id, kind: doc.kind, name: doc.originalName, mediaType: doc.mimeType, sizeBytes: doc.sizeBytes, uploadedAt: doc.createdAt,
    uploaderId: doc.uploaderId, uploaderName: doc.uploader?.name ?? 'Unknown', inspectionId: doc.inspectionId,
  };
}
const listSchema = z.object({ documents: z.array(documentSchema) });
const oneSchema = z.object({ document: documentSchema });

/** Stored files (M12): design files on jobs, inspection evidence on orders. Access is decided by the server. */
export function createLiveFiles(): FileService {
  return {
    accept: '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx,.dxf,.dwg,.step,.stp,.stl,.iges,.igs',
    async listJobFiles(jobId) { return (await api('/jobs/' + enc(jobId) + '/documents', listSchema)).documents.map(documentView); },
    async uploadJobFile(jobId, file) { return documentView((await apiUpload('/jobs/' + enc(jobId) + '/documents', file, oneSchema)).document); },
    async listOrderFiles(orderId) { return (await api('/orders/' + enc(orderId) + '/documents', listSchema)).documents.map(documentView); },
    async uploadEvidence(orderId, file) { return documentView((await apiUpload('/orders/' + enc(orderId) + '/documents', file, oneSchema)).document); },
    async download(document) { await apiDownload('/documents/' + enc(document.id) + '/download', document.name); },
    async remove(documentId) { await api('/documents/' + enc(documentId), z.unknown(), { method: 'DELETE' }); },
  };
}

// ---------- Audit ----------
const auditSchema = z.object({
  id: z.string(), actorId: z.string().nullable(), actorRole: z.string().nullable(), action: z.string(), entityType: z.string(),
  entityId: z.string(), orderId: z.string().nullable(), jobId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(), createdAt: z.string(),
});
const pageSchema = z.object({ page: z.number(), totalPages: z.number(), total: z.number() });

export function createLiveAudit(): AuditService {
  return {
    async list(filters) {
      const data = await api('/audit', z.object({ items: z.array(auditSchema), pagination: pageSchema }), {
        query: { page: filters.page ?? 1, limit: 25, action: filters.action || undefined, entityType: filters.entityType || undefined, actorId: filters.actorId || undefined, orderId: filters.orderId || undefined },
      });
      return { items: data.items, ...data.pagination };
    },
    async orderHistory(orderId) {
      const all: z.infer<typeof auditSchema>[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const data = await api('/orders/' + enc(orderId) + '/history', z.object({ items: z.array(auditSchema), pagination: pageSchema }), { query: { page, limit: 100 } });
        all.push(...data.items);
        if (page >= data.pagination.totalPages) break;
      }
      return all;
    },
  };
}

// ---------- Notifications ----------
const notificationSchema = z.object({
  id: z.string(), type: z.string(), title: z.string(), body: z.string(), link: z.string().nullable(), readAt: z.string().nullable(), createdAt: z.string(),
});

export function createLiveNotifications(): NotificationService {
  return {
    async list(options) {
      const data = await api('/notifications', z.object({ items: z.array(notificationSchema), unread: z.number(), pagination: pageSchema }), {
        query: { page: options.page ?? 1, limit: 20, ...(options.unread ? { unread: 'true' } : {}) },
      });
      return {
        items: data.items.map(item => ({ id: item.id, type: item.type, title: item.title, body: item.body, link: item.link, read: item.readAt !== null, createdAt: item.createdAt })),
        unread: data.unread, ...data.pagination,
      };
    },
    async unreadCount() { return (await api('/notifications/unread-count', z.object({ unread: z.number() }))).unread; },
    async markRead(id) { await api('/notifications/' + enc(id) + '/read', z.unknown(), { method: 'POST' }); },
    async markAllRead() { await api('/notifications/read-all', z.unknown(), { method: 'POST' }); },
  };
}
