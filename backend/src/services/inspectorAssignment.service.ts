/**
 * Inspector assignment (B1).
 *
 * - ADMIN assigns one INSPECTOR to a CONFIRMED or IN_PROGRESS order.
 * - At most ONE active assignment per order (InspectorAssignment.active = true;
 *   unique (orderId, active) in the database, and every change runs under the
 *   order lock, so parallel assignments are serialised).
 * - Reassignment ends the current row (active = NULL, endedAt, endedById) and
 *   creates a new one in the same transaction; rows are never deleted, so the
 *   full history (who assigned whom, when, and who ended it) is kept.
 * - Only the CURRENT inspector can record or read the order's inspections
 *   (see inspection.service). Past inspections keep their inspectorId.
 * - Assigning the inspector who is already assigned is a no-op (200, changed:false).
 * - Assignments stay as historical records when the order completes or is
 *   cancelled; they can no longer be changed then.
 *
 * Lock order: job FOR SHARE -> order FOR UPDATE -> assignment rows (same as all
 * other order sub-resources), so assignment changes and inspections on one order
 * never interleave.
 */
import type { OrderStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { findOrderRef, isUniqueViolation, lockOrder, orderNotFound, type Tx } from './orderAccess';
import { recordEvent } from './events';
import type { AssignedOrdersQuery } from '../validators/inspection.validator';

const ASSIGNABLE: OrderStatus[] = ['CONFIRMED', 'IN_PROGRESS'];

export const assignmentInclude = {
  inspector: { select: { id: true, name: true, email: true } },
  assignedBy: { select: { id: true, name: true } },
  endedBy: { select: { id: true, name: true } },
} satisfies Prisma.InspectorAssignmentInclude;

/** The inspector currently assigned to an order, or null. Pass `tx` inside a locked transaction. */
export async function currentInspectorId(orderId: string, db: Tx | typeof prisma = prisma) {
  const row = await db.inspectorAssignment.findFirst({ where: { orderId, active: true }, select: { inspectorId: true } });
  return row?.inspectorId ?? null;
}

function assertAdmin(user: AuthUser) {
  if (user.role !== 'ADMIN') throw ApiError.forbidden();
}

async function lockAssignableOrder(tx: Tx, orderId: string) {
  const ref = await findOrderRef(orderId);
  if (!ref) throw orderNotFound();
  const order = await lockOrder(tx, ref);
  if (!ASSIGNABLE.includes(order.status)) {
    throw ApiError.conflict(`Inspectors can only be assigned to CONFIRMED or IN_PROGRESS orders (this order is ${order.status})`);
  }
  return ref;
}

async function endActive(tx: Tx, orderId: string, admin: AuthUser) {
  const now = new Date();
  return tx.inspectorAssignment.updateMany({
    where: { orderId, active: true },
    data: { active: null, endedAt: now, endedById: admin.id },
  });
}

export async function assignInspector(admin: AuthUser, orderId: string, inspectorId: string) {
  assertAdmin(admin);
  const inspector = await prisma.user.findUnique({ where: { id: inspectorId }, select: { role: true } });
  if (!inspector) throw ApiError.notFound('Inspector not found');
  if (inspector.role !== 'INSPECTOR') throw ApiError.conflict('Only users with the INSPECTOR role can be assigned');

  try {
    return await prisma.$transaction(async (tx) => {
      const ref = await lockAssignableOrder(tx, orderId);
      const active = await tx.inspectorAssignment.findFirst({ where: { orderId: ref.id, active: true } });

      if (active?.inspectorId === inspectorId) {
        const assignment = await tx.inspectorAssignment.findUniqueOrThrow({ where: { id: active.id }, include: assignmentInclude });
        return { changed: false, assignment, previous: null };
      }

      let previous = null;
      if (active) {
        await endActive(tx, ref.id, admin);
        previous = await tx.inspectorAssignment.findUniqueOrThrow({ where: { id: active.id }, include: assignmentInclude });
      }
      const assignment = await tx.inspectorAssignment.create({
        // Set here, under the order lock (not the DB default = transaction start), so it is
        // later than any inspection that committed before this reassignment.
        data: { orderId: ref.id, inspectorId, assignedById: admin.id, assignedAt: new Date() },
        include: assignmentInclude,
      });
      const full = await tx.order.findUniqueOrThrow({ where: { id: ref.id }, select: { id: true, jobId: true, buyerId: true, workshopId: true } });
      await recordEvent(tx, {
        actor: admin, action: previous ? 'INSPECTOR_REASSIGNED' : 'INSPECTOR_ASSIGNED', entityType: 'InspectorAssignment', entityId: assignment.id,
        orderId: full.id, jobId: full.jobId, metadata: { inspectorId, ...(previous && { previousInspectorId: previous.inspectorId }) },
        notify: [
          { userId: inspectorId, title: 'New inspection assignment', body: 'You have been assigned to inspect an order.', link: '/inspector/inspections' },
          // M13: the replaced inspector loses access exactly as on unassign, so tell them too.
          ...(previous ? [{ userId: previous.inspectorId, title: 'Inspection assignment ended', body: 'You are no longer assigned to inspect an order.' }] : []),
        ],
      });
      return { changed: true, assignment, previous };
    });
  } catch (err) {
    // Last guard behind the order lock: the one-active-per-order unique.
    if (isUniqueViolation(err)) throw ApiError.conflict('This order was assigned concurrently, please retry');
    throw err;
  }
}

export async function unassignInspector(admin: AuthUser, orderId: string) {
  assertAdmin(admin);
  return prisma.$transaction(async (tx) => {
    const ref = await lockAssignableOrder(tx, orderId);
    const active = await tx.inspectorAssignment.findFirst({ where: { orderId: ref.id, active: true }, select: { id: true } });
    if (!active) return { changed: false, assignment: null };
    await endActive(tx, ref.id, admin);
    const assignment = await tx.inspectorAssignment.findUniqueOrThrow({ where: { id: active.id }, include: assignmentInclude });
    await recordEvent(tx, {
      actor: admin, action: 'INSPECTOR_UNASSIGNED', entityType: 'InspectorAssignment', entityId: assignment.id, orderId: ref.id, jobId: ref.jobId,
      metadata: { inspectorId: assignment.inspectorId },
      notify: [{ userId: assignment.inspectorId, title: 'Inspection assignment ended', body: 'You are no longer assigned to inspect an order.' }],
    });
    return { changed: true, assignment };
  });
}

/** ADMIN: full assignment history of one order, newest first. */
export async function listOrderAssignments(admin: AuthUser, orderId: string) {
  assertAdmin(admin);
  if (!(await findOrderRef(orderId))) throw orderNotFound();
  return prisma.inspectorAssignment.findMany({
    where: { orderId },
    include: assignmentInclude,
    orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
  });
}

/** INSPECTOR: orders currently assigned to me, newest assignment first (paginated). */
export async function listMyAssignedOrders(user: AuthUser, query: AssignedOrdersQuery) {
  if (user.role !== 'INSPECTOR') throw ApiError.forbidden();
  const where = { inspectorId: user.id, active: true } as const;
  const [total, rows] = await prisma.$transaction([
    prisma.inspectorAssignment.count({ where }),
    prisma.inspectorAssignment.findMany({
      where,
      orderBy: [{ assignedAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        order: {
          select: {
            id: true,
            status: true,
            expectedCompletionDate: true,
            createdAt: true,
            job: { select: { id: true, title: true, description: true, manufacturingProcess: true, material: true, quantity: true, quantityUnit: true, deadline: true, technicalSpecifications: true } },
            workshop: { select: { id: true, businessName: true, city: true } },
          },
        },
      },
    }),
  ]);
  return {
    items: rows.map(({ order, assignedAt, id }) => ({ assignmentId: id, assignedAt, order })),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}

/** ADMIN: inspector users with their number of active assignments (to choose whom to assign). */
export async function listInspectors(admin: AuthUser) {
  assertAdmin(admin);
  const inspectors = await prisma.user.findMany({
    where: { role: 'INSPECTOR' },
    select: { id: true, name: true, email: true, _count: { select: { inspectorAssignments: { where: { active: true } } } } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return inspectors.map(({ _count, ...u }) => ({ ...u, activeAssignments: _count.inspectorAssignments }));
}
