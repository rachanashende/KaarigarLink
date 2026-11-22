const EARTH_RADIUS_KM = 6371;

export interface Coordinates {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

/** True only for finite, in-range latitude/longitude pairs. */
export function hasValidCoordinates(c: Coordinates): c is { latitude: number; longitude: number } {
  return (
    typeof c.latitude === 'number' &&
    typeof c.longitude === 'number' &&
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180
  );
}

/** Great-circle distance in km (Haversine formula). */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance in km, or null if either side has no valid coordinates. */
export function distanceBetween(a: Coordinates, b: Coordinates): number | null {
  if (!hasValidCoordinates(a) || !hasValidCoordinates(b)) return null;
  return haversineKm(a, b);
}
