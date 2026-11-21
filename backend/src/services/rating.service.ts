import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';

export async function submitRating(
  userId: string,
  orderId: string,
  input: {
    score: number;
    review?: string;
  },
) {
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
    throw ApiError.badRequest('Rating must be between 1 and 5');
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      workshopId: true,
      status: true,
    },
  });

  if (!order) throw ApiError.notFound('Order not found');

  if (order.buyerId !== userId) {
    throw ApiError.forbidden('Only the buyer can rate this order');
  }

  if (order.status !== 'COMPLETED') {
    throw ApiError.badRequest('Only completed orders can be rated');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.rating.findUnique({
      where: { orderId },
    });

    if (existing) {
      throw ApiError.conflict('This order has already been rated');
    }

    const rating = await tx.rating.create({
      data: {
        orderId,
        workshopId: order.workshopId,
        buyerId: userId,
        score: input.score,
        review: input.review,
      },
    });

    const aggregate = await tx.rating.aggregate({
      where: { workshopId: order.workshopId },
      _avg: { score: true },
      _count: { _all: true },
    });

    await tx.workshop.update({
      where: { id: order.workshopId },
      data: {
        rating: aggregate._avg.score ?? 0,
        ratingCount: aggregate._count._all,
      },
    });

    return rating;
  });
}

export async function getWorkshopRatings(workshopId: string) {
  const workshop = await prisma.workshop.findUnique({
    where: { id: workshopId },
    select: { id: true },
  });

  if (!workshop) throw ApiError.notFound('Workshop not found');

  return prisma.rating.findMany({
    where: { workshopId },
    include: {
      buyer: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}