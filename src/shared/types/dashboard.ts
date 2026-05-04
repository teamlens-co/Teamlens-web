export type LocationType = "office" | "remote" | "manual";

export interface ClockInPayload {
  userId: string;
  timestamp?: string;
  activeAfter?: string;
  latitude?: number;
  longitude?: number;
  locationSource?: "gps" | "ip";
  accuracyMeters?: number;
}

export interface ClockOutPayload {
  userId: string;
  sessionId?: string;
  timestamp?: string;
}

export interface WorkSessionRecord {
  id: string;
  userId: string;
  clockInAt: string;
  clockOutAt?: string;
  locationType?: LocationType;
  latitude?: number;
  longitude?: number;
}

export interface DashboardAnalytics {
  userId: string;
  range: string;
  workSeconds: number;
  activeSeconds: number;
  manualSeconds: number;
  productivityPercent: number;
  totalMouseMoves: number;
  totalKeyPresses: number;
  sessions: WorkSessionRecord[];
  /** Daily location rollup: "Office" | "Remote" | "Mixed" | null */
  locationStatus: string | null;
}
