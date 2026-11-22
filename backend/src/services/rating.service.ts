/**
 * Ratings (I5).
 *
 * - The order's buyer rates a COMPLETED order exactly once (score 1-5, optional review).
 * - Concurrency: job FOR SHARE -> order FOR UPDATE serialises submissions for one
 *   order, so a duplicate sees the first rating and gets 409 (the unique orderId
 *   is the last guard). The workshop aggregate is updated last with ONE atomic
 *   UPDATE that reads the current row values, so concurrent ratings of the same
 *   workshop (different orders) are all counted:
 *     rating      = (rating * ratingCount + score) / (ratingCount + 1)
 *     ratingCount = ratingCount + 1
 *   It is raw SQL so Workshop.updatedAt (the profile version used by profile
 *   edits and invites) does not change - the same rule as totalCompletedJobs.
 *   The update is incremental because seeded workshops carry aggregates without
 *   individual Rating rows; recomputing from rows would discard them.
 */
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { findParticipantOrder, isUniqueViolation, lockOrder } from './orderAccess';
import type { SubmitRatingInput } from '../validators/rating.validator';

const alreadyRated = () => ApiError.conflict('This order has already been rated');

export async function submitRating(user: AuthUser, orderId: string, input: SubmitRatingInput) {
  if (user.role !== 'BUYER') throw ApiError.forbidden();
  const ref = await findParticipantOrder(user, orderId);

  try {
    return await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, ref);
      if (order.status !== 'COMPLETED') {
        throw ApiError.conflict(`Only COMPLETED orders can be rated (this order is ${order.status})`);
      }
      if (await tx.rating.findUnique({ where: { orderId: ref.id }, select: { id: true } })) throw alreadyRated();

      const rating = await tx.rating.create({
        data: { orderId: ref.id, workshopId: ref.workshopId, buyerId: user.id, score: input.score, review: input.review },
      });
      const updated = await tx.$executeRaw`
        UPDATE "Workshop"
        SET "rating" = ("rating" * "ratingCount" + ${input.score}) / ("ratingCount" + 1),
            "ratingCount" = "ratingCount" + 1
        WHERE "id" = ${ref.workshopId}`;
      if (updated !== 1) throw ApiError.conflict('Workshop not found for this order');

      const workshop = await tx.workshop.findUniqueOrThrow({
        where: { id: ref.workshopId },
        select: { id: true, rating: true, ratingCount: true },
      });
      return { rating, workshop };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw alreadyRated();
    throw err;
  }
}

/** Public (any authenticated user) rating history of a workshop, newest first. */
export async function getWorkshopRatings(workshopId: string) {
  const workshop = await prisma.workshop.findUnique({
    where: { id: workshopId },
    select: { id: true, businessName: true, rating: true, ratingCount: true },
  });
  if (!workshop) throw ApiError.notFound('Workshop not found');

  const ratings = await prisma.rating.findMany({
    where: { workshopId },
    select: {
      id: true,
      orderId: true,
      score: true,
      review: true,
      createdAt: true,
      buyer: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return { workshop, ratings };
}
