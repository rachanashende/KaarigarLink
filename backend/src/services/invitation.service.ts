/**
 * M8 Invitations. A manual buyer action, separate from (read-only) matching.
 *
 * Out of scope on purpose (Member 2): accepting or declining an invitation
 * never creates a quote or order and never changes the job status.
 */
import { Prisma, type InvitationStatus, type JobInvitation } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { computeMatchesWithCandidates, MATCHABLE_STATUSES } from './matching.service';
import { getMyWorkshopId } from './workshop.service';
import {
  effectiveInvitationStatus,
  expireOverdueInvitations,
  invitationExpiresAt,
  respondableInvitationWhere,
  type InvitationJobState,
} from './invitationExpiry';
import type {
  JobInvitationsQuery,
  RespondInvitationInput,
  WorkshopInvitationsQuery,
} from '../validators/invitation.validator';

// ---------- Serialisers ----------

/** Buyer/admin view: includes the matching snapshot taken when the invite was sent. */
function buyerView(inv: JobInvitation, job: InvitationJobState, now: Date) {
  return {
    id: inv.id,
    jobId: inv.jobId,
    workshopId: inv.workshopId,
    status: effectiveInvitationStatus(inv.status, inv.createdAt, job, now),
    matchScore: inv.matchScore,
    rank: inv.rank,
    distanceKm: inv.distanceKm,
    scoreBreakdown: inv.scoreBreakdown,
    matchReasons: inv.matchReasons,
    responseNote: inv.responseNote,
    respondedAt: inv.respondedAt,
    createdAt: inv.createdAt,
    expiresAt: invitationExpiresAt(inv.createdAt, job.deadline),
  };
}

/** Workshop view: never exposes score, rank, breakdown or any competitor comparison. */
function workshopView(inv: JobInvitation, job: InvitationJobState, now: Date) {
  return {
    id: inv.id,
    jobId: inv.jobId,
    workshopId: inv.workshopId,
    status: effectiveInvitationStatus(inv.status, inv.createdAt, job, now),
    responseNote: inv.responseNote,
    respondedAt: inv.respondedAt,
    createdAt: inv.createdAt,
    expiresAt: invitationExpiresAt(inv.createdAt, job.deadline),
  };
}

/** Job details a workshop needs to decide; buyer exposed as { id, name } only (no email). */
const workshopJobSelect = {
  id: true,
  title: true,
  description: true,
  material: true,
  manufacturingProcess: true,
  quantity: true,
  quantityUnit: true,
  deadline: true,
  address: true,
  technicalSpecifications: true,
  status: true,
  requirements: {
    select: { requirementType: true, requirementValue: true, isMandatory: true },
    orderBy: [{ requirementType: 'asc' }, { requirementValue: 'asc' }],
  },
  buyer: { select: { id: true, name: true } },
} satisfies Prisma.JobSelect;

const DUPLICATE_RULES: Record<InvitationStatus, 'return' | string> = {
  INVITED: 'return',
  ACCEPTED: 'return',
  DECLINED: 'This workshop declined the invitation; re-invitation is not allowed',
  EXPIRED: 'The invitation to this workshop expired; re-invitation is not allowed',
};

// ---------- Buyer: invite ----------

const workshopModified = () => ApiError.conflict('Workshop was modified, please retry');
const jobModified = () => ApiError.conflict('Job was modified, please retry');

export async function inviteWorkshop(user: AuthUser, jobId: string, workshopId: string) {
  const now = new Date();
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { requirements: true } });
  if (!job || job.buyerId !== user.id) throw ApiError.notFound('Job not found');

  // Duplicate handling first, using the up-to-date (lazily expired) status.
  const existing = await findExistingInvitation(jobId, workshopId, now);
  if (existing) return duplicateResult(existing, job, now);

  if (!MATCHABLE_STATUSES.includes(job.status)) {
    throw ApiError.conflict(`Invitations can only be sent for OPEN or MATCHED jobs (this job is ${job.status})`);
  }
  const workshopExists = await prisma.workshop.count({ where: { id: workshopId } });
  if (!workshopExists) throw ApiError.notFound('Workshop not found');

  // Never trust the client: re-run matching now and require the workshop to be eligible.
  const { results, workshops } = await computeMatchesWithCandidates(job, now);
  const match = results.find((r) => r.workshopId === workshopId);
  const evaluated = workshops.find((w) => w.id === workshopId);
  if (!match || !evaluated) throw workshopModified(); // deleted between the checks
  if (!match.eligibility.eligible || match.score === null || match.rank === null || !match.scoreBreakdown) {
    throw new ApiError(409, 'Workshop is not eligible for this job', match.eligibility.reasons);
  }

  try {
    const invitation = await prisma.$transaction(async (tx) => {
      // 1. Lock ONLY the target workshop row and re-check it against the row matching
      //    evaluated. A concurrent verification change (e.g. back to PENDING) either
      //    commits before this lock (-> 409 here) or waits until this invite commits.
      const locked = await tx.$queryRaw<{ verificationStatus: string; updatedAt: Date }[]>`
        SELECT "verificationStatus", "updatedAt" FROM "Workshop" WHERE "id" = ${workshopId} FOR UPDATE`;
      const current = locked[0];
      if (
        !current ||
        current.verificationStatus !== 'VERIFIED' ||
        current.updatedAt.getTime() !== evaluated.updatedAt.getTime()
      ) {
        throw workshopModified();
      }

      // 2. Job check.
      if (job.status === 'OPEN') {
        // First invitation: strict optimistic concurrency (details may still change while OPEN)
        // and OPEN -> MATCHED, which locks the job details.
        const { count } = await tx.job.updateMany({
          where: { id: jobId, status: 'OPEN', updatedAt: job.updatedAt },
          data: {
            status: 'MATCHED',
            matchedAt: job.matchedAt ?? now,
            updatedAt: new Date(Math.max(Date.now(), job.updatedAt.getTime() + 1)),
          },
        });
        if (count === 0) throw jobModified();
      } else {
        // Already MATCHED: details are locked, so only the status matters. A shared row
        // lock lets parallel invites proceed together but makes a concurrent cancellation
        // wait; that cancellation then expires this invitation. The job is not modified.
        const rows = await tx.$queryRaw<{ status: string }[]>`
          SELECT "status" FROM "Job" WHERE "id" = ${jobId} FOR SHARE`;
        if (rows[0]?.status !== 'MATCHED') throw jobModified();
      }

      // 3. Create. The unique (jobId, workshopId) index guarantees a single row.
      return tx.jobInvitation.create({
        data: {
          jobId,
          workshopId,
          matchScore: match.score!,
          distanceKm: match.distanceKm,
          scoreBreakdown: match.scoreBreakdown as unknown as Prisma.InputJsonValue,
          matchReasons: match.explanations,
          rank: match.rank!,
          status: 'INVITED',
        },
      });
    });
    const jobState = { deadline: job.deadline, status: 'MATCHED' as const };
    return { created: true, invitation: buyerView(invitation, jobState, now), jobStatus: 'MATCHED' as const };
  } catch (err) {
    // Lost a race with an identical invite: the unique (jobId, workshopId) constraint fired.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const later = new Date();
      const winner = await findExistingInvitation(jobId, workshopId, later);
      if (winner) {
        const fresh = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { deadline: true, status: true } });
        return duplicateResult(winner, fresh, later);
      }
    }
    throw err;
  }
}

async function findExistingInvitation(jobId: string, workshopId: string, now: Date) {
  await expireOverdueInvitations({ jobId, workshopId }, now);
  return prisma.jobInvitation.findUnique({ where: { jobId_workshopId: { jobId, workshopId } } });
}

function duplicateResult(existing: JobInvitation, job: InvitationJobState, now: Date) {
  const status = effectiveInvitationStatus(existing.status, existing.createdAt, job, now);
  const rule = DUPLICATE_RULES[status];
  if (rule !== 'return') throw ApiError.conflict(rule);
  return { created: false, invitation: buyerView(existing, job, now), jobStatus: job.status };
}

// ---------- Buyer / admin: list a job's invitations ----------

export async function listJobInvitations(user: AuthUser, jobId: string, query: JobInvitationsQuery) {
  const now = new Date();
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, buyerId: true, deadline: true, status: true } });
  if (!job || (user.role !== 'ADMIN' && job.buyerId !== user.id)) throw ApiError.notFound('Job not found');

  await expireOverdueInvitations({ jobId }, now);
  const invitations = await prisma.jobInvitation.findMany({
    where: { jobId, ...(query.status && { status: query.status }) },
    orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: { workshop: { select: { id: true, businessName: true, city: true, verificationStatus: true } } },
  });

  return {
    jobId,
    jobStatus: job.status,
    items: invitations.map(({ workshop, ...inv }) => ({ ...buyerView(inv, job, now), workshop })),
  };
}

// ---------- Workshop: list my invitations ----------

export async function listMyInvitations(user: AuthUser, query: WorkshopInvitationsQuery) {
  const now = new Date();
  const workshopId = await getMyWorkshopId(user);
  await expireOverdueInvitations({ workshopId }, now);

  const where: Prisma.JobInvitationWhereInput = { workshopId, ...(query.status && { status: query.status }) };
  const [total, invitations] = await prisma.$transaction([
    prisma.jobInvitation.count({ where }),
    prisma.jobInvitation.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { job: { select: workshopJobSelect } },
    }),
  ]);

  return {
    items: invitations.map(({ job: { buyer, ...job }, ...inv }) => ({
      ...workshopView(inv, job, now),
      job,
      buyer,
    })),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}

// ---------- Workshop: accept / decline ----------

export async function respondToInvitation(user: AuthUser, invitationId: string, input: RespondInvitationInput) {
  const now = new Date();
  const current = await prisma.jobInvitation.findUnique({
    where: { id: invitationId },
    include: { workshop: { select: { userId: true } } },
  });
  // Another workshop's invitation looks non-existent.
  if (!current || current.workshop.userId !== user.id) throw ApiError.notFound('Invitation not found');

  await expireOverdueInvitations({ id: invitationId }, now);

  // One atomic conditional write: still INVITED, not expired, job still open, owned by caller.
  // Concurrent accept/decline, expiry or job cancellation can never both succeed.
  const { count } = await prisma.jobInvitation.updateMany({
    where: { AND: [{ id: invitationId, workshop: { is: { userId: user.id } } }, respondableInvitationWhere(now)] },
    data: { status: input.response, respondedAt: now, responseNote: input.note ?? null },
  });

  const after = await prisma.jobInvitation.findUniqueOrThrow({
    where: { id: invitationId },
    include: { job: { select: workshopJobSelect } },
  });
  const status = effectiveInvitationStatus(after.status, after.createdAt, after.job, now);

  if (count === 0) {
    if (status === 'ACCEPTED' || status === 'DECLINED') {
      throw ApiError.conflict(`Invitation has already been ${status.toLowerCase()}`);
    }
    if (status === 'EXPIRED') {
      throw ApiError.conflict(
        MATCHABLE_STATUSES.includes(after.job.status)
          ? 'Invitation has expired'
          : `Invitation has expired: the job is no longer open (${after.job.status})`,
      );
    }
    throw ApiError.conflict('Invitation was modified, please retry');
  }

  const { job: { buyer, ...job }, ...inv } = after;
  return { ...workshopView(inv, job, now), job, buyer };
}
