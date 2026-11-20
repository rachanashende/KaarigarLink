import type { JobStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import type { CreateJobInput, ListJobsQuery, UpdateJobInput } from '../validators/job.validator';

export const jobDetailInclude = {
  buyer: { select: { id: true, name: true } },
  requirements: { orderBy: [{ requirementType: 'asc' }, { requirementValue: 'asc' }] },
  _count: { select: { invitations: true } },
} satisfies Prisma.JobInclude;

/** Job details (title, specs, requirements...) can only change before matching. */
const EDITABLE_STATUSES: JobStatus[] = ['DRAFT', 'OPEN'];

/**
 * Buyer-driven status transitions. MATCHED is set by the matching engine;
 * AWARDED / IN_PROGRESS / COMPLETED belong to Member 2's order module.
 */
const BUYER_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['DRAFT', 'CANCELLED'],
  MATCHED: ['CANCELLED'],
  AWARDED: [],
  IN_PROGRESS: [],
  COMPLETED: [],
  CANCELLED: [],
};

// Generic "not found" for jobs the caller may not see, so private jobs of
// other buyers are indistinguishable from non-existent ones.
const jobNotFound = () => ApiError.notFound('Job not found');

export async function createJob(user: AuthUser, input: CreateJobInput) {
  const { requirements, technicalSpecifications, ...fields } = input;

  // Nested create = job and requirements are written atomically.
  return prisma.job.create({
    data: {
      ...fields,
      buyerId: user.id,
      technicalSpecifications: technicalSpecifications as Prisma.InputJsonValue | undefined,
      requirements: { create: requirements },
    },
    include: jobDetailInclude,
  });
}

export async function listJobs(user: AuthUser, query: ListJobsQuery) {
  const where: Prisma.JobWhereInput = {
    // Buyers only ever see their own jobs; admins see all.
    ...(user.role !== 'ADMIN' && { buyerId: user.id }),
    ...(query.status && { status: query.status }),
  };

  const [total, items] = await prisma.$transaction([
    prisma.job.count({ where }),
    prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: jobDetailInclude,
    }),
  ]);

  return {
    items,
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}

/**
 * Visible to: the owning buyer, any admin, and a workshop that has been
 * invited to this job. Everyone else gets 404.
 */
export async function getJobById(user: AuthUser, id: string) {
  const job = await prisma.job.findUnique({ where: { id }, include: jobDetailInclude });
  if (!job) throw jobNotFound();

  if (user.role === 'ADMIN') return job;
  if (user.role === 'BUYER' && job.buyerId === user.id) return job;
  if (user.role === 'WORKSHOP') {
    const invited = await prisma.jobInvitation.count({ where: { jobId: id, workshop: { userId: user.id } } });
    if (invited > 0) {
      // Workshops must not learn how many competitors were invited (no _count for them).
      const { _count: _hiddenFromWorkshops, ...workshopVisible } = job;
      return workshopVisible;
    }
  }
  throw jobNotFound();
}

export async function updateJob(user: AuthUser, id: string, input: UpdateJobInput) {
  const current = await prisma.job.findUnique({ where: { id } });
  if (!current || current.buyerId !== user.id) throw jobNotFound();

  const { requirements, technicalSpecifications, status, ...fields } = input;

  const changesDetails =
    Object.keys(fields).length > 0 || requirements !== undefined || technicalSpecifications !== undefined;
  if (changesDetails && !EDITABLE_STATUSES.includes(current.status)) {
    throw ApiError.conflict(`Job details cannot be edited while status is ${current.status}`);
  }

  const statusChanges = status !== undefined && status !== current.status;
  if (statusChanges && !BUYER_TRANSITIONS[current.status].includes(status)) {
    throw ApiError.conflict(`Cannot change job status from ${current.status} to ${status}`);
  }

  // Resulting coordinates must still be a valid pair (both set or both null).
  const nextLat = fields.latitude !== undefined ? fields.latitude : current.latitude;
  const nextLng = fields.longitude !== undefined ? fields.longitude : current.longitude;
  if ((nextLat === null) !== (nextLng === null)) {
    throw ApiError.badRequest('latitude and longitude must be provided together');
  }

  return prisma.$transaction(async (tx) => {
    // Optimistic concurrency (same pattern as workshops): only write if the job
    // is unchanged since we read it - e.g. matching has not just run on it.
    const { count } = await tx.job.updateMany({
      where: { id, updatedAt: current.updatedAt, status: current.status },
      data: {
        ...fields,
        ...(technicalSpecifications !== undefined && {
          technicalSpecifications: (technicalSpecifications ?? undefined) as Prisma.InputJsonValue | undefined,
        }),
        ...(statusChanges && { status }),
        // Explicit so requirement-only edits still advance the version. Always strictly
        // later than the version we read: the DB engine's clock (create) and Node's clock
        // (here) can differ by a few ms, and an equal value would weaken the 409 check.
        updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
      },
    });
    if (count === 0) throw ApiError.conflict('Job was modified, please retry');

    if (requirements !== undefined) {
      // Replace the whole set so the job and its requirements never disagree.
      await tx.jobRequirement.deleteMany({ where: { jobId: id } });
      if (requirements.length > 0) {
        await tx.jobRequirement.createMany({ data: requirements.map((r) => ({ ...r, jobId: id })) });
      }
    }

    if (statusChanges && status === 'CANCELLED') {
      // Outstanding invitations for a cancelled job are no longer actionable.
      await tx.jobInvitation.updateMany({
        where: { jobId: id, status: { in: ['INVITED', 'ACCEPTED'] } },
        data: { status: 'EXPIRED' },
      });
    }

    return tx.job.findUniqueOrThrow({ where: { id }, include: jobDetailInclude });
  });
}
