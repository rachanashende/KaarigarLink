/**
 * M12: one call records an append-only audit event and the in-app notifications it
 * causes. Pass the business transaction (`db`) so a failed operation records nothing;
 * call it only on paths that actually changed state (never on `changed: false`
 * repeats), so events and notifications are not duplicated.
 *
 * Metadata must stay small and non-sensitive: statuses, amounts, ids. Never
 * passwords, tokens, emails or phone numbers.
 */
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export interface NotifyInput {
  userId: string;
  title: string;
  body: string;
  link?: string;
}
export interface EventInput {
  actor: Pick<AuthUser, 'id' | 'role'> | null;
  action: string;
  entityType: string;
  entityId: string;
  orderId?: string | null;
  jobId?: string | null;
  metadata?: Prisma.InputJsonObject;
  notify?: NotifyInput[];
}

export async function recordEvent(db: Db, input: EventInput) {
  const event = await db.auditEvent.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorRole: input.actor?.role ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      orderId: input.orderId ?? null,
      jobId: input.jobId ?? null,
      ...(input.metadata && { metadata: input.metadata }),
    },
  });
  // Never notify the actor about their own action; one notification per user per event.
  const recipients = new Map<string, NotifyInput>();
  for (const n of input.notify ?? []) if (n.userId !== input.actor?.id && !recipients.has(n.userId)) recipients.set(n.userId, n);
  if (recipients.size) {
    await db.notification.createMany({
      data: [...recipients.values()].map((n) => ({
        userId: n.userId, type: input.action, title: n.title, body: n.body,
        entityType: input.entityType, entityId: input.entityId, link: n.link ?? null,
        dedupeKey: event.id + ':' + n.userId,
      })),
      skipDuplicates: true,
    });
  }
  return event;
}

/** The owner user id of a workshop (for notifications). */
export async function workshopOwnerId(db: Db, workshopId: string): Promise<string | null> {
  const row = await db.workshop.findUnique({ where: { id: workshopId }, select: { userId: true } });
  return row?.userId ?? null;
}

/** The inspector currently assigned to an order, if any. */
export async function assignedInspectorId(db: Db, orderId: string): Promise<string | null> {
  const row = await db.inspectorAssignment.findFirst({ where: { orderId, active: true }, select: { inspectorId: true } });
  return row?.inspectorId ?? null;
}

/** Notification targets for an order event: buyer, workshop owner and current inspector. */
export async function orderParties(db: Db, order: { id: string; buyerId: string; workshopId: string }) {
  const [workshopUser, inspector] = await Promise.all([workshopOwnerId(db, order.workshopId), assignedInspectorId(db, order.id)]);
  return { buyerId: order.buyerId, workshopUserId: workshopUser, inspectorId: inspector };
}

export const links = {
  buyerOrder: (id: string) => '/buyer/orders/' + encodeURIComponent(id),
  workshopOrder: (id: string) => '/workshop/orders/' + encodeURIComponent(id),
  buyerJobQuotes: (id: string) => '/buyer/jobs/' + encodeURIComponent(id) + '/quotes',
  workshopInvitation: (id: string) => '/workshop/invitations/' + encodeURIComponent(id),
  inspector: () => '/inspector/inspections',
  workshopProfile: () => '/workshop/profile',
};

/**
 * An order-scoped event, notifying the order's buyer, workshop owner and current
 * inspector (except the actor). Use `to` to restrict who is notified.
 */
export async function orderEvent(
  db: Db,
  actor: Pick<AuthUser, 'id' | 'role'> | null,
  order: { id: string; jobId: string; buyerId: string; workshopId: string },
  action: string,
  message: { title: string; body: string },
  options: { entityType?: string; entityId?: string; metadata?: Prisma.InputJsonObject; to?: ('buyer' | 'workshop' | 'inspector')[] } = {},
) {
  const parties = await orderParties(db, order);
  const to = options.to ?? ['buyer', 'workshop', 'inspector'];
  const notify: NotifyInput[] = [];
  if (to.includes('buyer')) notify.push({ userId: parties.buyerId, ...message, link: links.buyerOrder(order.id) });
  if (to.includes('workshop') && parties.workshopUserId) notify.push({ userId: parties.workshopUserId, ...message, link: links.workshopOrder(order.id) });
  if (to.includes('inspector') && parties.inspectorId) notify.push({ userId: parties.inspectorId, ...message, link: links.inspector() });
  return recordEvent(db, {
    actor, action, entityType: options.entityType ?? 'Order', entityId: options.entityId ?? order.id,
    orderId: order.id, jobId: order.jobId, ...(options.metadata && { metadata: options.metadata }), notify,
  });
}
