import { Router, raw } from 'express';
import * as c from '../controllers/activity.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { env } from '../config/env';
import { auditQuery, documentIdParams, notificationIdParams, notificationsQuery, pageQuery } from '../validators/activity.validator';
import { jobIdParams } from '../validators/job.validator';
import { orderIdParamsSchema } from '../validators/order.validator';

/**
 * M12 routes for documents, audit history and notifications. Upload bodies are the
 * raw file bytes (Content-Type = the file's MIME type, X-File-Name = the URI-encoded
 * name). They are parsed only after authentication, with the configured size limit.
 */
export const fileBody = raw({ type: () => true, limit: env.MAX_UPLOAD_BYTES });

/** Mounted at /api: paths are listed in full here for clarity. */
const router = Router();
// authenticate per route (not router.use): this router is mounted at /api, and must not
// turn unknown /api routes into 401s.

// Documents
router.post('/jobs/:id/documents', authenticate, authorize('BUYER'), validate({ params: jobIdParams }), fileBody, c.uploadJobDocument);
router.get('/jobs/:id/documents', authenticate, validate({ params: jobIdParams }), c.listJobDocuments);
router.post('/orders/:orderId/documents', authenticate, authorize('INSPECTOR'), validate({ params: orderIdParamsSchema }), fileBody, c.uploadOrderEvidence);
router.get('/orders/:orderId/documents', authenticate, validate({ params: orderIdParamsSchema }), c.listOrderDocuments);
router.get('/documents/:documentId/download', authenticate, validate({ params: documentIdParams }), c.download);
router.delete('/documents/:documentId', authenticate, validate({ params: documentIdParams }), c.remove);

// Audit history
router.get('/audit', authenticate, authorize('ADMIN'), validate({ query: auditQuery }), c.audit);
router.get('/orders/:orderId/history', authenticate, validate({ params: orderIdParamsSchema, query: pageQuery }), c.orderHistory);

// Notifications (always the caller's own)
router.get('/notifications', authenticate, validate({ query: notificationsQuery }), c.notifications);
router.get('/notifications/unread-count', authenticate, c.unreadCount);
router.post('/notifications/read-all', authenticate, c.markAllRead);
router.post('/notifications/:notificationId/read', authenticate, validate({ params: notificationIdParams }), c.markRead);

export default router;
