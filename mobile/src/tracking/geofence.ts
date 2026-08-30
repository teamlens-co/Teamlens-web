import type { GeofenceMatch, OfficeLocation } from "@/services/api";

/**
 * The same geofence maths the Go API runs, duplicated on the device so the app
 * can tell someone they are 800 m from the office *before* they tap clock in.
 * The server remains the authority — this only saves a failed round trip.
 */

const EARTH_RADIUS_METERS = 6371000;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function matchGeofence(
  offices: OfficeLocation[],
  latitude: number,
  longitude: number,
): GeofenceMatch {
  const match: GeofenceMatch = {
    inside: false,
    distanceMeters: -1,
    radiusMeters: 0,
    hasOfficeSetup: offices.length > 0,
  };

  for (const office of offices) {
    const distance = haversineMeters(
      latitude,
      longitude,
      office.latitude,
      office.longitude,
    );
    const inside = distance <= office.radiusMeters;

    // An office we are inside always beats one we are outside; between two of
    // the same kind, the nearer one wins.
    const nearer = match.distanceMeters < 0 || distance < match.distanceMeters;
    if ((inside && !match.inside) || (inside === match.inside && nearer)) {
      match.inside = inside;
      match.officeId = office.id;
      match.officeLabel = office.label;
      match.distanceMeters = distance;
      match.radiusMeters = office.radiusMeters;
    }
  }

  return match;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
