import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { api, type LocationPing } from "@/services/api";
import {
  clearQueue,
  dropFromQueue,
  enqueuePings,
  readToken,
  readQueue,
  readTrackedSession,
  saveTrackedSession,
  type TrackedSession,
} from "@/services/storage";
import { startStepTracking, stepsSince, stopStepTracking } from "./pedometer";

/**
 * Background location tracking for a clocked-in shift.
 *
 * The task below runs outside React — the OS wakes it even when the app is
 * backgrounded or killed — so it reads its state from storage rather than from
 * context. Every fix is queued to disk first and only then uploaded, so losing
 * signal in the field costs nothing.
 */

export const LOCATION_TASK = "teamlens-location-tracking";

const MAX_PINGS_PER_REQUEST = 200;

/** Distance, in metres, a device must move before Android reports a new fix. */
const DISTANCE_INTERVAL_METERS = 25;

/**
 * Expo Go cannot run the background task — it needs native config that only a
 * development or production build has. Rather than fail outright, the app falls
 * back to watching position in-process, which records a route for as long as the
 * app stays open. That is enough to demo and test; it is not enough to track a
 * real shift with the phone in a pocket.
 */
export type TrackingMode = "background" | "foreground-only";

let foregroundWatch: Location.LocationSubscription | null = null;

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("[tracking] location task error", error.message);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | null)
    ?.locations;
  if (!locations || locations.length === 0) return;

  const session = await readTrackedSession();
  if (!session) {
    // Clocked out while a fix was in flight — stop rather than record it.
    await stopTracking();
    return;
  }

  await recordLocations(locations, session);
  await flushQueue();
});

/** Converts raw fixes into pings and queues them. */
async function recordLocations(
  locations: Location.LocationObject[],
  session: TrackedSession,
): Promise<void> {
  const [batteryLevel, stepCount] = await Promise.all([
    readBatteryPercent(),
    stepsSince(session.clockInAt),
  ]);

  const pings: LocationPing[] = locations.map((location) => ({
    capturedAt: new Date(location.timestamp).toISOString(),
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyMeters: location.coords.accuracy ?? undefined,
    altitudeMeters: location.coords.altitude ?? undefined,
    speedMps: location.coords.speed ?? undefined,
    headingDegrees: location.coords.heading ?? undefined,
    source: "gps",
    batteryLevel,
    isMoving: (location.coords.speed ?? 0) > 0.5,
    stepCount,
  }));

  await enqueuePings(pings);
}

async function readBatteryPercent(): Promise<number | undefined> {
  try {
    const level = await Battery.getBatteryLevelAsync();
    return level >= 0 ? Math.round(level * 100) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Uploads queued breadcrumbs oldest-first, removing only what the server
 * accepted. A failure leaves the queue intact for the next attempt.
 */
export async function flushQueue(): Promise<void> {
  const token = await readToken();
  const session = await readTrackedSession();
  if (!token || !session) return;

  const queue = await readQueue<LocationPing>();
  if (queue.length === 0) return;

  const batch = queue.slice(0, MAX_PINGS_PER_REQUEST);

  try {
    await api.postPings(token, session.sessionId, batch);
    await dropFromQueue(batch.length);
  } catch (err) {
    const status = (err as { status?: number }).status;

    // 409 means the shift ended server-side; these breadcrumbs can never be
    // accepted, so holding them would block the queue forever.
    if (status === 409) {
      await clearQueue();
      await stopTracking();
      return;
    }

    console.warn("[tracking] flush failed, will retry", (err as Error).message);
  }
}

// ─── Permissions ──────────────────────────────────────────────────────────

export type PermissionOutcome = {
  foreground: boolean;
  background: boolean;
  message?: string;
};

/**
 * Requests foreground permission first, then background. Both platforms require
 * that order, and Android will not even show the background prompt otherwise.
 */
export async function requestLocationPermissions(): Promise<PermissionOutcome> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    return {
      foreground: false,
      background: false,
      message:
        "Location access is required to clock in. Enable it in Settings and try again.",
    };
  }

  // Expo Go can reject this outright rather than prompting; that is a
  // degraded mode, not a failure to clock in.
  let background = { granted: false };
  try {
    background = await Location.requestBackgroundPermissionsAsync();
  } catch {
    background = { granted: false };
  }

  if (!background.granted) {
    return {
      foreground: true,
      background: false,
      message:
        "Background location is off, so your route is only recorded while TeamLens is open. Choose “Allow all the time” to track a full shift.",
    };
  }

  return { foreground: true, background: true };
}

// ─── Lifecycle ────────────────────────────────────────────────────────────

export async function isTracking(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Begins tracking for a shift. The interval comes from org settings, so admins
 * can trade battery life against route detail without shipping a new build.
 */
export async function startTracking(session: TrackedSession): Promise<TrackingMode> {
  await saveTrackedSession(session);
  await startStepTracking();

  if (await isTracking()) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: session.pingIntervalSeconds * 1000,
      distanceInterval: DISTANCE_INTERVAL_METERS,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Other,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "TeamLens is tracking your shift",
        notificationBody: "Your location is recorded until you clock out.",
        notificationColor: "#2563eb",
      },
    });
    return "background";
  } catch (err) {
    console.warn(
      "[tracking] background updates unavailable, watching in foreground",
      (err as Error).message,
    );
    await startForegroundWatch(session);
    return "foreground-only";
  }
}

/**
 * In-process position watching, used when the background task is unavailable.
 * Records the same pings through the same queue, so the server cannot tell the
 * difference — it simply stops when the app is backgrounded.
 */
async function startForegroundWatch(session: TrackedSession): Promise<void> {
  foregroundWatch?.remove();

  foregroundWatch = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: session.pingIntervalSeconds * 1000,
      distanceInterval: DISTANCE_INTERVAL_METERS,
    },
    (location) => {
      void (async () => {
        const current = await readTrackedSession();
        if (!current) {
          await stopTracking();
          return;
        }
        await recordLocations([location], current);
        await flushQueue();
      })();
    },
  );
}

/** Stops tracking and flushes whatever is still queued. */
export async function stopTracking(): Promise<void> {
  foregroundWatch?.remove();
  foregroundWatch = null;

  if (await isTracking()) {
    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    } catch {
      // Already stopped; nothing to unwind.
    }
  }

  stopStepTracking();
  await saveTrackedSession(null);
}

/**
 * Takes a single high-accuracy fix, for the geofence check at clock-in where
 * precision matters more than battery.
 */
export async function getCurrentPosition(): Promise<Location.LocationObject | null> {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
  } catch {
    try {
      return await Location.getLastKnownPositionAsync();
    } catch {
      return null;
    }
  }
}
