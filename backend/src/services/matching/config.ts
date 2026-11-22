import type { MachineType, ManufacturingProcess } from '@prisma/client';

/** The five ranking factors. Technical fit and verification are eligibility filters, not factors. */
export type RankingFactor = 'rating' | 'capacityHeadroom' | 'distance' | 'deadlineSlack' | 'experience';

/**
 * Tunable matching configuration. Mandatory eligibility rules are NOT
 * configurable here - only how eligible workshops are scored.
 */
export interface MatchingConfig {
  /** Ranking weights; must sum to 1. */
  weights: Record<RankingFactor, number>;
  /** Distance at or beyond which the distance score is 0. Unknown distance is omitted, not scored. */
  distanceZeroScoreKm: number;
  /** Rating score for workshops with no ratings yet (equivalent to 3/5), so new shops are not buried. */
  unratedRatingScore: number;
  /** Completed jobs at which the experience score reaches 100 (log scale, diminishing returns). */
  experienceFullScoreJobs: number;
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  weights: { rating: 0.35, capacityHeadroom: 0.25, distance: 0.2, deadlineSlack: 0.15, experience: 0.05 },
  distanceZeroScoreKm: 500,
  unratedRatingScore: 60,
  experienceFullScoreJobs: 50,
};

/** Machine types that can perform each process. At least one must be OPERATIONAL. */
export const PROCESS_MACHINE_TYPES: Record<ManufacturingProcess, MachineType[]> = {
  CNC_MACHINING: ['CNC_MILL', 'CNC_LATHE'],
  LATHE_TURNING: ['CNC_LATHE', 'MANUAL_LATHE'],
  SHEET_METAL_FABRICATION: ['PRESS_BRAKE', 'PUNCH_PRESS', 'LASER_CUTTER'],
  LASER_CUTTING: ['LASER_CUTTER'],
  WELDING: ['WELDING_STATION'],
  INJECTION_MOLDING: ['INJECTION_MOLDER'],
  CASTING: ['CASTING_FURNACE'],
  FORGING: ['FORGING_HAMMER'],
  THREE_D_PRINTING: ['THREE_D_PRINTER'],
  POWDER_COATING: ['POWDER_COATING_BOOTH'],
};
