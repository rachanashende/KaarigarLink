import { z } from 'zod';

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);

export const pageQuery = z.object({ page, limit }).strict();
/** M12: GET /api/audit filters (ADMIN). */
export const auditQuery = z
  .object({
    action: z.string().trim().min(1).max(60).optional(),
    entityType: z.string().trim().min(1).max(40).optional(),
    actorId: z.string().trim().min(1).optional(),
    orderId: z.string().trim().min(1).optional(),
    jobId: z.string().trim().min(1).optional(),
    page,
    limit,
  })
  .strict();
export const notificationsQuery = z
  .object({ unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(), page, limit })
  .strict();
export const notificationIdParams = z.object({ notificationId: z.string().min(1) });
export const documentIdParams = z.object({ documentId: z.string().min(1) });

export type PageQuery = z.infer<typeof pageQuery>;
export type AuditQuery = z.infer<typeof auditQuery>;
export type NotificationsQuery = z.infer<typeof notificationsQuery>;
