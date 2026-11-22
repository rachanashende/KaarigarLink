import type { Request, Response } from 'express';
import * as activity from '../services/activity.service';
import * as documents from '../services/document.service';
import { sendSuccess } from '../utils/apiResponse';
import { param } from '../utils/params';
import type { AuditQuery, NotificationsQuery, PageQuery } from '../validators/activity.validator';

// ---------- Audit ----------
export async function audit(req: Request, res: Response) {
  sendSuccess(res, await activity.listAudit(req.user!, req.query as unknown as AuditQuery), 'Audit history fetched');
}
export async function orderHistory(req: Request, res: Response) {
  sendSuccess(res, await activity.orderHistory(req.user!, param(req, 'orderId'), req.query as unknown as PageQuery), 'Order history fetched');
}

// ---------- Notifications ----------
export async function notifications(req: Request, res: Response) {
  sendSuccess(res, await activity.listNotifications(req.user!, req.query as unknown as NotificationsQuery), 'Notifications fetched');
}
export async function unreadCount(req: Request, res: Response) {
  sendSuccess(res, await activity.unreadCount(req.user!), 'Unread count fetched');
}
export async function markRead(req: Request, res: Response) {
  sendSuccess(res, await activity.markRead(req.user!, param(req, 'notificationId')), 'Notification marked as read');
}
export async function markAllRead(req: Request, res: Response) {
  sendSuccess(res, await activity.markAllRead(req.user!), 'Notifications marked as read');
}

// ---------- Documents ----------
function upload(req: Request) {
  if (!Buffer.isBuffer(req.body)) return { fileName: '', mimeType: '', contents: Buffer.alloc(0) };
  return {
    fileName: String(req.headers['x-file-name'] ?? ''),
    mimeType: String(req.headers['content-type'] ?? 'application/octet-stream'),
    contents: req.body,
  };
}
export async function uploadJobDocument(req: Request, res: Response) {
  const document = await documents.uploadJobDocument(req.user!, param(req, 'id'), upload(req));
  sendSuccess(res, { document }, 'File uploaded', 201);
}
export async function listJobDocuments(req: Request, res: Response) {
  sendSuccess(res, { documents: await documents.listJobDocuments(req.user!, param(req, 'id')) }, 'Files fetched');
}
export async function uploadOrderEvidence(req: Request, res: Response) {
  const document = await documents.uploadOrderEvidence(req.user!, param(req, 'orderId'), upload(req));
  sendSuccess(res, { document }, 'Evidence uploaded', 201);
}
export async function listOrderDocuments(req: Request, res: Response) {
  sendSuccess(res, { documents: await documents.listOrderDocuments(req.user!, param(req, 'orderId')) }, 'Files fetched');
}
export async function download(req: Request, res: Response) {
  const { doc, stream } = await documents.openDocument(req.user!, param(req, 'documentId'));
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', String(doc.sizeBytes));
  // Always an attachment (never rendered inline), with an RFC 5987 encoded name.
  res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
  stream.pipe(res);
}
export async function remove(req: Request, res: Response) {
  sendSuccess(res, await documents.deleteDocument(req.user!, param(req, 'documentId')), 'File deleted');
}
