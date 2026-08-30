import Constants from "expo-constants";

/**
 * All mobile network calls go through this module so there is one place that
 * knows the base URL, the auth header, and the response envelope.
 */

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  issues?: unknown;
};

export class ApiError extends Error {
  status: number;
  issues?: unknown;

  constructor(status: number, message: string, issues?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }
}

/**
 * Resolves the API base URL. EXPO_PUBLIC_API_URL wins; otherwise we infer the
 * Metro host so a phone on the same LAN reaches the dev machine without any
 * configuration.
 */
export function resolveBaseUrl(): string {
  const configured =
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra?.apiUrl as string | undefined);
  if (configured) return configured.replace(/\/+$/, "");

  const hostUri =
    Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}`;
  }

  // Android emulator loopback to the host machine.
  return "http://10.0.2.2";
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const { method = "GET", body, token } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${resolveBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    // A non-JSON body (a proxy error page, say) still needs a useful message.
  }

  if (!response.ok || envelope?.success === false) {
    throw new ApiError(
      response.status,
      envelope?.message ?? `Request failed (${response.status})`,
      envelope?.issues,
    );
  }

  return envelope?.data as T;
}

// ─── Types mirroring the Go API ───────────────────────────────────────────

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  organizationId?: string;
};

export type LoginResponse = {
  token: string;
  expiresAt: string;
  user: AuthUser;
};

export type WorkSession = {
  id: string;
  userId: string;
  clockInAt: string;
  clockOutAt?: string;
  locationType?: string;
  latitude?: number;
  longitude?: number;
};

export type TrackingSettings = {
  geofencePolicy: "off" | "warn" | "block";
  locationPingIntervalSeconds: number;
  trackLocationWhileClockedIn: boolean;
};

export type OfficeLocation = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export type Bootstrap = {
  userId: string;
  organizationId: string;
  role: string;
  activeSession: WorkSession | null;
  tracking: TrackingSettings;
  officeLocations: OfficeLocation[];
};

export type GeofenceMatch = {
  inside: boolean;
  officeId?: string;
  officeLabel?: string;
  distanceMeters: number;
  radiusMeters: number;
  hasOfficeSetup: boolean;
};

export type LocationPing = {
  capturedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  altitudeMeters?: number;
  speedMps?: number;
  headingDegrees?: number;
  source?: string;
  batteryLevel?: number;
  isMoving?: boolean;
  stepCount?: number;
};

export type PingResult = {
  sessionId: string;
  accepted: number;
  rejected: number;
  duplicates: number;
  distanceMeters: number;
  stepCount: number;
  geofenceStatus?: string;
  nextPingAfterSeconds: number;
};

export type SessionTrack = {
  sessionId: string;
  fullName: string;
  clockInAt: string;
  clockOutAt?: string;
  distanceMeters: number;
  stepCount: number;
  movingSeconds: number;
  stoppedSeconds: number;
  points: Array<{ capturedAt: string; latitude: number; longitude: number }>;
  stops: Array<{
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
    latitude: number;
    longitude: number;
    officeLabel?: string;
  }>;
};

// ─── Endpoints ────────────────────────────────────────────────────────────

export const api = {
  login: (email: string, password: string, deviceLabel?: string) =>
    request<LoginResponse>("/api/mobile/auth/login", {
      method: "POST",
      body: { email, password, deviceLabel },
    }),

  bootstrap: (token: string) =>
    request<Bootstrap>("/api/mobile/bootstrap", { token }),

  clockIn: (
    token: string,
    payload: {
      latitude?: number;
      longitude?: number;
      accuracyMeters?: number;
      locationSource?: string;
    },
  ) =>
    request<WorkSession>("/api/mobile/sessions/clock-in", {
      method: "POST",
      body: payload,
      token,
    }),

  clockOut: (
    token: string,
    sessionId?: string,
    coords?: { latitude: number; longitude: number },
  ) =>
    request<WorkSession>("/api/mobile/sessions/clock-out", {
      method: "POST",
      body: { sessionId, ...coords },
      token,
    }),

  activeSession: (token: string) =>
    request<WorkSession | null>("/api/mobile/sessions/active", { token }),

  postPings: (token: string, sessionId: string, pings: LocationPing[]) =>
    request<PingResult>("/api/mobile/location/pings", {
      method: "POST",
      body: { sessionId, pings },
      token,
    }),

  sessionTrack: (token: string, sessionId: string) =>
    request<SessionTrack>(`/api/mobile/tracking/sessions/${sessionId}`, {
      token,
    }),
};
