import { z } from 'zod';

export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

/** Latitude and longitude must be provided together (or both omitted). */
export const coordinatesPairCheck = <T extends { latitude?: number | null; longitude?: number | null }>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  const hasLat = data.latitude !== undefined && data.latitude !== null;
  const hasLng = data.longitude !== undefined && data.longitude !== null;
  if (hasLat !== hasLng) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasLat ? 'longitude' : 'latitude'],
      message: 'latitude and longitude must be provided together',
    });
  }
};

export const idParamSchema = z.object({ id: z.string().min(1) });
