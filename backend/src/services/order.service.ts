/**
 * Orders (Member 2's workflow, I4 integration): awarding a quote creates the
 * job's single order; buyers and the awarded workshop can read it.
 *
 * Award runs in ONE transaction that takes locks in the backend-wide order
 * job -> invitations -> quotes -> order:
 *   1. Job FOR UPDATE. Every quote write (I2) and cancellation (I3) takes the
 *      job lock first, so while award holds it no quote can be edited,
 *      submitted or cancelled for this job. Anything already in flight finishes
 *      first, and the reads below then see its committed result.
 *   2. Selected invitation FOR SHARE: must be ACCEPTED.
 *   3. Job -> AWARDED, then M8's expireOverdueInvitations (INVITED -> EXPIRED;
 *      ACCEPTED invitations of other workshops are kept, never DECLINED).
 *   4. Selected quote FOR UPDATE: must be SUBMITTED and still valid. The agreed
 *      price is read here, after every lock, so it is the latest committed price.
 *   5. Workshop verification: plain read (no workshop lock, so there is no
 *      cycle with inviteWorkshop, which locks workshop -> job).
 *   6. Other SUBMITTED quotes -> REJECTED, selected quote -> ACCEPTED, order created.
 * Any failure rolls the whole award back.
 */
import { Prisma, type InvitationStatus, type JobStatus, type QuoteStatus } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { getMyWorkshopId } from './workshop.service';
import { effectiveInvitationStatus, expireOverdueInvitations } from './invitationExpiry';
import { QUOTABLE_JOB_STATUSES } from './quote.service';

type Tx = Prisma.TransactionClient;

// ---------- Serialisers: money always leaves the API as a 2-decimal string ----------

const money = (d: Prisma.Decimal) => d.toFixed(2);

interface WithMoney {
  agreedPrice: Prisma.Decimal;
  quote?: { totalPrice: Prisma.Decimal } | null;
  payments?: { amount: Prisma.Decimal }[];
}

function orderView<T extends WithMoney>(order: T) {
  const { agreedPrice, quote, payments, ...rest } = order;
  return {
    ...rest,
    agreedPrice: money(agreedPrice),
    ...(quote !== undefined && { quote: quote && { ...quote, totalPrice: money(quote.totalPrice) } }),
    ...(payments !== undefined && { payments: payments.map((p) => ({ ...p, amount: money(p.amount) })) }),
  };
}

const awardInclude = {
  quote: true,
  job: true,
  workshop: { select: { id: true, businessName: true } },
} satisfies Prisma.OrderInclude;

// ---------- Errors ----------

const quoteNotFound = () => ApiError.notFound('Quote not found');
const orderNotFound = () => ApiError.notFound('Order not found');

const INVITATION_NOT_ACCEPTED: Record<Exclude<InvitationStatus, 'ACCEPTED'>, string> = {
  INVITED: "The workshop has not accepted this job's invitation",
  DECLINED: "The workshop declined this job's invitation",
  EXPIRED: "The workshop's invitation for this job has expired",
};

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

// ---------- Buyer: award a quote ----------

export async function awardQuote(user: AuthUser, quoteId: string) {
  // Pre-read only to find the job and check ownership; nothing below trusts it for state.
  const found = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, jobId: true, invitationId: true, workshopId: true, job: { select: { buyerId: true } } },
  });
  // Another buyer's quote looks non-existent (same convention as jobs/quotes).
  if (!found || found.job.buyerId !== user.id) throw quoteNotFound();

  try {
    return await prisma.$transaction((tx) => awardInTransaction(tx, user, found));
  } catch (err) {
    // Both order uniques (jobId, quoteId) are a last guard; the job lock serialises awards first.
    if (isUniqueViolation(err)) throw ApiError.conflict('This job has already been awarded');
    throw err;
  }
}

async function awardInTransaction(
  tx: Tx,
  user: AuthUser,
  found: { id: string; jobId: string; invitationId: string; workshopId: string },
) {
  const now = new Date();

  // 1. Job lock (first lock, as everywhere else).
  const jobs = await tx.$queryRaw<{ status: JobStatus; deadline: Date; buyerId: string; updatedAt: Date }[]>`
    SELECT "status", "deadline", "buyerId", "updatedAt" FROM "Job" WHERE "id" = ${found.jobId} FOR UPDATE`;
  const job = jobs[0];
  if (!job || job.buyerId !== user.id) throw quoteNotFound();

  // Repeat request: an order already exists for this job.
  const existing = await tx.order.findUnique({ where: { jobId: found.jobId }, include: awardInclude });
  if (existing) {
    if (existing.quoteId === found.id && existing.buyerId === user.id) {
      return { created: false, order: orderView(existing) };
    }
    throw ApiError.conflict('This job has already been awarded to another quote');
  }

  if (!QUOTABLE_JOB_STATUSES.includes(job.status)) {
    throw ApiError.conflict(`This job cannot be awarded (status ${job.status})`);
  }
  if (job.deadline.getTime() <= now.getTime()) {
    throw ApiError.conflict('The job deadline has passed; it can no longer be awarded');
  }

  // 2. Selected invitation (judged with the M8 rule against the pre-award job state).
  const invitations = await tx.$queryRaw<{ status: InvitationStatus; createdAt: Date }[]>`
    SELECT "status", "createdAt" FROM "JobInvitation" WHERE "id" = ${found.invitationId} FOR SHARE`;
  const invitation = invitations[0];
  if (!invitation) throw quoteNotFound();
  const invitationStatus = effectiveInvitationStatus(invitation.status, invitation.createdAt, job, now);
  if (invitationStatus !== 'ACCEPTED') throw ApiError.conflict(INVITATION_NOT_ACCEPTED[invitationStatus]);

  // 3. Job -> AWARDED (version strictly later), then persist M8 expiry for the job:
  //    outstanding INVITED invitations become EXPIRED; ACCEPTED/DECLINED/EXPIRED are untouched.
  await tx.job.update({
    where: { id: found.jobId },
    data: { status: 'AWARDED', updatedAt: new Date(Math.max(Date.now(), job.updatedAt.getTime() + 1)) },
  });
  await expireOverdueInvitations({ jobId: found.jobId }, now, tx);

  // 4. Selected quote, locked; the price used for the order is read after this lock.
  const locked = await tx.$queryRaw<{ status: QuoteStatus; validUntil: Date | null; updatedAt: Date }[]>`
    SELECT "status", "validUntil", "updatedAt" FROM "Quote" WHERE "id" = ${found.id} FOR UPDATE`;
  const lockedQuote = locked[0];
  if (!lockedQuote) throw quoteNotFound();
  if (lockedQuote.status !== 'SUBMITTED') {
    throw ApiError.conflict(`Only SUBMITTED quotes can be awarded (this quote is ${lockedQuote.status})`);
  }
  if (lockedQuote.validUntil && lockedQuote.validUntil.getTime() <= now.getTime()) {
    throw ApiError.conflict('This quote is no longer valid (validUntil has passed)');
  }
  const quote = await tx.quote.findUniqueOrThrow({ where: { id: found.id } });

  // 5. Workshop must still be verified (plain read; no workshop lock).
  const workshop = await tx.workshop.findUnique({ where: { id: quote.workshopId }, select: { verificationStatus: true } });
  if (workshop?.verificationStatus !== 'VERIFIED') {
    throw ApiError.conflict('The workshop is no longer verified; this quote cannot be awarded');
  }

  // 6. Quotes, then the order.
  await tx.quote.updateMany({
    where: { jobId: found.jobId, id: { not: found.id }, status: 'SUBMITTED' },
    data: { status: 'REJECTED' },
  });
  await tx.quote.update({
    where: { id: found.id },
    data: { status: 'ACCEPTED', updatedAt: new Date(Math.max(Date.now(), lockedQuote.updatedAt.getTime() + 1)) },
  });
  const order = await tx.order.create({
    data: {
      jobId: found.jobId,
      quoteId: found.id,
      buyerId: user.id,
      workshopId: quote.workshopId,
      agreedPrice: quote.totalPrice,
      currency: quote.currency,
      status: 'CONFIRMED',
      expectedCompletionDate: new Date(now.getTime() + quote.estimatedDays * 24 * 60 * 60 * 1000),
    },
    include: awardInclude,
  });
  return { created: true, order: orderView(order) };
}

// ---------- Buyer / workshop: read ----------

/** Who may see an order: its buyer, or the awarded workshop's owner. Everyone else gets 404. */
async function participantScope(user: AuthUser): Promise<Prisma.OrderWhereInput> {
  if (user.role === 'BUYER') return { buyerId: user.id };
  if (user.role === 'WORKSHOP') return { workshopId: await getMyWorkshopId(user) };
  throw ApiError.forbidden();
}

export async function getOrderById(user: AuthUser, orderId: string) {
  const scope = await participantScope(user);
  const order = await prisma.order.findFirst({
    where: { AND: [{ id: orderId }, scope] },
    include: {
      job: true,
      quote: true,
      workshop: { select: { id: true, businessName: true, city: true } },
      milestones: { orderBy: { sequence: 'asc' } },
      inspections: { orderBy: { inspectedAt: 'desc' } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) throw orderNotFound();
  return orderView(order);
}

export async function listMyOrders(user: AuthUser) {
  const scope = await participantScope(user);
  const orders = await prisma.order.findMany({
    where: scope,
    include: {
      job: { select: { id: true, title: true, status: true, deadline: true } },
      workshop: { select: { id: true, businessName: true, city: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return orders.map(orderView);
}
