/**
 * Inspections / QC (I5).
 *
 * - Only the INSPECTOR currently assigned to the order (B1, InspectorAssignment)
 *   records inspections, and only on IN_PROGRESS orders. The assignment is
 *   checked under the order lock, so a reassignment and an inspection never
 *   interleave. Any other inspector gets 404 (the order looks non-existent).
 * - Reading an order's inspection history: its buyer and awarded workshop; the
 *   currently assigned inspector; ADMIN for any order. Everyone else gets 404.
 *   A replaced inspector loses access; their inspections keep their inspectorId.
 * - ADMIN can list inspections platform-wide (paginated, filterable).
 * - REWORK_REQUIRED (B2) sends ONE milestone back to REWORK_REQUIRED and stores
 *   it on the inspection (milestoneId):
 *     - `milestoneId` given: that milestone (IN_PROGRESS, COMPLETED or APPROVED -
 *       so rework is possible after approval, even when all are approved);
 *     - omitted: the active milestone (IN_PROGRESS/COMPLETED, highest sequence);
 *       if there is none but the order has milestones -> 409 (choose one);
 *     - the order has no milestones: the inspection is just recorded.
 *   Later milestones are never changed. Any failure rolls the inspection back.
 * - FAILED changes no milestone; like REWORK_REQUIRED it blocks completion
 *   until a later PASSED inspection.
 * - Order completion requires the latest inspection to be PASSED (see
 *   assertQualityCleared, called by order completion under the order lock).
 *
 * Writes lock job FOR SHARE -> order FOR UPDATE -> milestone, the backend-wide order.
 */
import type { InspectionStatus, MilestoneStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { findOrderRef, lockOrder, orderNotFound, participantScope, type Tx } from './orderAccess';
import { currentInspectorId } from './inspectorAssignment.service';
import { orderEvent } from './events';
import { linkEvidence } from './document.service';
import type { CreateInspectionInput, ListInspectionsQuery, SaveDraftInput } from '../validators/inspection.validator';

const inspectionInclude = { inspector: { select: { id: true, name: true } } } as const;

/** Newest first. inspectedAt is assigned under the order lock, so it is strictly increasing per order. */
const latestFirst = [{ inspectedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] as const;

export async function createInspection(user: AuthUser, orderId: string, input: CreateInspectionInput) {
  if (user.role !== 'INSPECTOR') throw ApiError.forbidden();
  const ref = await findOrderRef(orderId);
  if (!ref) throw orderNotFound();

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, ref);
    if ((await currentInspectorId(ref.id, tx)) !== user.id) throw orderNotFound();
    if (order.status !== 'IN_PROGRESS') {
      throw ApiError.conflict(`Only IN_PROGRESS orders can be inspected (this order is ${order.status})`);
    }

    // Strictly after the previous inspection, so "latest" is never ambiguous even
    // when two inspections started at the same moment and waited on the lock.
    const previous = await tx.inspection.findFirst({ where: { orderId }, orderBy: [...latestFirst], select: { inspectedAt: true } });
    const inspectedAt = new Date(Math.max(Date.now(), (previous?.inspectedAt.getTime() ?? 0) + 1));

    const reworkMilestoneId = input.status === 'REWORK_REQUIRED' ? await sendBackForRework(tx, orderId, input) : null;

    const inspection = await tx.inspection.create({
      data: {
        orderId, inspectorId: user.id, status: input.status, findings: input.findings, inspectedAt, milestoneId: reworkMilestoneId,
        ...(input.checklist && { checklist: { version: 1, ...input.checklist } as Prisma.InputJsonObject }),
      },
      include: inspectionInclude,
    });
    // M11: the submitter's draft becomes this official record, atomically.
    await tx.inspectionDraft.deleteMany({ where: { orderId, inspectorId: user.id } });
    // M12: uploaded evidence referenced by the checklist becomes part of this inspection.
    const evidenceIds = (input.checklist?.items ?? []).flatMap((item) => item.evidence.flatMap((file) => (file.documentId ? [file.documentId] : [])));
    await linkEvidence(tx, orderId, user.id, inspection.id, evidenceIds);
    const label = input.status === 'PASSED' ? 'passed' : input.status === 'FAILED' ? 'failed' : 'requires rework';
    await orderEvent(tx, user, ref, 'INSPECTION_' + input.status, { title: 'Inspection ' + label, body: 'The latest quality inspection ' + label + '.' }, {
      entityType: 'Inspection', entityId: inspection.id, metadata: { status: input.status, ...(reworkMilestoneId && { milestoneId: reworkMilestoneId }) }, to: ['buyer', 'workshop'],
    });
    return { inspection, reworkMilestoneId };
  });
}

// ---------- M11: private inspection drafts ----------
//
// A draft belongs to one inspector and one order. Only the CURRENTLY assigned
// inspector can read or change their own draft; after a reassignment the old
// draft stays stored but is unreachable (no transfer to the new inspector).
// Drafts never change order, milestone or completion state, and never appear in
// inspection history or the QC gate.

const DRAFTABLE: string[] = ['CONFIRMED', 'IN_PROGRESS'];

async function assertAssignedInspector(user: AuthUser, orderId: string, tx: Tx | typeof prisma = prisma) {
  if (user.role !== 'INSPECTOR') throw ApiError.forbidden();
  if ((await currentInspectorId(orderId, tx)) !== user.id) throw orderNotFound();
}

export async function getDraft(user: AuthUser, orderId: string) {
  if (user.role !== 'INSPECTOR') throw ApiError.forbidden();
  const ref = await findOrderRef(orderId);
  if (!ref) throw orderNotFound();
  await assertAssignedInspector(user, ref.id);
  return prisma.inspectionDraft.findUnique({ where: { orderId_inspectorId: { orderId: ref.id, inspectorId: user.id } } });
}

export async function saveDraft(user: AuthUser, orderId: string, input: SaveDraftInput) {
  if (user.role !== 'INSPECTOR') throw ApiError.forbidden();
  const ref = await findOrderRef(orderId);
  if (!ref) throw orderNotFound();
  return prisma.$transaction(async (tx) => {
    // Same lock order as inspections (job -> order), so a draft write and a reassignment never interleave.
    const order = await lockOrder(tx, ref);
    await assertAssignedInspector(user, ref.id, tx);
    if (!DRAFTABLE.includes(order.status)) {
      throw ApiError.conflict(`Drafts can only be saved while the order is CONFIRMED or IN_PROGRESS (this order is ${order.status})`);
    }
    const checklist = { version: 1, ...input.checklist } as Prisma.InputJsonObject;
    const findings = input.findings ? input.findings : null;
    return tx.inspectionDraft.upsert({
      where: { orderId_inspectorId: { orderId: ref.id, inspectorId: user.id } },
      create: { orderId: ref.id, inspectorId: user.id, checklist, findings },
      update: { checklist, findings },
    });
  });
}

export async function deleteDraft(user: AuthUser, orderId: string) {
  if (user.role !== 'INSPECTOR') throw ApiError.forbidden();
  const ref = await findOrderRef(orderId);
  if (!ref) throw orderNotFound();
  await assertAssignedInspector(user, ref.id);
  const { count } = await prisma.inspectionDraft.deleteMany({ where: { orderId: ref.id, inspectorId: user.id } });
  return { deleted: count > 0 };
}

/** Milestones that have started and can be sent back (PENDING has nothing to rework). */
const REWORKABLE: MilestoneStatus[] = ['IN_PROGRESS', 'COMPLETED', 'APPROVED'];

/**
 * B2 rework target, under the order lock. Only the chosen milestone changes;
 * later milestones are left as they are. Returns its id, or null when the order
 * has no milestones at all (the inspection is then just recorded).
 */
async function sendBackForRework(tx: Tx, orderId: string, input: CreateInspectionInput): Promise<string | null> {
  let targetId: string;
  if (input.milestoneId) {
    const rows = await tx.$queryRaw<{ id: string; orderId: string; status: MilestoneStatus; sequence: number }[]>`
      SELECT "id", "orderId", "status", "sequence" FROM "Milestone" WHERE "id" = ${input.milestoneId} FOR UPDATE`;
    const target = rows[0];
    if (!target || target.orderId !== orderId) throw ApiError.notFound('Milestone not found');
    if (!REWORKABLE.includes(target.status)) {
      throw ApiError.conflict(
        target.status === 'REWORK_REQUIRED'
          ? `Milestone ${target.sequence} is already awaiting rework`
          : `Milestone ${target.sequence} has not started yet; only started milestones can be sent back for rework`,
      );
    }
    targetId = target.id;
  } else {
    const active = await tx.milestone.findFirst({
      where: { orderId, status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
      orderBy: { sequence: 'desc' },
      select: { id: true },
    });
    if (!active) {
      if ((await tx.milestone.count({ where: { orderId } })) === 0) return null;
      throw ApiError.conflict(
        'No IN_PROGRESS or COMPLETED milestone to send back; pass milestoneId to choose one (an APPROVED milestone can be reopened)',
      );
    }
    targetId = active.id;
  }

  await tx.milestone.update({
    where: { id: targetId },
    data: { status: 'REWORK_REQUIRED', completedAt: null, notes: input.findings ?? 'Rework requested after inspection' },
  });
  return targetId;
}

export async function listOrderInspections(user: AuthUser, orderId: string) {
  let visible: boolean;
  if (user.role === 'ADMIN') {
    visible = (await findOrderRef(orderId)) !== null;
  } else if (user.role === 'INSPECTOR') {
    visible = (await currentInspectorId(orderId)) === user.id;
  } else {
    const scope = await participantScope(user);
    visible = (await prisma.order.count({ where: { AND: [{ id: orderId }, scope] } })) > 0;
  }
  if (!visible) throw orderNotFound();

  return prisma.inspection.findMany({ where: { orderId }, include: inspectionInclude, orderBy: [...latestFirst] });
}

/** ADMIN: every inspection on the platform, newest first, paginated and filterable. */
export async function listAllInspections(user: AuthUser, query: ListInspectionsQuery) {
  if (user.role !== 'ADMIN') throw ApiError.forbidden();
  const where: Prisma.InspectionWhereInput = {
    ...(query.status && { status: query.status }),
    ...(query.inspectorId && { inspectorId: query.inspectorId }),
    ...(query.orderId && { orderId: query.orderId }),
  };
  const [total, items] = await prisma.$transaction([
    prisma.inspection.count({ where }),
    prisma.inspection.findMany({
      where,
      include: {
        ...inspectionInclude,
        order: { select: { id: true, status: true, buyerId: true, workshop: { select: { id: true, businessName: true } }, job: { select: { id: true, title: true } } } },
      },
      orderBy: [...latestFirst],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return { items, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
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
