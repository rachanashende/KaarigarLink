/**
 * Order milestones (I5).
 *
 * Lifecycle (MilestoneStatus):
 *   PENDING --start--> IN_PROGRESS --complete--> COMPLETED --approve--> APPROVED
 *   REWORK_REQUIRED (set by a REWORK_REQUIRED inspection) --start--> IN_PROGRESS
 *
 * - The awarded workshop creates, edits (PENDING only), starts and completes
 *   milestones; the order's buyer approves them. Both can list them.
 * - Create/edit: order CONFIRMED or IN_PROGRESS. Start/complete/approve: order IN_PROGRESS.
 * - Sequential: a milestone can only start once every lower-sequence milestone is
 *   APPROVED, so at most one milestone is active at a time. A new (or re-sequenced)
 *   milestone must come after every milestone that has already started.
 * - Sequence numbers are unique per order (409; the DB unique is the last guard).
 * - A repeated transition (already in the target status) returns 200 changed:false.
 *
 * Every write locks job FOR SHARE -> order FOR UPDATE first, so milestone writes,
 * inspections and order transitions on one order are serialised.
 */
import type { MilestoneStatus, OrderStatus } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { getMyWorkshopId } from './workshop.service';
import { findParticipantOrder, isUniqueViolation, lockOrder, type Tx } from './orderAccess';
import { orderEvent } from './events';
import type { CreateMilestoneInput, UpdateMilestoneInput } from '../validators/milestone.validator';

const milestoneNotFound = () => ApiError.notFound('Milestone not found');
const EDITABLE_ORDER: OrderStatus[] = ['CONFIRMED', 'IN_PROGRESS'];
const duplicateSequence = (sequence: number) =>
  ApiError.conflict(`A milestone with sequence ${sequence} already exists for this order`);

function assertOrderEditable(status: OrderStatus) {
  if (!EDITABLE_ORDER.includes(status)) {
    throw ApiError.conflict(`Milestones cannot be changed on an order that is ${status}`);
  }
}

/** Under the order lock: the sequence is free and comes after every started milestone. */
async function assertSequenceAllowed(tx: Tx, orderId: string, sequence: number, excludeId?: string) {
  const clash = await tx.milestone.findFirst({
    where: { orderId, sequence, ...(excludeId && { id: { not: excludeId } }) },
    select: { id: true },
  });
  if (clash) throw duplicateSequence(sequence);
  const lastStarted = await tx.milestone.findFirst({
    where: { orderId, status: { not: 'PENDING' } },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  if (lastStarted && sequence <= lastStarted.sequence) {
    throw ApiError.conflict(
      `sequence must be greater than ${lastStarted.sequence}, the last milestone that has already started`,
    );
  }
}

// ---------- Workshop: create / edit ----------

export async function createMilestone(user: AuthUser, orderId: string, input: CreateMilestoneInput) {
  if (user.role !== 'WORKSHOP') throw ApiError.forbidden();
  const ref = await findParticipantOrder(user, orderId);
  try {
    return await prisma.$transaction(async (tx) => {
      assertOrderEditable((await lockOrder(tx, ref)).status);
      await assertSequenceAllowed(tx, ref.id, input.sequence);
      const created = await tx.milestone.create({
        data: {
          orderId: ref.id,
          title: input.title,
          description: input.description,
          sequence: input.sequence,
          dueDate: input.dueDate,
        },
      });
      await orderEvent(tx, user, ref, 'MILESTONE_CREATED', { title: 'Milestone planned', body: 'New production milestone: ' + created.title }, {
        entityType: 'Milestone', entityId: created.id, metadata: { sequence: created.sequence }, to: ['buyer'],
      });
      return created;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateSequence(input.sequence);
    throw err;
  }
}

export async function listMilestones(user: AuthUser, orderId: string) {
  const ref = await findParticipantOrder(user, orderId);
  return prisma.milestone.findMany({ where: { orderId: ref.id }, orderBy: { sequence: 'asc' } });
}

/** The milestone and its order, if `user` is the awarded workshop (WORKSHOP) or the buyer (BUYER). */
async function findOwnMilestone(user: AuthUser, milestoneId: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: { id: true, order: { select: { id: true, jobId: true, buyerId: true, workshopId: true } } },
  });
  if (!milestone) throw milestoneNotFound();
  const allowed =
    user.role === 'BUYER'
      ? milestone.order.buyerId === user.id
      : user.role === 'WORKSHOP' && milestone.order.workshopId === (await getMyWorkshopId(user));
  if (!allowed) throw milestoneNotFound();
  return milestone;
}

async function lockMilestone(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ status: MilestoneStatus; sequence: number; startedAt: Date | null }[]>`
    SELECT "status", "sequence", "startedAt" FROM "Milestone" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows[0]) throw milestoneNotFound();
  return rows[0];
}

export async function updateMilestone(user: AuthUser, milestoneId: string, input: UpdateMilestoneInput) {
  if (user.role !== 'WORKSHOP') throw ApiError.forbidden();
  const { order } = await findOwnMilestone(user, milestoneId);
  try {
    return await prisma.$transaction(async (tx) => {
      assertOrderEditable((await lockOrder(tx, order)).status);
      const current = await lockMilestone(tx, milestoneId);
      if (current.status !== 'PENDING') {
        throw ApiError.conflict(`Only PENDING milestones can be edited (this milestone is ${current.status})`);
      }
      if (input.sequence !== undefined && input.sequence !== current.sequence) {
        await assertSequenceAllowed(tx, order.id, input.sequence, milestoneId);
      }
      return tx.milestone.update({ where: { id: milestoneId }, data: input });
    });
  } catch (err) {
    if (isUniqueViolation(err) && input.sequence !== undefined) throw duplicateSequence(input.sequence);
    throw err;
  }
}

// ---------- Transitions ----------

type MilestoneAction = 'start' | 'complete' | 'approve';

const RULES: Record<MilestoneAction, { role: 'WORKSHOP' | 'BUYER'; from: MilestoneStatus[]; to: MilestoneStatus; verb: string }> = {
  start: { role: 'WORKSHOP', from: ['PENDING', 'REWORK_REQUIRED'], to: 'IN_PROGRESS', verb: 'started' },
  complete: { role: 'WORKSHOP', from: ['IN_PROGRESS'], to: 'COMPLETED', verb: 'completed' },
  approve: { role: 'BUYER', from: ['COMPLETED'], to: 'APPROVED', verb: 'approved' },
};

async function transitionMilestone(user: AuthUser, milestoneId: string, action: MilestoneAction) {
  const rule = RULES[action];
  if (user.role !== rule.role) throw ApiError.forbidden();
  const { order } = await findOwnMilestone(user, milestoneId);

  return prisma.$transaction(async (tx) => {
    const orderState = await lockOrder(tx, order);
    const current = await lockMilestone(tx, milestoneId);

    if (current.status === rule.to) {
      return { changed: false, milestone: await tx.milestone.findUniqueOrThrow({ where: { id: milestoneId } }) };
    }
    if (orderState.status !== 'IN_PROGRESS') {
      throw ApiError.conflict(`Milestones can only be ${rule.verb} while the order is IN_PROGRESS (it is ${orderState.status})`);
    }
    if (!rule.from.includes(current.status)) {
      throw ApiError.conflict(`A ${current.status} milestone cannot be ${rule.verb}`);
    }
    if (action === 'start') {
      const blocking = await tx.milestone.findFirst({
        where: { orderId: order.id, sequence: { lt: current.sequence }, status: { not: 'APPROVED' } },
        orderBy: { sequence: 'asc' },
        select: { sequence: true, status: true },
      });
      if (blocking) {
        throw ApiError.conflict(
          `Milestone ${blocking.sequence} is ${blocking.status}; earlier milestones must be APPROVED before this one can start`,
        );
      }
    }

    const now = new Date();
    const { count } = await tx.milestone.updateMany({
      where: { id: milestoneId, status: current.status },
      data: {
        status: rule.to,
        ...(action === 'start' && { startedAt: current.startedAt ?? now, completedAt: null }),
        ...(action === 'complete' && { completedAt: now }),
      },
    });
    if (count !== 1) throw ApiError.conflict('Milestone was modified, please retry');
    const milestone = await tx.milestone.findUniqueOrThrow({ where: { id: milestoneId } });
    await orderEvent(tx, user, order, 'MILESTONE_' + (action === 'start' ? 'STARTED' : action === 'complete' ? 'COMPLETED' : 'APPROVED'), {
      title: 'Milestone ' + rule.verb, body: milestone.sequence + '. ' + milestone.title + ' was ' + rule.verb + '.',
    }, { entityType: 'Milestone', entityId: milestoneId, metadata: { from: current.status, to: rule.to }, to: action === 'approve' ? ['workshop', 'inspector'] : ['buyer', 'inspector'] });
    return { changed: true, milestone };
  });
}

export const startMilestone = (user: AuthUser, id: string) => transitionMilestone(user, id, 'start');
export const completeMilestone = (user: AuthUser, id: string) => transitionMilestone(user, id, 'complete');
export const approveMilestone = (user: AuthUser, id: string) => transitionMilestone(user, id, 'approve');
