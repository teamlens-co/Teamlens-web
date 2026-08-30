import { Pedometer } from "expo-sensors";

import {
  clearStepBaseline,
  readStepBaseline,
  saveStepBaseline,
} from "@/services/storage";

/**
 * Steps since clock-in, which is what the API expects.
 *
 * The two platforms expose very different pedometers:
 *
 *  - iOS (CoreMotion) keeps about a week of history, so the count for a shift
 *    can simply be queried for the interval — accurate even if the app was
 *    killed and relaunched mid-shift.
 *  - Android has no history API. Its counter is cumulative since the sensor
 *    started, so the value at clock-in is stored as a baseline and subtracted.
 *
 * Both paths degrade to 0 rather than throwing: a device with no pedometer
 * should still be able to clock in and have its route tracked.
 */

let liveSteps = 0;
let subscription: { remove: () => void } | null = null;

export async function isPedometerAvailable(): Promise<boolean> {
  try {
    return await Pedometer.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function requestPedometerPermission(): Promise<boolean> {
  try {
    const { granted } = await Pedometer.requestPermissionsAsync();
    return granted;
  } catch {
    // Android below the motion-permission era resolves without a prompt.
    return true;
  }
}

/**
 * Starts counting for a new shift. Safe to call when no pedometer exists.
 */
export async function startStepTracking(): Promise<void> {
  liveSteps = 0;
  await clearStepBaseline();

  if (!(await isPedometerAvailable())) return;

  subscription?.remove();
  subscription = Pedometer.watchStepCount((result) => {
    // Android reports steps since this subscription began, so the running total
    // is the baseline for the current shift.
    liveSteps = result.steps;
  });

  await saveStepBaseline(0);
}

export function stopStepTracking(): void {
  subscription?.remove();
  subscription = null;
  liveSteps = 0;
}

/**
 * Returns cumulative steps since `clockInAt`, preferring the platform history
 * API and falling back to the live subscription count.
 */
export async function stepsSince(clockInAt: string): Promise<number | undefined> {
  const start = new Date(clockInAt);
  if (Number.isNaN(start.getTime())) return undefined;

  try {
    const { steps } = await Pedometer.getStepCountAsync(start, new Date());
    if (Number.isFinite(steps)) return steps;
  } catch {
    // Android throws here; fall through to the subscription count.
  }

  const baseline = await readStepBaseline();
  const counted = liveSteps - baseline;
  return counted > 0 ? counted : liveSteps > 0 ? liveSteps : undefined;
}
