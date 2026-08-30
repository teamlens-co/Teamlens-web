import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Two stores, chosen by sensitivity: the auth token lives in the OS keychain,
 * while tracking state is ordinary app data. The background location task runs
 * outside React, so it reads both from here rather than from context.
 */

const TOKEN_KEY = "teamlens.auth.token";
const SESSION_KEY = "teamlens.tracking.session";
const QUEUE_KEY = "teamlens.tracking.queue";
const STEP_BASE_KEY = "teamlens.tracking.stepBase";

export type TrackedSession = {
  sessionId: string;
  clockInAt: string;
  pingIntervalSeconds: number;
};

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Deleting a key that was never written is not an error worth surfacing.
  }
}

export async function saveTrackedSession(
  session: TrackedSession | null,
): Promise<void> {
  if (session === null) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function readTrackedSession(): Promise<TrackedSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrackedSession;
  } catch {
    return null;
  }
}

// ─── Step baseline ────────────────────────────────────────────────────────

/**
 * Android reports steps since the sensor was subscribed to, not since clock-in,
 * so the count at clock-in is stored and subtracted later.
 */
export async function saveStepBaseline(steps: number): Promise<void> {
  await AsyncStorage.setItem(STEP_BASE_KEY, String(steps));
}

export async function readStepBaseline(): Promise<number> {
  const raw = await AsyncStorage.getItem(STEP_BASE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function clearStepBaseline(): Promise<void> {
  await AsyncStorage.removeItem(STEP_BASE_KEY);
}

// ─── Offline ping queue ───────────────────────────────────────────────────

/**
 * Field staff lose signal constantly, so breadcrumbs are queued on disk and
 * flushed when the network returns. The server deduplicates by capture time, so
 * a batch that fails halfway can be replayed without inflating distance.
 */

const MAX_QUEUE_LENGTH = 2000;

export async function enqueuePings<T>(pings: T[]): Promise<void> {
  if (pings.length === 0) return;

  const queue = await readQueue<T>();
  const next = [...queue, ...pings];

  // Drop the oldest breadcrumbs if the queue grows without bound — a very long
  // offline stretch should not fill the device's storage.
  const trimmed =
    next.length > MAX_QUEUE_LENGTH ? next.slice(next.length - MAX_QUEUE_LENGTH) : next;

  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
}

export async function readQueue<T>(): Promise<T[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Removes the first `count` entries, leaving anything queued mid-flush. */
export async function dropFromQueue(count: number): Promise<void> {
  const queue = await readQueue<unknown>();
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(count)));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
