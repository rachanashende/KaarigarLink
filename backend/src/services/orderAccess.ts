/**
 * Shared order access and locking for the order sub-resources (I5: milestones,
 * inspections, payments, ratings).
 *
 * Lock order (backend-wide): job -> order -> (milestones / inspections /
 * payments / ratings) -> workshop. I5 writes take the job row FOR SHARE (like
 * quote writes) and then the order row FOR UPDATE, so:
 *   - every write on one order's sub-resources is serialised by the order lock;
 *   - order lifecycle transitions (job FOR UPDATE -> order FOR UPDATE) cannot
 *     interleave with them: whichever gets the job first runs to completion,
 *     and the other then sees its committed result.
 */
import { Prisma, type JobStatus, type OrderStatus } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { getMyWorkshopId } from './workshop.service';

export type Tx = Prisma.TransactionClient;

export const money = (d: Prisma.Decimal) => d.toFixed(2);

/** A timestamp strictly later than `previous` (versions never go backwards). */
export const later = (previous: Date) => new Date(Math.max(Date.now(), previous.getTime() + 1));

export const orderNotFound = () => ApiError.notFound('Order not found');

export const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Who may see an order: its buyer, or the awarded workshop's owner. Everyone else gets 404. */
export async function participantScope(user: AuthUser): Promise<Prisma.OrderWhereInput> {
  if (user.role === 'BUYER') return { buyerId: user.id };
  if (user.role === 'WORKSHOP') return { workshopId: await getMyWorkshopId(user) };
  throw ApiError.forbidden();
}

export interface OrderRef {
  id: string;
  jobId: string;
  buyerId: string;
  workshopId: string;
}

const orderRefSelect = { id: true, jobId: true, buyerId: true, workshopId: true } as const;

/** The order if `user` is its buyer or awarded workshop, else 404 (never reveals existence). */
export async function findParticipantOrder(user: AuthUser, orderId: string): Promise<OrderRef> {
  const scope = await participantScope(user);
  const order = await prisma.order.findFirst({ where: { AND: [{ id: orderId }, scope] }, select: orderRefSelect });
  if (!order) throw orderNotFound();
  return order;
}

export async function findOrderRef(orderId: string): Promise<OrderRef | null> {
  return prisma.order.findUnique({ where: { id: orderId }, select: orderRefSelect });
}

export interface LockedOrder {
  status: OrderStatus;
  agreedPrice: Prisma.Decimal;
  currency: string;
  jobStatus: JobStatus;
}

/** Job FOR SHARE, then order FOR UPDATE. Returns the order's state read under the lock. */
export async function lockOrder(tx: Tx, ref: Pick<OrderRef, 'id' | 'jobId'>): Promise<LockedOrder> {
  const jobs = await tx.$queryRaw<{ status: JobStatus }[]>`
    SELECT "status" FROM "Job" WHERE "id" = ${ref.jobId} FOR SHARE`;
  const orders = await tx.$queryRaw<{ status: OrderStatus; agreedPrice: Prisma.Decimal; currency: string }[]>`
    SELECT "status", "agreedPrice", "currency" FROM "Order" WHERE "id" = ${ref.id} FOR UPDATE`;
  if (!jobs[0] || !orders[0]) throw orderNotFound();
  return { ...orders[0], agreedPrice: new Prisma.Decimal(orders[0].agreedPrice), jobStatus: jobs[0].status };
}
