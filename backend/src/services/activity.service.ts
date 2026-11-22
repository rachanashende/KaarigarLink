/**
 * M12 read side of the audit history and in-app notifications.
 *   - Platform audit history: ADMIN only, paginated, filterable.
 *   - Order history: the order's buyer and awarded workshop, its current inspector, ADMIN.
 *   - Notifications: only the recipient can list or mark them; nobody can delete audit rows.
 */
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { getMyWorkshopId } from './workshop.service';
import { currentInspectorId } from './inspectorAssignment.service';
import type { AuditQuery, NotificationsQuery, PageQuery } from '../validators/activity.validator';

const pagination = (query: PageQuery, total: number) => ({ page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) });

export async function listAudit(user: AuthUser, query: AuditQuery) {
  if (user.role !== 'ADMIN') throw ApiError.forbidden();
  const where: Prisma.AuditEventWhereInput = {
    ...(query.action && { action: query.action }),
    ...(query.entityType && { entityType: query.entityType }),
    ...(query.actorId && { actorId: query.actorId }),
    ...(query.orderId && { orderId: query.orderId }),
    ...(query.jobId && { jobId: query.jobId }),
  };
  const [total, items] = await prisma.$transaction([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
  ]);
  return { items, pagination: pagination(query, total) };
}

export async function orderHistory(user: AuthUser, orderId: string, query: PageQuery) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { buyerId: true, workshopId: true } });
  let allowed = false;
  if (order) {
    if (user.role === 'ADMIN' || order.buyerId === user.id) allowed = true;
    else if (user.role === 'WORKSHOP') allowed = order.workshopId === (await getMyWorkshopId(user).catch(() => null));
    else if (user.role === 'INSPECTOR') allowed = (await currentInspectorId(orderId)) === user.id;
  }
  if (!allowed) throw ApiError.notFound('Order not found');
  const where = { orderId };
  const [total, items] = await prisma.$transaction([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
  ]);
  return { items, pagination: pagination(query, total) };
}

export async function listNotifications(user: AuthUser, query: NotificationsQuery) {
  const where: Prisma.NotificationWhereInput = { userId: user.id, ...(query.unread && { readAt: null }) };
  const [total, unread, items] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
  ]);
  return { items, unread, pagination: pagination(query, total) };
}

export async function unreadCount(user: AuthUser) {
  return { unread: await prisma.notification.count({ where: { userId: user.id, readAt: null } }) };
}

export async function markRead(user: AuthUser, id: string) {
  const row = await prisma.notification.findUnique({ where: { id }, select: { userId: true, readAt: true } });
  if (!row || row.userId !== user.id) throw ApiError.notFound('Notification not found');
  if (row.readAt) return { changed: false };
  await prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return { changed: true };
}

export async function markAllRead(user: AuthUser) {
  const { count } = await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return { updated: count };
}
