
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';

export async function createQuote(
  userId: string,
  invitationId: string,
  input: {
    totalPrice: number;
    estimatedDays: number;
    notes?: string;
    validUntil?: Date;
  },
) {
  const workshop = await prisma.workshop.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!workshop) throw ApiError.notFound('Workshop profile not found');

  const invitation = await prisma.jobInvitation.findUnique({
    where: { id: invitationId },
    include: {
      job: { select: { id: true, status: true } },
    },
  });

  if (!invitation) throw ApiError.notFound('Invitation not found');

  if (invitation.workshopId !== workshop.id) {
    throw ApiError.forbidden();
  }

  if (!['INVITED', 'ACCEPTED'].includes(invitation.status)) {
    throw ApiError.badRequest('Only invited or accepted workshops may submit quotes');
  }

  if (!['OPEN', 'MATCHED'].includes(invitation.job.status)) {
    throw ApiError.badRequest('This job is no longer accepting quotes');
  }

  const existing = await prisma.quote.findUnique({
    where: { invitationId },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict('A quote already exists for this invitation. Update it instead.');
  }

  return prisma.quote.create({
    data: {
      invitationId,
      jobId: invitation.job.id,
      workshopId: workshop.id,
      totalPrice: input.totalPrice,
      estimatedDays: input.estimatedDays,
      notes: input.notes,
      validUntil: input.validUntil,
    },
  });
}

export async function updateQuote(
  userId: string,
  quoteId: string,
  input: {
    totalPrice?: number;
    estimatedDays?: number;
    notes?: string | null;
    validUntil?: Date | null;
  },
) {
  const workshop = await prisma.workshop.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!workshop) throw ApiError.notFound('Workshop profile not found');

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
  });

  if (!quote) throw ApiError.notFound('Quote not found');
  if (quote.workshopId !== workshop.id) throw ApiError.forbidden();

  if (quote.status !== 'SUBMITTED') {
    throw ApiError.badRequest('Only submitted quotes can be updated');
  }

  return prisma.quote.update({
    where: { id: quoteId },
    data: { ...input, status: 'SUBMITTED' },
  });
}

export async function listQuotesForJob(userId: string, jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, buyerId: true },
  });

  if (!job) throw ApiError.notFound('Job not found');
  if (job.buyerId !== userId) throw ApiError.forbidden();

  return prisma.quote.findMany({
    where: { jobId },
    include: {
      workshop: {
        select: { id: true, businessName: true, rating: true, city: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listMyQuotes(userId: string) {
  const workshop = await prisma.workshop.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!workshop) throw ApiError.notFound('Workshop profile not found');

  return prisma.quote.findMany({
    where: { workshopId: workshop.id },
    include: {
      job: { select: { id: true, title: true, status: true, deadline: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
