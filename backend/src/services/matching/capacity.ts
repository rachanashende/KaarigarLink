import type { QuantityUnit } from '@prisma/client';

export interface CapacityWindow {
  availableCapacity: number;
  capacityUnit: QuantityUnit;
  startDate: Date;
  endDate: Date;
}

/**
 * Capacity is assumed to be spread evenly across each window:
 * a window of 300 units over 30 days produces 10 units/day.
 */
function windowsFor(windows: CapacityWindow[], unit: QuantityUnit) {
  return windows
    .filter((w) => w.capacityUnit === unit && w.availableCapacity > 0 && w.endDate.getTime() >= w.startDate.getTime())
    .map((w) => {
      const start = w.startDate.getTime();
      const end = w.endDate.getTime();
      const durationMs = Math.max(1, end - start);
      return { start, end, ratePerMs: w.availableCapacity / durationMs };
    })
    .sort((a, b) => a.start - b.start);
}

/** Units that can be produced between `from` and `to` (pro-rated by overlap). */
export function capacityBetween(windows: CapacityWindow[], unit: QuantityUnit, from: Date, to: Date): number {
  let total = 0;
  for (const w of windowsFor(windows, unit)) {
    const overlap = Math.min(w.end, to.getTime()) - Math.max(w.start, from.getTime());
    if (overlap > 0) total += w.ratePerMs * overlap;
  }
  return total;
}

/**
 * Earliest moment `quantity` units are produced, starting at `from`, or null
 * if the windows can never produce that much.
 */
export function productionFinishDate(
  windows: CapacityWindow[],
  unit: QuantityUnit,
  quantity: number,
  from: Date,
): Date | null {
  // Same tolerance as the capacity check: pro-rating can under-count exact totals by ~1e-9.
  const EPSILON = 1e-6;
  let remaining = quantity;
  for (const w of windowsFor(windows, unit)) {
    const segStart = Math.max(w.start, from.getTime());
    if (segStart >= w.end) continue;
    const segCapacity = w.ratePerMs * (w.end - segStart);
    if (segCapacity + EPSILON >= remaining) {
      return new Date(Math.min(w.end, segStart + remaining / w.ratePerMs));
    }
    remaining -= segCapacity;
  }
  return null;
}

/** Start of the next window (of this unit) that ends after `from`, if any. */
export function nextWindowStart(windows: CapacityWindow[], unit: QuantityUnit, from: Date): Date | null {
  const next = windowsFor(windows, unit).find((w) => w.end > from.getTime());
  return next ? new Date(next.start) : null;
}
