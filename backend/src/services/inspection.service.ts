/**
 * Inspections / QC (I5).
 *
 * - Only INSPECTOR users record inspections, and only on IN_PROGRESS orders.
 *   The schema has no inspector-assignment model, so any inspector may inspect
 *   any in-progress order whose id they are given; there is no endpoint that
 *   lists orders to inspectors.
 * - Reading an order's inspection history: its buyer and awarded workshop; an
 *   inspector only for orders they have inspected themselves; ADMIN for any
 *   order (read-only oversight). Everyone else gets 404.
 * - REWORK_REQUIRED sends the order's active milestone (IN_PROGRESS or
 *   COMPLETED, highest sequence) back to REWORK_REQUIRED; without one the
 *   inspection is refused (409) and nothing is written.
 * - Order completion requires the latest inspection to be PASSED (see
 *   assertQualityCleared, called by order completion under the order lock).
 *
 * Writes lock job FOR SHARE -> order FOR UPDATE -> milestone, the backend-wide order.
 */
import type { InspectionStatus } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { findOrderRef, lockOrder, orderNotFound, participantScope, type Tx } from './orderAccess';
import type { CreateInspectionInput } from '../validators/inspection.validator';

const inspectionInclude = { inspector: { select: { id: true, name: true } } } as const;

/** Newest first. inspectedAt is assigned under the order lock, so it is strictly increasing per order. */
const latestFirst = [{ inspectedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] as const;

export async function createInspection(user: AuthUser, orderId: string, input: CreateInspectionInput) {
  if (user.role !== 'INSPECTOR') throw ApiError.forbidden();
  const ref = await findOrderRef(orderId);
  if (!ref) throw orderNotFound();

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, ref);
    if (order.status !== 'IN_PROGRESS') {
      throw ApiError.conflict(`Only IN_PROGRESS orders can be inspected (this order is ${order.status})`);
    }

    // Strictly after the previous inspection, so "latest" is never ambiguous even
    // when two inspections started at the same moment and waited on the lock.
    const previous = await tx.inspection.findFirst({ where: { orderId }, orderBy: [...latestFirst], select: { inspectedAt: true } });
    const inspectedAt = new Date(Math.max(Date.now(), (previous?.inspectedAt.getTime() ?? 0) + 1));

    let reworkMilestoneId: string | null = null;
    if (input.status === 'REWORK_REQUIRED') {
      const active = await tx.milestone.findFirst({
        where: { orderId, status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
        orderBy: { sequence: 'desc' },
        select: { id: true },
      });
      if (!active) {
        throw ApiError.conflict('REWORK_REQUIRED needs an IN_PROGRESS or COMPLETED milestone to send back for rework');
      }
      await tx.milestone.update({
        where: { id: active.id },
        data: {
          status: 'REWORK_REQUIRED',
          completedAt: null,
          notes: input.findings ?? 'Rework requested after inspection',
        },
      });
      reworkMilestoneId = active.id;
    }

    const inspection = await tx.inspection.create({
      data: { orderId, inspectorId: user.id, status: input.status, findings: input.findings, inspectedAt },
      include: inspectionInclude,
    });
    return { inspection, reworkMilestoneId };
  });
}

export async function listOrderInspections(user: AuthUser, orderId: string) {
  let visible: boolean;
  if (user.role === 'ADMIN') {
    visible = (await findOrderRef(orderId)) !== null;
  } else if (user.role === 'INSPECTOR') {
    visible = (await prisma.inspection.count({ where: { orderId, inspectorId: user.id } })) > 0;
  } else {
    const scope = await participantScope(user);
    visible = (await prisma.order.count({ where: { AND: [{ id: orderId }, scope] } })) > 0;
  }
  if (!visible) throw orderNotFound();

  return prisma.inspection.findMany({ where: { orderId }, include: inspectionInclude, orderBy: [...latestFirst] });
}

/**
 * Completion gate. Must be called inside a transaction that holds the order lock.
 * The latest inspection must be PASSED. Milestone statuses are not checked.
 */
export async function assertQualityCleared(tx: Tx, orderId: string) {
  const latest = await tx.inspection.findFirst({ where: { orderId }, orderBy: [...latestFirst], select: { status: true } });
  if (!latest) {
    throw ApiError.conflict('The order has not passed quality inspection yet; it cannot be completed');
  }
  if (latest.status !== 'PASSED') {
    throw ApiError.conflict(
      `The latest quality inspection is ${latest.status satisfies InspectionStatus}; a PASSED inspection is required to complete the order`,
    );
  }
}
