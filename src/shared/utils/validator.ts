import type { ActivityPayload } from "../types/activity";
import type { ClockInPayload, ClockOutPayload } from "../types/dashboard";

export const isActivityPayload = (value: unknown): value is ActivityPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ActivityPayload>;

  return (
    typeof candidate.userId === "string" &&
    (candidate.sessionId === undefined || typeof candidate.sessionId === "string") &&
    typeof candidate.mouseMoves === "number" &&
    typeof candidate.keyPresses === "number" &&
    (candidate.capturedAt === undefined || typeof candidate.capturedAt === "string")
  );
};

export const isClockInPayload = (value: unknown): value is ClockInPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ClockInPayload>;

  return (
    typeof candidate.userId === "string" &&
    (candidate.timestamp === undefined || typeof candidate.timestamp === "string")
  );
};

export const isClockOutPayload = (value: unknown): value is ClockOutPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ClockOutPayload>;

  return (
    typeof candidate.userId === "string" &&
    (candidate.sessionId === undefined || typeof candidate.sessionId === "string") &&
    (candidate.timestamp === undefined || typeof candidate.timestamp === "string")
  );
};
