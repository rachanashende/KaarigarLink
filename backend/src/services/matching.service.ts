import type { JobStatus } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { DEFAULT_MATCHING_CONFIG } from './matching/config';
import { hasValidCoordinates } from './matching/distance';
import { matchWorkshops } from './matching/matchEngine';
import type { MatchesQuery } from '../validators/matching.validator';

/**
 * Jobs that can be matched. OPEN = ready for matching; MATCHED = invitations
 * already sent (M8), still useful to view or invite more. DRAFT, CANCELLED and
 * Member 2's AWARDED/IN_PROGRESS/COMPLETED are refused.
 */
const MATCHABLE_STATUSES: JobStatus[] = ['OPEN', 'MATCHED'];

/**
 * Read-only: computes matches live and changes nothing. It creates no
 * invitations and does not change the job status (buyers invite separately).
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

  const results = matchWorkshops(job, workshops, { now, maxDistanceKm: query.maxDistanceKm });

  // Existing invitations are shown read-only so the buyer knows who was already invited.
  const invitations = await prisma.jobInvitation.findMany({
    where: { jobId },
    select: { id: true, workshopId: true, status: true },
  });
  const invitationByWorkshop = new Map(invitations.map((i) => [i.workshopId, { id: i.id, status: i.status }]));

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
