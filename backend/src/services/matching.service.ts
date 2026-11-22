import type { Job, JobRequirement, JobStatus } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { DEFAULT_MATCHING_CONFIG } from './matching/config';
import { hasValidCoordinates } from './matching/distance';
import { matchWorkshops, type MatchOptions } from './matching/matchEngine';
import { effectiveInvitationStatus, expireOverdueInvitations } from './invitationExpiry';
import type { MatchesQuery } from '../validators/matching.validator';

/**
 * Jobs that can be matched. OPEN = ready for matching; MATCHED = invitations
 * already sent (M8), still useful to view or invite more. DRAFT, CANCELLED and
 * Member 2's AWARDED/IN_PROGRESS/COMPLETED are refused.
 */
export const MATCHABLE_STATUSES: JobStatus[] = ['OPEN', 'MATCHED'];

/**
 * Loads every workshop and runs the matching engine for `job` at `now`.
 * Returns the evaluated results AND the workshop rows they were computed from
 * (invitations re-check those rows under a lock before inviting).
 */
export async function computeMatchesWithCandidates(
  job: Job & { requirements: JobRequirement[] },
  now: Date,
  options: Omit<MatchOptions, 'now'> = {},
) {
  const workshops = await prisma.workshop.findMany({
    orderBy: { id: 'asc' },
    include: {
      machines: { select: { machineType: true, quantity: true, operationalStatus: true } },
      capabilities: {
        select: { manufacturingProcess: true, supportedMaterials: true, specifications: true, leadTimeDays: true },
      },
      // Past windows can never contribute capacity.
      capacities: {
        where: { endDate: { gte: now } },
        select: { availableCapacity: true, capacityUnit: true, startDate: true, endDate: true },
      },
    },
  });
  return { workshops, results: matchWorkshops(job, workshops, { ...options, now }) };
}

/** Matching results only. Shared by GET /matches and invitations. */
export async function computeMatchesForJob(
  job: Job & { requirements: JobRequirement[] },
  now: Date,
  options: Omit<MatchOptions, 'now'> = {},
) {
  return (await computeMatchesWithCandidates(job, now, options)).results;
}

/**
 * Computes matches live. It never creates invitations and never changes the
 * job (buyers invite separately). Its only write is lazy expiry: invitations
 * of this job that are already expired are saved as EXPIRED before being shown.
 */
export async function getJobMatches(user: AuthUser, jobId: string, query: MatchesQuery) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { requirements: true } });
  // Same visibility rule as GET /api/jobs/:id for buyers: other buyers' jobs look non-existent.
  if (!job || (user.role !== 'ADMIN' && job.buyerId !== user.id)) throw ApiError.notFound('Job not found');

  if (!MATCHABLE_STATUSES.includes(job.status)) {
    throw ApiError.conflict(`Matching is only available for OPEN or MATCHED jobs (this job is ${job.status})`);
  }
  if (query.maxDistanceKm !== undefined && !hasValidCoordinates(job)) {
    throw ApiError.badRequest('maxDistanceKm requires the job to have a location (latitude and longitude)');
  }

  const now = new Date();
  const results = await computeMatchesForJob(job, now, { maxDistanceKm: query.maxDistanceKm });

  // Existing invitations are shown so the buyer knows who was already invited.
  // Lazy expiry first, and the same expiry rule on read, so none shows as INVITED once overdue.
  await expireOverdueInvitations({ jobId }, now);
  const invitations = await prisma.jobInvitation.findMany({
    where: { jobId },
    select: { id: true, workshopId: true, status: true, createdAt: true },
  });
  const invitationByWorkshop = new Map(
    invitations.map((i) => [
      i.workshopId,
      { id: i.id, status: effectiveInvitationStatus(i.status, i.createdAt, job, now) },
    ]),
  );

  const eligibleCount = results.filter((r) => r.eligibility.eligible).length;
  return {
    jobId: job.id,
    jobStatus: job.status,
    evaluatedAt: now.toISOString(),
    totalWorkshops: results.length,
    eligibleCount,
    excludedCount: results.length - eligibleCount,
    scoring: {
      weights: DEFAULT_MATCHING_CONFIG.weights,
      distanceZeroScoreKm: DEFAULT_MATCHING_CONFIG.distanceZeroScoreKm,
      maxDistanceKm: query.maxDistanceKm ?? null,
    },
    results: results.map((r) => ({ ...r, invitation: invitationByWorkshop.get(r.workshopId) ?? null })),
  };
}
