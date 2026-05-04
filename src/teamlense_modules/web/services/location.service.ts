import { prisma } from "../../../shared/db/prisma";
import { env } from "../../../config/env";

type SqlRow = Record<string, unknown>;

export interface LocationSearchResult {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  provider: "google" | "openstreetmap";
}

const asString = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return "";
};

const asNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const getString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const getRecord = (value: unknown): Record<string, unknown> | undefined => {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
};

export interface OfficeLocation {
  id: string;
  organizationId: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  createdAt: string;
}

/**
 * Haversine formula — returns distance in meters between two lat/lng points.
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class LocationService {
  private static schemaReady = false;

  static async searchOfficeAddresses(query: string): Promise<LocationSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) return [];

    if (env.googlePlacesApiKey) {
      return this.searchGooglePlaces(trimmed);
    }

    return this.searchOpenStreetMap(trimmed);
  }

  private static async searchGooglePlaces(query: string): Promise<LocationSearchResult[]> {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.googlePlacesApiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 8,
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Places search failed with ${response.status}`);
    }

    const payload = getRecord(await response.json());
    const places = Array.isArray(payload?.places) ? payload.places : [];

    return places.flatMap((place): LocationSearchResult[] => {
      const placeRecord = getRecord(place);
      const location = getRecord(placeRecord?.location);
      const displayName = getRecord(placeRecord?.displayName);
      const latitude = Number(location?.latitude);
      const longitude = Number(location?.longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return [];
      }

      const label = getString(displayName?.text) || getString(placeRecord?.formattedAddress) || "Office";
      const address = getString(placeRecord?.formattedAddress) || label;

      return [{
        id: getString(placeRecord?.id) || `${latitude},${longitude}`,
        label,
        address,
        latitude,
        longitude,
        provider: "google",
      }];
    });
  }

  private static async searchOpenStreetMap(query: string): Promise<LocationSearchResult[]> {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "8");
    url.searchParams.set("q", query);

    const response = await fetch(url, {
      headers: {
        "Accept-Language": "en",
        "User-Agent": "TeamLens office location search",
      },
    });

    if (!response.ok) {
      throw new Error(`OpenStreetMap search failed with ${response.status}`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : [];

    return rows.flatMap((row): LocationSearchResult[] => {
      const record = getRecord(row);
      const latitude = Number(record?.lat);
      const longitude = Number(record?.lon);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return [];
      }

      const address = getString(record?.display_name) || "Office";

      return [{
        id: getString(record?.place_id) || `${latitude},${longitude}`,
        label: getString(record?.name) || address.split(",")[0]?.trim() || "Office",
        address,
        latitude,
        longitude,
        provider: "openstreetmap",
      }];
    });
  }

  static async ensureSchema(): Promise<void> {
    if (this.schemaReady || !prisma.$executeRawUnsafe) return;

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "office_locations" (
        "id"              TEXT      PRIMARY KEY,
        "organization_id" TEXT      NOT NULL,
        "label"           TEXT      NOT NULL DEFAULT 'Main Office',
        "latitude"        DOUBLE PRECISION NOT NULL,
        "longitude"       DOUBLE PRECISION NOT NULL,
        "radius_meters"   INTEGER  NOT NULL DEFAULT 200,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Add location columns to work_sessions if not present
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'work_sessions' AND column_name = 'latitude'
        ) THEN
          ALTER TABLE "work_sessions" ADD COLUMN "latitude" DOUBLE PRECISION;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'work_sessions' AND column_name = 'longitude'
        ) THEN
          ALTER TABLE "work_sessions" ADD COLUMN "longitude" DOUBLE PRECISION;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'work_sessions' AND column_name = 'location_type'
        ) THEN
          ALTER TABLE "work_sessions" ADD COLUMN "location_type" TEXT;
        END IF;
      END
      $$;
    `);

    this.schemaReady = true;
  }

  // ---------------------------------------------------------------------------
  // CRUD for office locations (Manager)
  // ---------------------------------------------------------------------------

  static async getOfficeLocations(organizationId: string): Promise<OfficeLocation[]> {
    await this.ensureSchema();
    if (!prisma.$queryRawUnsafe) return [];

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT "id","organization_id","label","latitude","longitude","radius_meters","created_at"
       FROM "office_locations"
       WHERE "organization_id" = $1
       ORDER BY "created_at" ASC`,
      organizationId,
    )) as SqlRow[];

    return rows.map((r) => ({
      id: asString(r.id),
      organizationId: asString(r.organization_id),
      label: asString(r.label),
      latitude: asNumber(r.latitude),
      longitude: asNumber(r.longitude),
      radiusMeters: asNumber(r.radius_meters),
      createdAt: asString(r.created_at),
    }));
  }

  static async upsertOfficeLocation(
    organizationId: string,
    data: { label: string; latitude: number; longitude: number; radiusMeters: number },
  ): Promise<OfficeLocation> {
    await this.ensureSchema();

    // Check if one already exists for this org — update it; otherwise insert.
    const existing = await this.getOfficeLocations(organizationId);

    if (existing.length > 0) {
      const existingLocation = existing[0]!;
      await prisma.$executeRawUnsafe!(
        `UPDATE "office_locations"
         SET "label" = $1, "latitude" = $2, "longitude" = $3, "radius_meters" = $4, "updated_at" = NOW()
         WHERE "id" = $5`,
        data.label,
        data.latitude,
        data.longitude,
        data.radiusMeters,
        existingLocation.id,
      );
      return { ...existingLocation, ...data };
    }

    const id = crypto.randomUUID();
    await prisma.$executeRawUnsafe!(
      `INSERT INTO "office_locations" ("id","organization_id","label","latitude","longitude","radius_meters","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      id,
      organizationId,
      data.label,
      data.latitude,
      data.longitude,
      data.radiusMeters,
    );

    return {
      id,
      organizationId,
      label: data.label,
      latitude: data.latitude,
      longitude: data.longitude,
      radiusMeters: data.radiusMeters,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Re-evaluate currently active sessions in the organization against the
   * latest office locations. This helps dashboard reflect updated rules
   * immediately after manager changes office coordinates/radius.
   */
  static async reclassifyActiveSessions(organizationId: string): Promise<number> {
    await this.ensureSchema();
    if (!prisma.$queryRawUnsafe || !prisma.$executeRawUnsafe) return 0;

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT ws."id", ws."latitude", ws."longitude"
       FROM "work_sessions" ws
       INNER JOIN "users" u ON u."id" = ws."user_id"
       WHERE u."organization_id" = $1
         AND ws."clock_out_at" IS NULL
         AND ws."location_type" <> 'manual'
         AND ws."latitude" IS NOT NULL
         AND ws."longitude" IS NOT NULL`,
      organizationId,
    )) as SqlRow[];

    let updated = 0;
    for (const row of rows) {
      const sessionId = asString(row.id);
      const latitude = asNumber(row.latitude);
      const longitude = asNumber(row.longitude);

      const locationType = await this.determineLocationType(organizationId, latitude, longitude);
      await prisma.$executeRawUnsafe(
        `UPDATE "work_sessions"
         SET "location_type" = $1, "updated_at" = NOW()
         WHERE "id" = $2`,
        locationType,
        sessionId,
      );
      updated += 1;
    }

    return updated;
  }

  static async deleteOfficeLocation(organizationId: string, locationId: string): Promise<boolean> {
    await this.ensureSchema();
    if (!prisma.$executeRawUnsafe) return false;

    await prisma.$executeRawUnsafe(
      `DELETE FROM "office_locations" WHERE "id" = $1 AND "organization_id" = $2`,
      locationId,
      organizationId,
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // Location comparison
  // ---------------------------------------------------------------------------

  /**
   * Determine location type (office/remote) for given coordinates against org's
   * office locations. Returns "office" if within radius of any office, else "remote".
   *
   * When locationSource is "ip", the coordinates are only city-level accurate (~1-50 km),
   * so we use a minimum radius of 50 km to avoid false "remote" classifications.
   */
  static async determineLocationType(
    organizationId: string,
    latitude: number,
    longitude: number,
    locationSource?: "gps" | "ip",
    accuracyMeters?: number,
  ): Promise<"office" | "remote"> {
    const offices = await this.getOfficeLocations(organizationId);

    // IP geolocation is only accurate to ~1-50 km, so use a generous minimum radius
    const IP_MIN_RADIUS = 50_000; // 50 km
    // Desktop/browser geolocation can drift significantly indoors. Use a safety floor
    // so nearby office users are not misclassified as remote.
    const GPS_MIN_RADIUS = 2_000; // 2 km

    for (const office of offices) {
      const dist = haversineDistance(latitude, longitude, office.latitude, office.longitude);
      const gpsAccuracyRadius =
        locationSource === "gps" && typeof accuracyMeters === "number" && Number.isFinite(accuracyMeters)
          ? Math.max(0, Math.round(accuracyMeters))
          : 0;
      const effectiveRadius = locationSource === "ip"
        ? Math.max(office.radiusMeters, IP_MIN_RADIUS)
        : locationSource === "gps"
          ? Math.max(office.radiusMeters, gpsAccuracyRadius, GPS_MIN_RADIUS)
          : Math.max(office.radiusMeters, gpsAccuracyRadius);

      console.log(`[Location] Distance from "${office.label}": ${Math.round(dist)}m, effective radius: ${effectiveRadius}m (source: ${locationSource ?? "unknown"}, accuracy: ${accuracyMeters ?? "n/a"})`);

      if (dist <= effectiveRadius) {
        return "office";
      }
    }

    return "remote";
  }

  /**
   * Compute daily rollup: "Office" | "Remote" | "Mixed" | null
   */
  static computeDailyLocationStatus(locationTypes: Array<string | null | undefined>): string | null {
    const valid = locationTypes.filter((t): t is string => !!t);
    if (valid.length === 0) return null;

    const hasOffice = valid.includes("office");
    const hasRemote = valid.includes("remote");

    if (hasOffice && hasRemote) return "Mixed";
    if (hasOffice) return "Office";
    if (hasRemote) return "Remote";
    return null;
  }
}
