/**
 * Matching engine - pure functions, no database access.
 *
 * For one job it evaluates every workshop:
 *   1. Mandatory eligibility (all checks run, every failure is reported):
 *      verification (VERIFIED only), capability, material, machines,
 *      requirements, capacity in the time window, deadline feasibility,
 *      optional max distance. Missing coordinates never exclude a workshop.
 *   2. Scoring (eligible only), five factors each 0..100: rating 35%, capacity
 *      headroom 25%, distance 20%, deadline slack 15%, experience 5%. When the
 *      distance is unknown it is omitted and the remaining weights are re-normalised.
 *   3. Deterministic ranking.
 * Ineligible workshops get score: null - they are never scored.
 */
import type {
  MachineStatus,
  MachineType,
  ManufacturingProcess,
  QuantityUnit,
  RequirementType,
  VerificationStatus,
} from '@prisma/client';
import { materialMatch, normalizeCertification, normalizeMaterial } from '../../utils/normalize';
import { DEFAULT_MATCHING_CONFIG, PROCESS_MACHINE_TYPES, type MatchingConfig, type RankingFactor } from './config';
import { distanceBetween, hasValidCoordinates } from './distance';
import { capacityBetween, nextWindowStart, productionFinishDate, type CapacityWindow } from './capacity';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- Input types (plain data, decoupled from Prisma) ----------

export interface MatchJobInput {
  id: string;
  material: string;
  manufacturingProcess: ManufacturingProcess;
  quantity: number;
  quantityUnit: QuantityUnit;
  deadline: Date;
  latitude: number | null;
  longitude: number | null;
  requirements: { requirementType: RequirementType; requirementValue: string; isMandatory: boolean }[];
}

export interface MatchWorkshopInput {
  id: string;
  businessName: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  certifications: string[];
  verificationStatus: VerificationStatus;
  rating: number;
  ratingCount: number;
  totalCompletedJobs: number;
  machines: { machineType: MachineType; quantity: number; operationalStatus: MachineStatus }[];
  capabilities: {
    manufacturingProcess: ManufacturingProcess;
    supportedMaterials: string[];
    specifications: unknown;
    leadTimeDays: number;
  }[];
  capacities: CapacityWindow[];
}

export interface MatchOptions {
  now: Date;
  /** Optional hard limit; workshops farther away (or with unknown distance) are excluded. */
  maxDistanceKm?: number;
  config?: MatchingConfig;
}

// ---------- Output ----------

export interface ScoreBreakdown {
  ratingScore: number;
  capacityHeadroomScore: number;
  /** null when the distance is unknown (job or workshop has no location). */
  distanceScore: number | null;
  deadlineSlackScore: number;
  experienceScore: number;
  /** Configured weights. */
  weights: MatchingConfig['weights'];
  /** Weights actually applied: distance is 0 and the rest re-normalised when distance is unknown. */
  effectiveWeights: MatchingConfig['weights'];
}

export interface WorkshopMatch {
  jobId: string;
  workshopId: string;
  businessName: string;
  city: string | null;
  /** Always the workshop's real status - PENDING is never shown as VERIFIED. */
  verificationStatus: VerificationStatus;
  rating: number;
  ratingCount: number;
  totalCompletedJobs: number;
  distanceKm: number | null;
  /** 0-100 for eligible workshops, null for excluded ones. */
  score: number | null;
  /** 1-based position among eligible workshops, null when excluded. */
  rank: number | null;
  scoreBreakdown: ScoreBreakdown | null;
  /** Units the workshop can produce between now and the deadline (floored). */
  availableCapacity: number;
  /** ISO date-time when the job would be ready (production + lead time), if it can be produced. */
  estimatedCompletion: string | null;
  /** What the workshop satisfies (shown for eligible AND excluded workshops). */
  explanations: string[];
  eligibility: { eligible: boolean; reasons: string[] };
}

// ---------- Helpers ----------

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Locale-independent string order, so ranking never depends on server settings. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const fmtKm = (km: number) => `${round1(km)} km`;
const fmtUnits = (n: number, unit: QuantityUnit) => `${Math.floor(n + 1e-6).toLocaleString('en-US')} ${unit}`;

/** Reads a positive number from capability.specifications JSON, if present. */
function specNumber(specs: unknown, key: string): number | undefined {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return undefined;
  const value = (specs as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

interface CheckResult {
  ok: boolean;
  /** Text describing the outcome (used as explanation if ok, as reason if not). */
  message: string;
}

/** Evaluates one job requirement against the workshop. `OTHER` is informational only. */
function checkRequirement(
  req: MatchJobInput['requirements'][number],
  ws: MatchWorkshopInput,
  capability: MatchWorkshopInput['capabilities'][number] | undefined,
): CheckResult | null {
  switch (req.requirementType) {
    case 'MACHINE_TYPE': {
      const type = req.requirementValue as MachineType;
      const ofType = ws.machines.filter((m) => m.machineType === type);
      const operational = ofType.filter((m) => m.operationalStatus === 'OPERATIONAL');
      if (operational.length > 0) {
        const count = operational.reduce((n, m) => n + m.quantity, 0);
        return { ok: true, message: `Has ${count} operational ${type} machine${count === 1 ? '' : 's'} (required ${type})` };
      }
      if (ofType.length > 0) {
        const states = [...new Set(ofType.map((m) => m.operationalStatus))].join('/');
        return { ok: false, message: `Required ${type} machine is not operational (${states})` };
      }
      return { ok: false, message: `No ${type} machine (required ${type})` };
    }
    case 'TOLERANCE_MM': {
      const needed = Number(req.requirementValue);
      const achievable = specNumber(capability?.specifications, 'minToleranceMm');
      if (!capability) return { ok: false, message: `Cannot confirm tolerance ±${req.requirementValue} mm (no matching capability)` };
      if (achievable === undefined) {
        return { ok: false, message: `Tolerance not specified for ${capability.manufacturingProcess}; job requires ±${needed} mm` };
      }
      return achievable <= needed
        ? { ok: true, message: `Achieves ±${achievable} mm tolerance (required ±${needed} mm)` }
        : { ok: false, message: `Tightest tolerance ±${achievable} mm is looser than required ±${needed} mm` };
    }
    case 'PART_SIZE_MM': {
      const needed = Number(req.requirementValue);
      const maxSize = specNumber(capability?.specifications, 'maxPartSizeMm');
      if (!capability) return { ok: false, message: `Cannot confirm part size ${needed} mm (no matching capability)` };
      if (maxSize === undefined) {
        return { ok: false, message: `Maximum part size not specified for ${capability.manufacturingProcess}; job requires ${needed} mm` };
      }
      return maxSize >= needed
        ? { ok: true, message: `Handles parts up to ${maxSize} mm (required ${needed} mm)` }
        : { ok: false, message: `Maximum part size ${maxSize} mm is smaller than required ${needed} mm` };
    }
    case 'CERTIFICATION': {
      const cert = normalizeCertification(req.requirementValue);
      return ws.certifications.map(normalizeCertification).includes(cert)
        ? { ok: true, message: `Holds ${cert} certification` }
        : { ok: false, message: `Lacks required ${cert} certification` };
    }
    case 'OTHER':
      return null;
  }
}

// ---------- Core ----------

/** Evaluates a single workshop for a job. `rank` is filled in by matchWorkshops. */
export function evaluateWorkshop(
  job: MatchJobInput,
  ws: MatchWorkshopInput,
  options: MatchOptions,
): WorkshopMatch {
  const config = options.config ?? DEFAULT_MATCHING_CONFIG;
  const now = options.now;
  const explanations: string[] = [];
  const reasons: string[] = [];
  const pass = (m: string) => explanations.push(m);
  const fail = (m: string) => reasons.push(m);

  // 1. Verification: only VERIFIED workshops are eligible.
  if (ws.verificationStatus === 'VERIFIED') pass('Verified workshop');
  else if (ws.verificationStatus === 'PENDING') {
    fail('Workshop is not yet verified (verification PENDING); only verified workshops are eligible');
  } else fail('Workshop verification was rejected by an admin');

  // 2. Capability for the process, and 3. material.
  const material = normalizeMaterial(job.material);
  const capability = ws.capabilities.find((c) => c.manufacturingProcess === job.manufacturingProcess);
  if (!capability) {
    fail(`No ${job.manufacturingProcess} capability`);
  } else {
    pass(`Offers ${job.manufacturingProcess}`);
    const materials = capability.supportedMaterials.map(normalizeMaterial);
    // Exact material, or a grade/form of a supported material ("aluminium 6061" -> aluminium).
    const exact = materials.find((m) => materialMatch(material, m) === 'exact');
    const base = exact ?? materials.find((m) => materialMatch(material, m) === 'variant');
    if (exact) pass(`Supports ${material} for ${job.manufacturingProcess}`);
    else if (base) pass(`Supports ${base} for ${job.manufacturingProcess} (${material} is a grade or form of ${base})`);
    else fail(`Does not support ${material} for ${job.manufacturingProcess} (supports: ${materials.join(', ') || 'none'})`);
  }

  // 4. A suitable machine must be OPERATIONAL.
  const suitableTypes = PROCESS_MACHINE_TYPES[job.manufacturingProcess];
  const suitable = ws.machines.filter((m) => suitableTypes.includes(m.machineType));
  const operational = suitable.filter((m) => m.operationalStatus === 'OPERATIONAL');
  if (operational.length > 0) {
    const count = operational.reduce((n, m) => n + m.quantity, 0);
    const types = [...new Set(operational.map((m) => m.machineType))].join(', ');
    pass(`${count} operational machine${count === 1 ? '' : 's'} for ${job.manufacturingProcess} (${types})`);
  } else if (suitable.length > 0) {
    const states = [...new Set(suitable.map((m) => `${m.machineType} ${m.operationalStatus}`))].join(', ');
    fail(`No operational machine for ${job.manufacturingProcess} (${states})`);
  } else {
    fail(`No machine suitable for ${job.manufacturingProcess} (needs one of: ${suitableTypes.join(', ')})`);
  }

  // 5. Job requirements (mandatory exclude; optional only inform).
  for (const req of job.requirements) {
    const result = checkRequirement(req, ws, capability);
    if (!result) continue;
    if (req.isMandatory) (result.ok ? pass : fail)(result.message);
    else pass(result.ok ? `Optional: ${result.message}` : `Optional requirement not met: ${result.message}`);
  }

  // 6. Capacity between now and the deadline (same unit only, pro-rated).
  const available = capacityBetween(ws.capacities, job.quantityUnit, now, job.deadline);
  // Tiny epsilon: pro-rating can yield 499.9999999 for exactly 500 units.
  const availableFloor = Math.floor(available + 1e-6);
  let finish: Date | null = null;
  if (job.deadline.getTime() <= now.getTime()) {
    fail('Job deadline has already passed');
  } else if (available <= 0) {
    const next = nextWindowStart(ws.capacities, job.quantityUnit, now);
    fail(
      next && next.getTime() > job.deadline.getTime()
        ? `No free capacity before the deadline (next capacity window starts ${isoDay(next)}, deadline ${isoDay(job.deadline)})`
        : `No free ${job.quantityUnit} capacity before the ${isoDay(job.deadline)} deadline`,
    );
  } else if (availableFloor < job.quantity) {
    fail(
      `Insufficient capacity: about ${fmtUnits(available, job.quantityUnit)} free before the deadline, job needs ${fmtUnits(job.quantity, job.quantityUnit)}`,
    );
  } else {
    pass(`About ${fmtUnits(available, job.quantityUnit)} free before the deadline (needs ${fmtUnits(job.quantity, job.quantityUnit)})`);
    finish = productionFinishDate(ws.capacities, job.quantityUnit, job.quantity, now);
  }

  // 7. Deadline feasibility: production finish + capability lead time.
  let estimatedCompletion: Date | null = null;
  if (availableFloor >= job.quantity && capability && !finish) {
    // Defensive: never treat a workshop as eligible without a completion estimate.
    fail('Cannot estimate a completion date from the published capacity');
  }
  if (finish && capability) {
    estimatedCompletion = new Date(finish.getTime() + capability.leadTimeDays * DAY_MS);
    const lead = capability.leadTimeDays > 0 ? ` incl. ${capability.leadTimeDays}-day lead time` : '';
    if (estimatedCompletion.getTime() <= job.deadline.getTime()) {
      const spare = (job.deadline.getTime() - estimatedCompletion.getTime()) / DAY_MS;
      pass(
        `Estimated completion ${isoDay(estimatedCompletion)}${lead}, ${round1(spare)} days before the ${isoDay(job.deadline)} deadline`,
      );
    } else {
      fail(`Cannot meet deadline: estimated completion ${isoDay(estimatedCompletion)}${lead}, after the ${isoDay(job.deadline)} deadline`);
    }
  }

  // 8. Distance (always reported; a hard filter only when maxDistanceKm is given).
  const distanceKm = distanceBetween(job, ws);
  const jobHasLocation = hasValidCoordinates(job);
  // Missing coordinates never exclude a workshop; distance is simply not scored.
  if (distanceKm !== null) pass(`${fmtKm(distanceKm)} from the job location`);
  // M13 (BUG-03): a delivery city/state is text only; distance needs map coordinates, which
  // are never guessed, so say exactly why distance is not scored.
  else if (!jobHasLocation) pass('Distance not scored: the job has no map coordinates (a delivery city and state are not converted to coordinates)');
  else pass('Distance not scored: the workshop profile has no map coordinates');

  if (options.maxDistanceKm !== undefined && jobHasLocation) {
    if (distanceKm === null) pass(`Distance unknown (no workshop location), so the ${options.maxDistanceKm} km limit was not applied`);
    else if (distanceKm > options.maxDistanceKm) fail(`${fmtKm(distanceKm)} away, beyond the ${options.maxDistanceKm} km limit`);
  }

  // Rating and experience info (never filters).
  pass(ws.ratingCount > 0 ? `Rated ${ws.rating.toFixed(1)}/5 from ${ws.ratingCount} review${ws.ratingCount === 1 ? '' : 's'}` : 'No ratings yet');
  pass(`${ws.totalCompletedJobs} completed job${ws.totalCompletedJobs === 1 ? '' : 's'} on the platform`);

  const eligible = reasons.length === 0;

  // Scoring - eligible workshops only. Every factor is normalised to 0..100.
  let score: number | null = null;
  let scoreBreakdown: ScoreBreakdown | null = null;
  if (eligible && estimatedCompletion) {
    const clamp100 = (n: number) => Math.min(100, Math.max(0, n));

    // Rating: average out of 5; unrated workshops get a neutral prior (60 = 3/5).
    const ratingScore = ws.ratingCount > 0 ? clamp100((ws.rating / 5) * 100) : config.unratedRatingScore;

    // Capacity headroom: spare capacity beyond the quantity, relative to the quantity.
    // Exactly enough = 0, twice the quantity or more = 100.
    const capacityHeadroomScore = clamp100(((available - job.quantity) / job.quantity) * 100);

    // Distance: linear from 100 at 0 km to 0 at distanceZeroScoreKm; null when unknown.
    const distanceScore =
      distanceKm === null ? null : clamp100(100 * (1 - distanceKm / config.distanceZeroScoreKm));

    // Deadline slack: share of the time until the deadline left over after completion.
    const window = job.deadline.getTime() - now.getTime();
    const deadlineSlackScore = clamp100(((job.deadline.getTime() - estimatedCompletion.getTime()) / window) * 100);

    // Experience: log scale with diminishing returns, 100 at experienceFullScoreJobs.
    const jobsDone = Math.max(0, ws.totalCompletedJobs);
    const experienceScore = clamp100((Math.log1p(jobsDone) / Math.log1p(config.experienceFullScoreJobs)) * 100);

    const factors: Record<RankingFactor, number | null> = {
      rating: ratingScore,
      capacityHeadroom: capacityHeadroomScore,
      distance: distanceScore,
      deadlineSlack: deadlineSlackScore,
      experience: experienceScore,
    };

    // Omit unknown factors (only distance can be unknown) and re-normalise weights to 1.
    const keys = Object.keys(factors) as RankingFactor[];
    const usedWeight = keys.reduce((sum, k) => sum + (factors[k] === null ? 0 : config.weights[k]), 0);
    const effectiveWeights = Object.fromEntries(
      keys.map((k) => [k, factors[k] === null ? 0 : config.weights[k] / usedWeight]),
    ) as Record<RankingFactor, number>;

    score = round1(keys.reduce((sum, k) => sum + effectiveWeights[k] * (factors[k] ?? 0), 0));
    scoreBreakdown = {
      ratingScore: round1(ratingScore),
      capacityHeadroomScore: round1(capacityHeadroomScore),
      distanceScore: distanceScore === null ? null : round1(distanceScore),
      deadlineSlackScore: round1(deadlineSlackScore),
      experienceScore: round1(experienceScore),
      weights: { ...config.weights },
      effectiveWeights: Object.fromEntries(
        keys.map((k) => [k, Math.round(effectiveWeights[k] * 10000) / 10000]),
      ) as Record<RankingFactor, number>,
    };
  }

  return {
    jobId: job.id,
    workshopId: ws.id,
    businessName: ws.businessName,
    city: ws.city,
    verificationStatus: ws.verificationStatus,
    rating: ws.rating,
    ratingCount: ws.ratingCount,
    totalCompletedJobs: ws.totalCompletedJobs,
    distanceKm: distanceKm === null ? null : round1(distanceKm),
    score,
    rank: null,
    scoreBreakdown,
    availableCapacity: Math.max(0, availableFloor),
    estimatedCompletion: estimatedCompletion ? estimatedCompletion.toISOString() : null,
    explanations,
    eligibility: { eligible, reasons },
  };
}

/**
 * Deterministic order for eligible workshops: score desc, then distance asc
 * (unknown last), rating desc, rating count desc, name asc, id asc.
 */
export function compareEligible(a: WorkshopMatch, b: WorkshopMatch): number {
  return (
    (b.score ?? 0) - (a.score ?? 0) ||
    (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) ||
    b.rating - a.rating ||
    b.ratingCount - a.ratingCount ||
    cmp(a.businessName, b.businessName) ||
    cmp(a.workshopId, b.workshopId)
  );
}

/** Evaluates all workshops: eligible ranked first, then excluded (by name). */
export function matchWorkshops(
  job: MatchJobInput,
  workshops: MatchWorkshopInput[],
  options: MatchOptions,
): WorkshopMatch[] {
  const evaluated = workshops.map((ws) => evaluateWorkshop(job, ws, options));
  const eligible = evaluated.filter((m) => m.eligibility.eligible).sort(compareEligible);
  eligible.forEach((m, i) => {
    m.rank = i + 1;
  });
  const excluded = evaluated
    .filter((m) => !m.eligibility.eligible)
    .sort((a, b) => cmp(a.businessName, b.businessName) || cmp(a.workshopId, b.workshopId));
  return [...eligible, ...excluded];
}
