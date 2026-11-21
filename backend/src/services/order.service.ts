import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';

export async function awardQuote(userId: string, quoteId: string) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: {
        job: true,
        invitation: true,
      },
    });

    if (!quote) {
      throw ApiError.notFound('Quote not found');
    }

    if (quote.job.buyerId !== userId) {
      throw ApiError.forbidden();
    }

    if (quote.status !== 'SUBMITTED') {
      throw ApiError.badRequest('Only submitted quotes can be awarded');
    }

    if (!['INVITED', 'ACCEPTED'].includes(quote.invitation.status)) {
      throw ApiError.badRequest('The workshop invitation is no longer eligible');
    }

    if (!['OPEN', 'MATCHED'].includes(quote.job.status)) {
      throw ApiError.conflict('This job cannot be awarded in its current state');
    }

    // Claim the job atomically. Only one request can successfully claim it.
    const jobUpdate = await tx.job.updateMany({
      where: {
        id: quote.jobId,
        buyerId: userId,
        status: { in: ['OPEN', 'MATCHED'] },
      },
      data: { status: 'AWARDED' },
    });

    if (jobUpdate.count !== 1) {
      throw ApiError.conflict('This job has already been awarded or is unavailable');
    }

    const order = await tx.order.create({
      data: {
        jobId: quote.jobId,
        quoteId: quote.id,
        buyerId: userId,
        workshopId: quote.workshopId,
        agreedPrice: quote.totalPrice,
        currency: quote.currency,
        status: 'CONFIRMED',
        expectedCompletionDate: new Date(
          Date.now() + quote.estimatedDays * 24 * 60 * 60 * 1000,
        ),
      },
      include: {
        quote: true,
        job: true,
        workshop: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
    });

    await tx.quote.update({
      where: { id: quote.id },
      data: { status: 'ACCEPTED' },
    });

    // Other submitted quotes for this job are no longer eligible.
    await tx.quote.updateMany({
      where: {
        jobId: quote.jobId,
        id: { not: quote.id },
        status: 'SUBMITTED',
      },
      data: { status: 'REJECTED' },
    });

    // Close the remaining invitations for this job.
    await tx.jobInvitation.updateMany({
      where: {
        jobId: quote.jobId,
        id: { not: quote.invitationId },
        status: { in: ['INVITED', 'ACCEPTED'] },
      },
      data: { status: 'DECLINED' },
    });

    return order;
  });
}

export async function getOrderById(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      job: true,
      quote: true,
      workshop: {
        select: {
          id: true,
          businessName: true,
          city: true,
        },
      },
      milestones: {
        orderBy: { sequence: 'asc' },
      },
      inspections: {
        orderBy: { inspectedAt: 'desc' },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) {
    throw ApiError.notFound('Order not found');
  }

  if (order.buyerId !== userId) {
    const workshop = await prisma.workshop.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!workshop || workshop.id !== order.workshopId) {
      throw ApiError.forbidden();
    }
  }

  return order;
}