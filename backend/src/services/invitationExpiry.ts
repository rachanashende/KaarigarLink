/**
 * Single source of truth for invitation expiry.
 *
 * An INVITED invitation is EXPIRED when EITHER:
 *   1. time runs out:   now >= expiresAt, where expiresAt = min(createdAt + 7 days, job deadline)
 *   2. the job leaves OPEN/MATCHED (e.g. Member 2 moves it to AWARDED / IN_PROGRESS /
 *      COMPLETED): an outstanding invitation can no longer be answered.
 *
 * Only INVITED invitations expire through these rules. ACCEPTED invitations are
 * kept (Member 2's order workflow may need them); DECLINED and EXPIRED never
 * change. Separately, cancelling a job expires INVITED and ACCEPTED
 * invitations in the job-update transaction (existing M5 behaviour).
 *
 * Used by buyer listings, workshop listings, matching results, re-invites and
 * response validation, so every endpoint agrees.
 *
 * Member 2: after moving a job to another lifecycle state, call
 * `expireOverdueInvitations({ jobId })` (ideally in the same transaction, passing
 * `tx` as `db`) so outstanding invitations are saved as EXPIRED immediately.
 */
import type { InvitationStatus, JobStatus, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

export const INVITATION_RESPONSE_WINDOW_DAYS = 7;
const WINDOW_MS = INVITATION_RESPONSE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Job states in which an INVITED invitation can still be answered. */
export const INVITATION_OPEN_JOB_STATUSES: JobStatus[] = ['OPEN', 'MATCHED'];

export interface InvitationJobState {
  deadline: Date;
  status: JobStatus;
}

/** Time-based expiry only. The status can become EXPIRED earlier (job state, cancellation). */
export function invitationExpiresAt(createdAt: Date, jobDeadline: Date): Date {
  return new Date(Math.min(createdAt.getTime() + WINDOW_MS, jobDeadline.getTime()));
}

/** Time-based check; the boundary instant counts as expired. */
export function isPastExpiry(createdAt: Date, jobDeadline: Date, now: Date): boolean {
  return now.getTime() >= invitationExpiresAt(createdAt, jobDeadline).getTime();
}

/** Status to show: an INVITED invitation that is past expiry or whose job closed is EXPIRED. */
export function effectiveInvitationStatus(
  status: InvitationStatus,
  createdAt: Date,
  job: InvitationJobState,
  now: Date,
): InvitationStatus {
  if (status !== 'INVITED') return status;
  if (!INVITATION_OPEN_JOB_STATUSES.includes(job.status)) return 'EXPIRED';
  return isPastExpiry(createdAt, job.deadline, now) ? 'EXPIRED' : 'INVITED';
}

/** Prisma filter for INVITED invitations that are expired at `now` (same rules as above). */
export function overdueInvitationWhere(now: Date): Prisma.JobInvitationWhereInput {
  return {
    status: 'INVITED',
    OR: [
      { createdAt: { lte: new Date(now.getTime() - WINDOW_MS) } },
      { job: { is: { deadline: { lte: now } } } },
      { job: { is: { status: { notIn: INVITATION_OPEN_JOB_STATUSES } } } },
    ],
  };
}

/** Prisma filter for INVITED invitations that can still be answered at `now` (exact complement). */
export function respondableInvitationWhere(now: Date): Prisma.JobInvitationWhereInput {
  return {
    status: 'INVITED',
    createdAt: { gt: new Date(now.getTime() - WINDOW_MS) },
    job: { is: { deadline: { gt: now }, status: { in: INVITATION_OPEN_JOB_STATUSES } } },
  };
}

/**
 * Lazy expiry: persists EXPIRED for INVITED invitations within `scope` that are
 * expired at `now` (e.g. scope { jobId }, { workshopId }, { id }). Only touches
 * INVITED rows, so it can never overwrite an ACCEPTED/DECLINED response. Safe to
 * call repeatedly and concurrently; returns how many were expired.
 */
export async function expireOverdueInvitations(
  scope: Prisma.JobInvitationWhereInput,
  now: Date = new Date(),
  db: Pick<typeof prisma, 'jobInvitation'> = prisma,
): Promise<number> {
  const { count } = await db.jobInvitation.updateMany({
    where: { AND: [scope, overdueInvitationWhere(now)] },
    data: { status: 'EXPIRED' },
  });
  return count;
}
