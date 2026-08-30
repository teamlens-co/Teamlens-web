"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Footprints,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  ShieldCheck,
  TimerReset,
} from "lucide-react";

import { useAuth } from "../../../contexts/AuthContext";
import RouteMap, {
  type MapMarker,
  type MapOffice,
} from "../../../components/RouteMap";

type GeofencePolicy = "off" | "warn" | "block";

type TrackingSettings = {
  geofencePolicy: GeofencePolicy;
  locationPingIntervalSeconds: number;
  trackLocationWhileClockedIn: boolean;
};

type LiveEmployeeLocation = {
  userId: string;
  fullName: string;
  email: string;
  sessionId: string;
  clockInAt: string;
  latitude?: number;
  longitude?: number;
  lastLocationAt?: string;
  staleSeconds?: number;
  distanceMeters: number;
  stepCount: number;
  locationType?: string;
  geofenceStatus?: string;
  batteryLevel?: number;
};

type TrackedSessionRow = {
  sessionId: string;
  userId: string;
  fullName: string;
  email: string;
  clockInAt: string;
  clockOutAt?: string;
  isActive: boolean;
  durationSeconds: number;
  distanceMeters: number;
  stepCount: number;
  pointCount: number;
  geofenceStatus?: string;
};

type TrackStop = {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  latitude: number;
  longitude: number;
  officeLabel?: string;
};

type SessionTrack = {
  sessionId: string;
  fullName: string;
  clockInAt: string;
  clockOutAt?: string;
  distanceMeters: number;
  stepCount: number;
  movingSeconds: number;
  stoppedSeconds: number;
  clockInLatitude?: number;
  clockInLongitude?: number;
  clockOutLatitude?: number;
  clockOutLongitude?: number;
  offices: MapOffice[];
  points: Array<{ capturedAt: string; latitude: number; longitude: number }>;
  stops: TrackStop[];
};

type ApiEnvelope<T> = { success: boolean; data?: T; message?: string };

const POLL_INTERVAL_MS = 30000;

/** A fix older than this is shown as stale rather than as a current position. */
const STALE_AFTER_SECONDS = 600;

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "0 m";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function FieldTrackingPage() {
  const { authHeaders, apiBase, user } = useAuth();

  const [view, setView] = useState<"live" | "history">("live");
  const [live, setLive] = useState<LiveEmployeeLocation[]>([]);
  const [sessions, setSessions] = useState<TrackedSessionRow[]>([]);
  const [settings, setSettings] = useState<TrackingSettings | null>(null);
  const [offices, setOffices] = useState<MapOffice[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [track, setTrack] = useState<SessionTrack | null>(null);
  const [startDate, setStartDate] = useState(isoDaysAgo(7));
  const [endDate, setEndDate] = useState(isoDaysAgo(0));
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState("");

  const isManager = user?.role === "MANAGER";

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T | null> => {
      const response = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: { ...authHeaders, ...(init?.headers ?? {}) },
        credentials: "include",
      });
      const payload = (await response.json()) as ApiEnvelope<T>;
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Request failed");
      }
      return payload.data ?? null;
    },
    [apiBase, authHeaders],
  );

  const loadLive = useCallback(async () => {
    try {
      const data = await request<LiveEmployeeLocation[]>("/api/web/tracking/live");
      setLive(data ?? []);
      setError("");
    } catch (err) {
      console.error("Failed to load live locations", err);
      setError("Unable to load live locations.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  const loadSessions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const data = await request<TrackedSessionRow[]>(
        `/api/web/tracking/sessions?${params.toString()}`,
      );
      setSessions(data ?? []);
    } catch (err) {
      console.error("Failed to load sessions", err);
    }
  }, [request, startDate, endDate]);

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await request<TrackingSettings>("/api/web/tracking/settings"));
      const locs = await request<MapOffice[]>("/api/web/office-locations");
      setOffices(locs ?? []);
    } catch (err) {
      console.error("Failed to load tracking settings", err);
    }
  }, [request]);

  useEffect(() => {
    void loadLive();
    void loadSettings();
  }, [loadLive, loadSettings]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Keep the live board fresh without a manual refresh.
  useEffect(() => {
    const timer = setInterval(() => {
      void loadLive();
      if (selectedSessionId) void loadSessions();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadLive, loadSessions, selectedSessionId]);

  // Load the selected route, and keep refreshing it while that shift is live.
  useEffect(() => {
    if (!selectedSessionId) {
      setTrack(null);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const data = await request<SessionTrack>(
          `/api/web/tracking/sessions/${selectedSessionId}`,
        );
        if (!cancelled) setTrack(data);
      } catch (err) {
        console.error("Failed to load session track", err);
        if (!cancelled) setTrack(null);
      }
    };

    void load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedSessionId, request]);

  const updateSettings = async (patch: Partial<TrackingSettings>) => {
    if (!settings || savingSettings) return;
    setSavingSettings(true);
    try {
      const updated = await request<TrackingSettings>("/api/web/tracking/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setSettings(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };

  const totals = useMemo(
    () => ({
      onShift: live.length,
      distance: live.reduce((sum, row) => sum + row.distanceMeters, 0),
      steps: live.reduce((sum, row) => sum + row.stepCount, 0),
      offSite: live.filter((row) => row.geofenceStatus === "outside").length,
    }),
    [live],
  );

  // On the live map every clocked-in person is a pin; selecting someone swaps
  // the map to their full route instead.
  const liveMarkers = useMemo<MapMarker[]>(
    () =>
      live
        .filter((row) => row.latitude !== undefined && row.longitude !== undefined)
        .map((row) => ({
          id: row.sessionId,
          label: row.fullName,
          latitude: row.latitude as number,
          longitude: row.longitude as number,
          detail: `${formatDistance(row.distanceMeters)} · ${row.stepCount.toLocaleString()} steps · since ${formatTime(row.clockInAt)}`,
          tone:
            (row.staleSeconds ?? 0) > STALE_AFTER_SECONDS
              ? ("stale" as const)
              : row.geofenceStatus === "outside"
                ? ("offsite" as const)
                : ("onsite" as const),
        })),
    [live],
  );

  const selected = track;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#171717]">Field tracking</h1>
          <p className="text-sm text-[#8C837B]">
            Where everyone clocked in, the route they took, and every stop along the way.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadLive();
            void loadSessions();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-[#DDD2C9] px-3 py-2 text-sm font-medium text-[#302C28] hover:bg-[#F8F5F1]"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg bg-[#FEF2F2] px-4 py-3 text-sm text-[#DC2626]">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={MapPin} label="On shift" value={String(totals.onShift)} />
        <StatCard icon={Route} label="Distance today" value={formatDistance(totals.distance)} />
        <StatCard icon={Footprints} label="Steps today" value={totals.steps.toLocaleString()} />
        <StatCard
          icon={ShieldCheck}
          label="Off-site clock-ins"
          value={String(totals.offSite)}
          tone={totals.offSite > 0 ? "warning" : "default"}
        />
      </section>

      {isManager && settings ? (
        <SettingsPanel settings={settings} saving={savingSettings} onChange={updateSettings} />
      ) : null}

      {/* The map is the point of this page, so it gets the full width. */}
      <section className="rounded-xl border border-[#DDD2C9] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#171717]">
            {selected
              ? `${selected.fullName} — ${formatDay(selected.clockInAt)}, ${formatTime(selected.clockInAt)}${
                  selected.clockOutAt ? ` to ${formatTime(selected.clockOutAt)}` : " (on shift)"
                }`
              : "Everyone currently on shift"}
          </h2>
          {selected ? (
            <button
              type="button"
              onClick={() => setSelectedSessionId(null)}
              className="rounded-lg border border-[#DDD2C9] px-3 py-1.5 text-xs font-medium text-[#302C28] hover:bg-[#F8F5F1]"
            >
              Back to live map
            </button>
          ) : null}
        </div>

        <RouteMap
          height={440}
          offices={selected ? selected.offices : offices}
          points={selected ? selected.points : []}
          stops={selected ? selected.stops : []}
          markers={selected ? [] : liveMarkers}
          clockIn={
            selected?.clockInLatitude !== undefined && selected?.clockInLongitude !== undefined
              ? { latitude: selected.clockInLatitude, longitude: selected.clockInLongitude }
              : null
          }
          clockOut={
            selected?.clockOutLatitude !== undefined && selected?.clockOutLongitude !== undefined
              ? { latitude: selected.clockOutLatitude, longitude: selected.clockOutLongitude }
              : null
          }
        />

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#8C837B]">
          <Legend color="#059669" label="Clocked in" />
          <Legend color="#dc2626" label="Clocked out / latest" />
          <Legend color="#f59e0b" label="Stop" />
          <Legend color="#2563eb" label="Route & geofence" />
          <span className="ml-auto">Click the map to enable scroll zoom.</span>
        </div>

        {selected ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Distance" value={formatDistance(selected.distanceMeters)} />
            <MiniStat label="Steps" value={selected.stepCount.toLocaleString()} />
            <MiniStat label="Moving" value={formatDuration(selected.movingSeconds)} />
            <MiniStat label="Stopped" value={formatDuration(selected.stoppedSeconds)} />
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-[#DDD2C9] bg-white">
          <div className="flex items-center gap-2 border-b border-[#EFE8E2] px-4 py-3">
            <TabButton active={view === "live"} onClick={() => setView("live")}>
              On shift now ({live.length})
            </TabButton>
            <TabButton active={view === "history"} onClick={() => setView("history")}>
              Shift history
            </TabButton>
          </div>

          {view === "history" ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-[#EFE8E2] px-4 py-2 text-xs text-[#8C837B]">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-[#DDD2C9] px-2 py-1"
              />
              <span>to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-[#DDD2C9] px-2 py-1"
              />
            </div>
          ) : null}

          {view === "live" ? (
            loading ? (
              <p className="px-4 py-8 text-center text-sm text-[#8C837B]">Loading…</p>
            ) : live.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[#8C837B]">
                Nobody is clocked in right now.
              </p>
            ) : (
              <ul className="divide-y divide-[#EFE8E2]">
                {live.map((row) => (
                  <li key={row.sessionId}>
                    <RowButton
                      selected={selectedSessionId === row.sessionId}
                      onClick={() => setSelectedSessionId(row.sessionId)}
                      title={row.fullName}
                      subtitle={`Since ${formatTime(row.clockInAt)} · ${formatDistance(row.distanceMeters)} · ${row.stepCount.toLocaleString()} steps`}
                      pill={<StatusPill row={row} />}
                    />
                  </li>
                ))}
              </ul>
            )
          ) : sessions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#8C837B]">
              No shifts in this range.
            </p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-[#EFE8E2] overflow-y-auto">
              {sessions.map((row) => (
                <li key={row.sessionId}>
                  <RowButton
                    selected={selectedSessionId === row.sessionId}
                    onClick={() => setSelectedSessionId(row.sessionId)}
                    title={row.fullName}
                    subtitle={`${formatDay(row.clockInAt)} · ${formatTime(row.clockInAt)}${
                      row.clockOutAt ? `–${formatTime(row.clockOutAt)}` : ""
                    } · ${formatDistance(row.distanceMeters)} · ${row.pointCount} points`}
                    pill={
                      row.isActive ? (
                        <Pill tone="success">On shift</Pill>
                      ) : (
                        <Pill tone="muted">{formatDuration(row.durationSeconds)}</Pill>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[#DDD2C9] bg-white">
          <h2 className="border-b border-[#EFE8E2] px-4 py-3 text-sm font-semibold text-[#171717]">
            {selected ? "Stops on this shift" : "Select a shift to see its stops"}
          </h2>

          {selected ? (
            selected.stops.length > 0 ? (
              <ul className="divide-y divide-[#EFE8E2]">
                {selected.stops.map((stop) => (
                  <li
                    key={stop.startedAt}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#302C28]">
                        {stop.officeLabel ?? "Unnamed location"}
                      </p>
                      <p className="text-xs text-[#8C837B]">
                        {formatTime(stop.startedAt)} – {formatTime(stop.endedAt)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-brand">
                      {formatDuration(stop.durationSeconds)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-[#8C837B]">
                <TimerReset className="mx-auto mb-2 h-5 w-5" />
                No stops of five minutes or more on this shift
                {selected.points.length === 0
                  ? " — no location was recorded, so there is nothing to analyse."
                  : "."}
              </div>
            )
          ) : (
            <p className="px-4 py-12 text-center text-sm text-[#8C837B]">
              Pick someone on the left to replay their route and stops.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-brand text-white" : "text-[#70675F] hover:bg-[#F8F5F1]"
      }`}
    >
      {children}
    </button>
  );
}

function RowButton({
  selected,
  onClick,
  title,
  subtitle,
  pill,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  pill: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#FCFAF8] ${
        selected ? "bg-[#FCE8E1]" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#171717]">{title}</p>
        <p className="truncate text-xs text-[#8C837B]">{subtitle}</p>
      </div>
      {pill}
    </button>
  );
}

function StatusPill({ row }: { row: LiveEmployeeLocation }) {
  const stale = (row.staleSeconds ?? Infinity) > STALE_AFTER_SECONDS;

  if (row.latitude === undefined || row.longitude === undefined) {
    return <Pill tone="muted">No location</Pill>;
  }
  if (stale) return <Pill tone="muted">Stale</Pill>;
  if (row.geofenceStatus === "outside") return <Pill tone="warning">Off-site</Pill>;
  return <Pill tone="success">On-site</Pill>;
}

function Pill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "muted";
  children: React.ReactNode;
}) {
  const tones = {
    success: "bg-[#ECFDF5] text-[#00A86B]",
    warning: "bg-[#FFFBEB] text-[#C47A00]",
    muted: "bg-[#F1ECE7] text-[#70675F]",
  } as const;

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-xl border border-[#DDD2C9] bg-white p-4">
      <div className="flex items-center gap-2 text-[#8C837B]">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={`mt-2 text-2xl font-semibold ${
          tone === "warning" ? "text-[#C47A00]" : "text-[#171717]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#F8F5F1] px-3 py-2">
      <p className="text-xs text-[#8C837B]">{label}</p>
      <p className="text-sm font-semibold text-[#171717]">{value}</p>
    </div>
  );
}

function SettingsPanel({
  settings,
  saving,
  onChange,
}: {
  settings: TrackingSettings;
  saving: boolean;
  onChange: (patch: Partial<TrackingSettings>) => void;
}) {
  const policies: Array<{ value: GeofencePolicy; label: string; hint: string }> = [
    { value: "off", label: "Off", hint: "Record location, never restrict" },
    { value: "warn", label: "Warn", hint: "Allow, but flag off-site shifts" },
    { value: "block", label: "Block", hint: "Refuse clock-in away from an office" },
  ];

  return (
    <section className="rounded-xl border border-[#DDD2C9] bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#171717]">
        <Navigation className="h-4 w-4" />
        Tracking policy
      </h2>

      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#8C837B]">
            Geofenced clock-in
          </p>
          <div className="flex gap-2">
            {policies.map((policy) => (
              <button
                key={policy.value}
                type="button"
                title={policy.hint}
                disabled={saving}
                onClick={() => onChange({ geofencePolicy: policy.value })}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                  settings.geofencePolicy === policy.value
                    ? "bg-brand text-white"
                    : "bg-[#F1ECE7] text-[#302C28] hover:bg-[#E8E1DA]"
                }`}
              >
                {policy.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[#302C28]">
          <input
            type="checkbox"
            checked={settings.trackLocationWhileClockedIn}
            disabled={saving}
            onChange={(event) => onChange({ trackLocationWhileClockedIn: event.target.checked })}
            className="h-4 w-4 rounded border-[#DDD2C9]"
          />
          Track route while clocked in
        </label>

        <label className="flex items-center gap-2 text-sm text-[#302C28]">
          Ping every
          <select
            value={settings.locationPingIntervalSeconds}
            disabled={saving}
            onChange={(event) =>
              onChange({ locationPingIntervalSeconds: Number(event.target.value) })
            }
            className="rounded-lg border border-[#DDD2C9] bg-white px-2 py-1 text-sm"
          >
            <option value={60}>1 minute</option>
            <option value={120}>2 minutes</option>
            <option value={300}>5 minutes</option>
            <option value={600}>10 minutes</option>
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs text-[#8C837B]">
        Shorter intervals give a more detailed route at the cost of battery life on the
        employee&apos;s phone.
      </p>
    </section>
  );
}
