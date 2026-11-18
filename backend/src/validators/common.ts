import { z } from 'zod';

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

/** Latitude and longitude must be provided together (or both omitted/null). */
export const coordinatesPairCheck = <T extends { latitude?: number | null; longitude?: number | null }>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  const latGiven = data.latitude !== undefined;
  const lngGiven = data.longitude !== undefined;
  const latSet = data.latitude !== undefined && data.latitude !== null;
  const lngSet = data.longitude !== undefined && data.longitude !== null;
  if (latGiven !== lngGiven || latSet !== lngSet) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [latGiven ? 'longitude' : 'latitude'],
      message: 'latitude and longitude must be provided together',
    });
  }
};

export const idParamSchema = z.object({ id: z.string().min(1) });

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accepts an ISO date or datetime string. A date-only value ("2026-12-01") is
 * read as UTC midnight, or - with endOfDay - as 23:59:59.999 UTC, so that an
 * end date of "2026-12-01" includes the whole of that day.
 */
export const dateInput = (opts: { endOfDay?: boolean } = {}) =>
  z
    .string({ required_error: 'Date is required', invalid_type_error: 'Date must be an ISO string' })
    .trim()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date, use ISO format e.g. 2026-12-01')
    .transform((s) => {
      if (DATE_ONLY.test(s)) {
        return new Date(`${s}T${opts.endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
      }
      return new Date(s);
    });

/** Free-form JSON object (e.g. machine specifications). */
export const jsonObjectSchema = z.record(z.unknown());
