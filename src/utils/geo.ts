/**
 * Geographic utilities and distance calculator using Haversine formula
 * Robust number parsing for lat/lng (numbers or strings).
 * If coordinates are invalid, missing, or out of range, returns null (never NaN or 0).
 */

export function parseCoordinate(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  if (typeof num !== 'number' || isNaN(num) || !isFinite(num)) return null;
  return num;
}

export function isValidLatitude(lat: unknown): boolean {
  const parsed = parseCoordinate(lat);
  return parsed !== null && parsed >= -90 && parsed <= 90;
}

export function isValidLongitude(lon: unknown): boolean {
  const parsed = parseCoordinate(lon);
  return parsed !== null && parsed >= -180 && parsed <= 180;
}

export function isValidCoordinate(lat: unknown, lon: unknown): boolean {
  return isValidLatitude(lat) && isValidLongitude(lon);
}

/**
 * Calculates great-circle distance between two coordinates in kilometers using Haversine formula.
 * Returns null if any coordinate is missing, invalid, or out of bounds (never returns NaN or 0 pretending to be 0km).
 * Identical valid coordinates return 0.
 */
export function calculateDistanceKm(
  lat1: unknown,
  lon1: unknown,
  lat2: unknown,
  lon2: unknown
): number | null {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return null;
  }

  const pLat1 = parseCoordinate(lat1)!;
  const pLon1 = parseCoordinate(lon1)!;
  const pLat2 = parseCoordinate(lat2)!;
  const pLon2 = parseCoordinate(lon2)!;

  if (pLat1 === pLat2 && pLon1 === pLon2) {
    return 0;
  }

  const R = 6371; // Earth's mean radius in km
  const dLat = ((pLat2 - pLat1) * Math.PI) / 180;
  const dLon = ((pLon2 - pLon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pLat1 * Math.PI) / 180) *
      Math.cos((pLat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Safe fallback wrapper for distance calculation
 */
export function calculateDistanceKmSafe(
  lat1: unknown,
  lon1: unknown,
  lat2: unknown,
  lon2: unknown,
  fallbackKm: number = 0
): number {
  const res = calculateDistanceKm(lat1, lon1, lat2, lon2);
  return res !== null ? res : fallbackKm;
}
