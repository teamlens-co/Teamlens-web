"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Clock, Keyboard, MousePointer2, Pause, Play, RefreshCw, Users, Video } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import DashboardDateFilter from "../../../components/DashboardDateFilter";
import TimeRangeSlider from "../../../components/TimeRangeSlider";

type RangePreset = "24h" | "12h" | "10h" | "custom";

const PROJECTOR_REFRESH_MS = 30_000;

const getInitialProjectorMode = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("view") === "projector" || params.get("mode") === "projector";
};

const presetWindows: Partial<Record<RangePreset, { startHour: number; endHour: number }>> = {
  "12h": { startHour: 8, endHour: 20 },
  "10h": { startHour: 10, endHour: 18 },
};

const formatHourLabel = (hour: number) => {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
};

type TimelineSegment = {
  start: string;
  end: string;
  kind: "active" | "idle";
  mouseMoves: number;
  keyPresses: number;
};

type ActivityEmployee = {
  userId: string;
  employeeName: string;
  email: string;
  activeSeconds: number;
  idleSeconds: number;
  workSeconds: number;
  utilizationPercent: number;
  mouseMoves: number;
  keyPresses: number;
  mousePercent: number;
  keyboardPercent: number;
  firstActiveAt: string | null;
  lastActiveAt: string | null;
  topApps: Array<{ name: string; seconds: number }>;
  segments: TimelineSegment[];
};

type TimelineResponse = {
  success: boolean;
  data: {
    start: string;
    end: string;
    employees: ActivityEmployee[];
  };
  message?: string;
};

type HoverState = {
  employee: ActivityEmployee;
  segment: TimelineSegment;
  x: number;
  y: number;
  sticky?: boolean;
};

const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(total / 3600).toString().padStart(2, "0");
  const mins = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const secs = (total % 60).toString().padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
};

const formatCompactDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) return `${hrs}h ${mins.toString().padStart(2, "0")}m`;
  if (mins > 0) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  return `${secs}s`;
};

const formatLastUpdated = (date: Date | null): string => {
  if (!date) return "Not updated yet";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const formatClock = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

const segmentStyle = (segment: TimelineSegment, startMs: number, endMs: number) => {
  const range = Math.max(1, endMs - startMs);
  const left = ((new Date(segment.start).getTime() - startMs) / range) * 100;
  const width = ((new Date(segment.end).getTime() - new Date(segment.start).getTime()) / range) * 100;
  return {
    left: `${Math.max(0, Math.min(100, left))}%`,
    width: `${Math.max(0.5, Math.min(100, width))}%`,
  };
};

const formatEmptyDate = (date: Date) => date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

type HourActivityStat = {
  hour: number;
  label: string;
  activeSeconds: number;
  idleSeconds: number;
  mouseMoves: number;
  keyPresses: number;
};

const buildHourlyStats = (employees: ActivityEmployee[], rangeStart: Date): HourActivityStat[] => {
  const stats = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHourLabel(hour),
    activeSeconds: 0,
    idleSeconds: 0,
    mouseMoves: 0,
    keyPresses: 0,
  }));

  employees.forEach((employee) => {
    let hadSegmentData = false;

    employee.segments.forEach((segment) => {
      const start = new Date(segment.start).getTime();
      const end = new Date(segment.end).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      hadSegmentData = true;

      for (let hour = 0; hour < 24; hour += 1) {
        const hourStartMs = rangeStart.getTime() + hour * 60 * 60 * 1000;
        const hourEndMs = hourStartMs + 60 * 60 * 1000;
        const overlapMs = Math.max(0, Math.min(end, hourEndMs) - Math.max(start, hourStartMs));
        if (overlapMs <= 0) continue;

        const segmentMs = Math.max(1, end - start);
        const ratio = overlapMs / segmentMs;
        if (segment.kind === "active") {
          stats[hour].activeSeconds += overlapMs / 1000;
        } else {
          stats[hour].idleSeconds += overlapMs / 1000;
        }
        stats[hour].mouseMoves += Math.round(segment.mouseMoves * ratio);
        stats[hour].keyPresses += Math.round(segment.keyPresses * ratio);
      }
    });

    if (!hadSegmentData && (employee.activeSeconds > 0 || employee.idleSeconds > 0 || employee.mouseMoves > 0 || employee.keyPresses > 0)) {
      const first = employee.firstActiveAt ? new Date(employee.firstActiveAt).getTime() : rangeStart.getTime();
      const last = employee.lastActiveAt ? new Date(employee.lastActiveAt).getTime() : first;
      const dayStartMs = rangeStart.getTime();
      const safeFirstMs = Number.isFinite(first) ? first : dayStartMs;
      const safeLastMs = Number.isFinite(last) && last >= safeFirstMs ? last : safeFirstMs;

      const firstHour = Math.max(0, Math.min(23, Math.floor((safeFirstMs - dayStartMs) / (60 * 60 * 1000))));
      const lastHour = Math.max(firstHour, Math.min(23, Math.floor((safeLastMs - dayStartMs) / (60 * 60 * 1000))));
      const coveredHours = Math.max(1, lastHour - firstHour + 1);

      const activePerHour = employee.activeSeconds / coveredHours;
      const idlePerHour = employee.idleSeconds / coveredHours;
      const mousePerHour = Math.floor(employee.mouseMoves / coveredHours);
      const keysPerHour = Math.floor(employee.keyPresses / coveredHours);

      for (let hour = firstHour; hour <= lastHour; hour += 1) {
        stats[hour].activeSeconds += activePerHour;
        stats[hour].idleSeconds += idlePerHour;
        stats[hour].mouseMoves += mousePerHour;
        stats[hour].keyPresses += keysPerHour;
      }
    }
  });

  return stats;
};

const buildProjectorSeedEmployees = (rangeStart: Date): ActivityEmployee[] => {
  const names = [
    ["Aarav Sharma", "aarav@teamlens.demo", 8, 52],
    ["Meera Kapoor", "meera@teamlens.demo", 9, 34],
    ["Rohan Mehta", "rohan@teamlens.demo", 10, 18],
    ["Nisha Verma", "nisha@teamlens.demo", 11, 46],
  ] as const;

  return names.map(([employeeName, email, startHour, offsetMinutes], index) => {
    const activeOneStart = new Date(rangeStart);
    activeOneStart.setHours(startHour, offsetMinutes, 0, 0);
    const activeOneEnd = new Date(activeOneStart);
    activeOneEnd.setMinutes(activeOneEnd.getMinutes() + 72 + index * 8);
    const idleStart = new Date(activeOneEnd);
    const idleEnd = new Date(idleStart);
    idleEnd.setMinutes(idleEnd.getMinutes() + 18 + index * 4);
    const activeTwoStart = new Date(idleEnd);
    const activeTwoEnd = new Date(activeTwoStart);
    activeTwoEnd.setMinutes(activeTwoEnd.getMinutes() + 86 - index * 6);

    const segments: TimelineSegment[] = [
      {
        start: activeOneStart.toISOString(),
        end: activeOneEnd.toISOString(),
        kind: "active",
        mouseMoves: 480 + index * 120,
        keyPresses: 220 + index * 90,
      },
      {
        start: idleStart.toISOString(),
        end: idleEnd.toISOString(),
        kind: "idle",
        mouseMoves: 0,
        keyPresses: 0,
      },
      {
        start: activeTwoStart.toISOString(),
        end: activeTwoEnd.toISOString(),
        kind: "active",
        mouseMoves: 620 + index * 80,
        keyPresses: 340 + index * 65,
      },
    ];

    const activeSeconds = segments
      .filter((segment) => segment.kind === "active")
      .reduce((sum, segment) => sum + (new Date(segment.end).getTime() - new Date(segment.start).getTime()) / 1000, 0);
    const idleSeconds = segments
      .filter((segment) => segment.kind === "idle")
      .reduce((sum, segment) => sum + (new Date(segment.end).getTime() - new Date(segment.start).getTime()) / 1000, 0);
    const workSeconds = activeSeconds + idleSeconds;
    const mouseMoves = segments.reduce((sum, segment) => sum + segment.mouseMoves, 0);
    const keyPresses = segments.reduce((sum, segment) => sum + segment.keyPresses, 0);

    return {
      userId: `seed-${index + 1}`,
      employeeName,
      email,
      activeSeconds,
      idleSeconds,
      workSeconds,
      utilizationPercent: workSeconds > 0 ? clampPercent((activeSeconds / workSeconds) * 100) : 0,
      mouseMoves,
      keyPresses,
      mousePercent: mouseMoves + keyPresses > 0 ? clampPercent((mouseMoves / (mouseMoves + keyPresses)) * 100) : 0,
      keyboardPercent: mouseMoves + keyPresses > 0 ? clampPercent((keyPresses / (mouseMoves + keyPresses)) * 100) : 0,
      firstActiveAt: segments[0].start,
      lastActiveAt: segments[segments.length - 1].end,
      topApps: [
        { name: "Chrome", seconds: Math.round(activeSeconds * 0.42) },
        { name: "VS Code", seconds: Math.round(activeSeconds * 0.28) },
        { name: "Slack", seconds: Math.round(activeSeconds * 0.16) },
      ],
      segments,
    };
  });
};

function ActivityHoverCard({ hover }: { hover: HoverState }) {
  const { employee, segment, x, y } = hover;
  const cardRef = useRef<HTMLDivElement>(null);
  const cardWidth = 320;
  const shouldOpenAbove = y > 380;
  const durationSeconds = Math.round((new Date(segment.end).getTime() - new Date(segment.start).getTime()) / 1000);
  const segmentEngagement = segment.mouseMoves + segment.keyPresses;
  const segmentEngagementPercent = segment.kind === "active" ? 100 : 0;
  const mousePercent = segmentEngagement > 0 ? Math.round((segment.mouseMoves / segmentEngagement) * 100) : 0;
  const keyboardPercent = segmentEngagement > 0 ? Math.round((segment.keyPresses / segmentEngagement) * 100) : 0;
  const initials = employee.employeeName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="fixed z-[100] w-[320px] border border-[#E7E0DA] bg-white p-4 text-[#312D29] shadow-[0_12px_38px_rgba(39,34,30,0.18)]"
      style={{
        left: Math.max(12, Math.min(x - cardWidth / 2, window.innerWidth - cardWidth - 12)),
        top: shouldOpenAbove ? y - 14 : y + 18,
        transform: shouldOpenAbove ? "translateY(-100%)" : "none",
      }}
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-sm font-medium text-brand">{initials}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{employee.employeeName}</p>
          <p className="truncate text-xs font-medium text-[#9A9088]">{employee.email}</p>
        </div>
      </div>

      <div className="border border-[#EFE8E2] p-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-[#70675F]">
            <span
              className={`h-3 w-3 ${
                segment.kind === "active"
                  ? "bg-brand"
                  : "border border-[#D9CEC6] bg-white [background-image:linear-gradient(135deg,transparent_45%,#D9CEC6_45%,#D9CEC6_55%,transparent_55%)]"
              }`}
            />
            {segment.kind === "active" ? "Active Time" : "Idle Time"}
          </span>
          <span className="text-xs font-medium text-[#9A9088]">{formatClock(segment.start)} → {formatClock(segment.end)}</span>
        </div>
        <p className="mt-2 text-2xl font-medium leading-none text-[#302C28]">{formatDuration(durationSeconds)} <span className="text-sm">h</span></p>
      </div>

      <div className="mt-3 border border-[#EFE8E2]">
        <div className="flex items-center justify-between border-b border-[#EFE8E2] px-3 py-2">
          <span className="text-sm font-medium text-[#70675F]">Engagement Level</span>
          <span className="text-xl font-medium text-[#171717]">{segmentEngagementPercent}%</span>
        </div>
        <div className="space-y-3 px-3 py-3">
          <div className="grid grid-cols-[78px_1fr_40px] items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-[#8C837B]">
              <MousePointer2 className="h-4 w-4" />
              Mouse
            </span>
            <span className="h-1.5 rounded-full bg-brand/15">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${mousePercent}%` }} />
            </span>
            <span className="text-right text-xs font-medium text-[#9A9088]">{mousePercent}%</span>
          </div>
          <div className="grid grid-cols-[78px_1fr_40px] items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-[#8C837B]">
              <Keyboard className="h-4 w-4" />
              Keys
            </span>
            <span className="h-1.5 rounded-full bg-brand/15">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${keyboardPercent}%` }} />
            </span>
            <span className="text-right text-xs font-medium text-[#9A9088]">{keyboardPercent}%</span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-2 text-sm font-medium">Top 3 most used apps</p>
        <div className="space-y-2">
          {employee.topApps.length === 0 ? (
            <p className="bg-[#F8F5F1] px-3 py-2 text-xs font-medium text-[#9A9088]">No app usage in this range.</p>
          ) : (
            employee.topApps.slice(0, 3).map((app) => (
              <div key={app.name} className="flex items-center justify-between gap-3 bg-[#F8F5F1] px-3 py-2">
                <span className="truncate text-xs font-medium text-[#4A423C]">{app.name}</span>
                <span className="text-xs font-medium text-[#9A9088]">{formatCompactDuration(app.seconds)}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          const d = segment.start.slice(0, 10);
          window.location.href = `/dashboard/recordings?employeeId=${employee.userId}&date=${d}&startTime=${segment.start}&endTime=${segment.end}`;
        }}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-brand-dark"
      >
        <Video className="h-3.5 w-3.5" />
        Watch This Segment
      </button>
    </div>
  );
}

export default function ActivitiesPage() {
  const { authHeaders, apiBase, dateRange } = useAuth();
  const [employees, setEmployees] = useState<ActivityEmployee[]>([]);
  const [rangePreset, setRangePreset] = useState<RangePreset>("24h");
  const [customStartHour, setCustomStartHour] = useState(0);
  const [customEndHour, setCustomEndHour] = useState(24);
  const [projectorMode, setProjectorMode] = useState(() => getInitialProjectorMode());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Dynamic width calculation based on zoom level
  const containerWidth = useMemo(() => {
    let zoomFactor = 1; // 24h
    if (rangePreset === "12h") zoomFactor = 2;
    if (rangePreset === "10h") zoomFactor = 3;
    if (rangePreset === "custom") {
      const diff = Math.max(1, customEndHour - customStartHour);
      zoomFactor = 24 / diff;
    }
    return `${zoomFactor * 100}%`;
  }, [rangePreset, customStartHour, customEndHour]);

  // Use a fixed 24h range for the API fetch
  const effectiveRange = useMemo(() => {
    const start = new Date(dateRange.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.startDate);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [dateRange.startDate]);

  const fetchTimeline = useCallback(async (silent = false) => {
    if (!authHeaders) return;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const params = new URLSearchParams({
        startDate: effectiveRange.start.toISOString(),
        endDate: effectiveRange.end.toISOString(),
      });
      const response = await fetch(`${apiBase}/api/web/dashboard/activity-timeline?${params.toString()}`, {
        headers: authHeaders,
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json()) as TimelineResponse;
      if (!response.ok || !payload.success) {
        setEmployees([]);
        setError(payload.message || "Unable to load activity timeline.");
        return;
      }

      setEmployees(payload.data?.employees || []);
      setLastUpdatedAt(new Date());
    } catch (requestError) {
      console.error("Failed to load activity timeline", requestError);
      if (!silent) setEmployees([]);
      setError("Unable to load activity timeline.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiBase, authHeaders, effectiveRange]);

  useEffect(() => {
    void fetchTimeline();
  }, [fetchTimeline]);

  useEffect(() => {
    if (!projectorMode || !autoRefresh || !authHeaders) return;

    const timer = window.setInterval(() => {
      void fetchTimeline(true);
    }, PROJECTOR_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [authHeaders, autoRefresh, fetchTimeline, projectorMode]);

  // Handle auto-scrolling when the visible timeline window changes.
  useEffect(() => {
    if (loading || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const totalWidth = container.scrollWidth;
    const hourWidth = totalWidth / 24;
    const targetHour = rangePreset === "custom" ? customStartHour : presetWindows[rangePreset]?.startHour ?? 0;

    container.scrollLeft = targetHour * hourWidth;
  }, [loading, customStartHour, rangePreset, containerWidth]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => setIsDragging(false);

  const startMs = effectiveRange.start.getTime();
  const endMs = effectiveRange.end.getTime();
  const seedEmployees = useMemo(() => buildProjectorSeedEmployees(effectiveRange.start), [effectiveRange.start]);
  const hasRealActivityData = (employees || []).some(
    (employee) =>
      employee.segments.length > 0 ||
      employee.activeSeconds > 0 ||
      employee.idleSeconds > 0 ||
      employee.mouseMoves > 0 ||
      employee.keyPresses > 0,
  );
  const displayEmployees = projectorMode && !hasRealActivityData ? seedEmployees : (employees || []);
  const usingProjectorSeedData = projectorMode && !hasRealActivityData;

  const projectorStats = useMemo(() => {
    const totalEmployees = displayEmployees.length;
    const activeEmployees = displayEmployees.filter((employee) => {
      if (!employee.lastActiveAt) return false;
      return Date.now() - new Date(employee.lastActiveAt).getTime() <= 10 * 60 * 1000;
    }).length;
    const activeSeconds = displayEmployees.reduce((sum, employee) => sum + employee.activeSeconds, 0);
    const idleSeconds = displayEmployees.reduce((sum, employee) => sum + employee.idleSeconds, 0);
    const workSeconds = displayEmployees.reduce((sum, employee) => sum + employee.workSeconds, 0);
    const mouseMoves = displayEmployees.reduce((sum, employee) => sum + employee.mouseMoves, 0);
    const keyPresses = displayEmployees.reduce((sum, employee) => sum + employee.keyPresses, 0);
    const utilization = workSeconds > 0 ? clampPercent((activeSeconds / workSeconds) * 100) : 0;

    return {
      totalEmployees,
      activeEmployees,
      activeSeconds,
      idleSeconds,
      workSeconds,
      mouseMoves,
      keyPresses,
      utilization,
    };
  }, [displayEmployees]);

  const hourlyStats = useMemo(() => buildHourlyStats(displayEmployees, effectiveRange.start), [displayEmployees, effectiveRange.start]);
  const maxHourlyWork = Math.max(1, ...hourlyStats.map((stat) => stat.activeSeconds + stat.idleSeconds));
  const maxHourlyInput = Math.max(1, ...hourlyStats.map((stat) => stat.mouseMoves + stat.keyPresses));
  const topEmployees = useMemo(
    () => [...displayEmployees].sort((a, b) => b.activeSeconds - a.activeSeconds).slice(0, 6),
    [displayEmployees],
  );

  const setProjectorView = (enabled: boolean) => {
    setProjectorMode(enabled);
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (enabled) {
      url.searchParams.set("view", "projector");
    } else {
      url.searchParams.delete("view");
      url.searchParams.delete("mode");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const hourMarkers = useMemo(() => {
    const markers: { date: Date; label: string; hour: number }[] = [];
    const step = 1;

    for (let i = 0; i <= 24; i += step) {
      const d = new Date(effectiveRange.start);
      d.setHours(i, 0, 0, 0);
      const label = i === 0 ? "12 AM" : i === 12 ? "12 PM" : i > 12 ? `${i - 12} PM` : `${i} AM`;
      markers.push({ date: d, label, hour: i });
    }
    return markers;
  }, [effectiveRange.start]);

  const gridLines = useMemo(() => {
    const lines: number[] = [];
    for (let i = 0; i <= 24; i++) lines.push(i);
    return lines;
  }, []);

  return (
    <div className={`mx-auto max-w-none space-y-5 ${projectorMode ? "min-h-screen bg-background p-3 sm:p-5" : ""}`}>
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className={`${projectorMode ? "text-[26px]" : "text-[18px]"} font-semibold leading-tight text-foreground`}>Activities</h1>
            <p className={`${projectorMode ? "text-[15px]" : "text-[13px]"} mt-1 text-muted-foreground`}>
              {projectorMode ? "Projector-ready live activity overview" : "Timeline view of all employee activities"}
            </p>
          </div>
          <div className={`sm:ml-2 ${projectorMode ? "hidden lg:block" : ""}`}>
            <DashboardDateFilter />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setProjectorView(false)}
              className={`rounded-md px-3 py-2 text-[12px] font-semibold transition ${
                !projectorMode ? "bg-brand text-white" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setProjectorView(true)}
              className={`rounded-md px-3 py-2 text-[12px] font-semibold transition ${
                projectorMode ? "bg-brand text-white" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Projector
            </button>
          </div>

          {projectorMode ? (
            <>
              <button
                type="button"
                onClick={() => setAutoRefresh((value) => !value)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-semibold text-foreground shadow-sm transition hover:bg-muted"
              >
                {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {autoRefresh ? "Pause Live" : "Resume Live"}
              </button>
              <button
                type="button"
                onClick={() => void fetchTimeline(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-semibold text-foreground shadow-sm transition hover:bg-muted"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </>
          ) : null}
        </div>
      </header>

      {projectorMode ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 text-foreground shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <span className={`h-2.5 w-2.5 rounded-full ${autoRefresh ? "bg-success" : "bg-warning"}`} />
                {autoRefresh ? "Live board active" : "Live board paused"}
              </span>
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Last updated {formatLastUpdated(lastUpdatedAt)}
              </span>
              <span className="rounded-full bg-brand-light px-3 py-1 text-[11px] font-bold text-brand-dark">
                {usingProjectorSeedData ? "Demo data preview" : "Backend data"}
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Employees", value: projectorStats.totalEmployees.toString(), detail: `${projectorStats.activeEmployees} active recently`, icon: Users },
              { label: "Active Time", value: formatCompactDuration(projectorStats.activeSeconds), detail: `${projectorStats.utilization}% utilization`, icon: Activity },
              { label: "Idle Time", value: formatCompactDuration(projectorStats.idleSeconds), detail: `${formatCompactDuration(projectorStats.workSeconds)} tracked`, icon: Clock },
              { label: "Mouse / Keys", value: `${projectorStats.mouseMoves.toLocaleString()} / ${projectorStats.keyPresses.toLocaleString()}`, detail: "input signals today", icon: MousePointer2 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <Icon className="h-5 w-5 text-brand" />
                  </div>
                  <p className="mt-3 text-[26px] font-semibold leading-none text-foreground">{item.value}</p>
                  <p className="mt-2 text-[13px] font-medium text-muted-foreground">{item.detail}</p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-foreground">Hourly Activity Shape</h2>
                  <p className="text-[12px] font-medium text-muted-foreground">Active and idle time distribution across the day</p>
                </div>
                <span className="rounded-full bg-brand-light px-3 py-1 text-[11px] font-bold text-brand-dark">Today</span>
              </div>
              <div className="flex h-[240px] items-end gap-1.5">
                {hourlyStats.every((stat) => stat.activeSeconds + stat.idleSeconds === 0) ? (
                  <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted text-center">
                    <p className="text-[13px] font-semibold text-muted-foreground">No activity data for this day.</p>
                  </div>
                ) : (
                  hourlyStats.map((stat) => {
                    const activeHeight = Math.max(2, (stat.activeSeconds / maxHourlyWork) * 100);
                    const idleHeight = Math.max(0, (stat.idleSeconds / maxHourlyWork) * 100);
                    const hasData = stat.activeSeconds + stat.idleSeconds > 0;
                    return (
                      <div key={stat.hour} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                        <div className="flex h-[190px] w-full max-w-[28px] items-end overflow-hidden rounded-t-md bg-muted">
                          <div className="flex w-full flex-col justify-end">
                            <span className="block w-full bg-border" style={{ height: `${idleHeight}%` }} />
                            <span className="block w-full bg-brand" style={{ height: `${hasData ? activeHeight : 0}%` }} />
                          </div>
                        </div>
                        <span className="hidden text-[10px] font-semibold text-muted-foreground sm:block">{stat.hour % 3 === 0 ? stat.label : ""}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-4">
                <h2 className="text-[15px] font-semibold text-foreground">Input Activity</h2>
                <p className="text-[12px] font-medium text-muted-foreground">Mouse and keyboard movement by hour</p>
              </div>
              <div className="space-y-3">
                {hourlyStats.filter((stat) => stat.mouseMoves + stat.keyPresses > 0).slice(-8).map((stat) => {
                  const total = stat.mouseMoves + stat.keyPresses;
                  const mouseWidth = clampPercent((stat.mouseMoves / Math.max(1, total)) * 100);
                  const totalWidth = clampPercent((total / maxHourlyInput) * 100);
                  return (
                    <div key={stat.hour} className="grid grid-cols-[54px_1fr_64px] items-center gap-3">
                      <span className="text-[11px] font-bold text-muted-foreground">{stat.label}</span>
                      <span className="block h-3 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(10, totalWidth)}%` }}>
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${mouseWidth}%` }} />
                      </span>
                      <span className="text-right text-[11px] font-semibold text-muted-foreground">{total.toLocaleString()}</span>
                    </div>
                  );
                })}
                {hourlyStats.every((stat) => stat.mouseMoves + stat.keyPresses === 0) ? (
                  <p className="rounded-lg bg-muted px-3 py-8 text-center text-[12px] font-semibold text-muted-foreground">No input activity yet.</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">Most Active Employees</h2>
                <p className="text-[12px] font-medium text-muted-foreground">Ranked by active time in the selected day</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {topEmployees.map((employee) => (
                <div key={employee.userId} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-foreground">{employee.employeeName}</p>
                      <p className="truncate text-[11px] font-medium text-muted-foreground">{employee.email}</p>
                    </div>
                    <span className="rounded-full bg-brand-light px-2.5 py-1 text-[11px] font-bold text-brand-dark">{employee.utilizationPercent}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${clampPercent(employee.utilizationPercent)}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                    <span>{formatCompactDuration(employee.activeSeconds)} active</span>
                    <span>{formatCompactDuration(employee.idleSeconds)} idle</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[#70675F]">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 bg-brand" /> Active Time
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 border border-[#E1D7CE] bg-white [background-image:repeating-linear-gradient(135deg,transparent,transparent_2px,#E1D7CE_2px,#E1D7CE_4px)]" /> Idle Time
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 bg-[#EEEAE6]" /> Break
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 bg-[#D3CBC5]" /> Manual
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-4 text-[12px] text-[#70675F]">
            <div className="flex flex-wrap items-center gap-3">
              {[
                ["24h", "24h"],
                ["12h", "12h"],
                ["10h", "10h"],
                ["custom", "Custom"],
              ].map(([preset, label]) => (
                <button
                  key={preset}
                  onClick={() => setRangePreset(preset as RangePreset)}
                  className={`rounded-md px-3.5 py-1.5 text-[12px] font-medium transition ${
                    rangePreset === preset ? "bg-brand text-white" : "bg-[#EEEAE6] text-[#7E6F65] hover:bg-[#E6DED7]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {rangePreset === "custom" && (
              <div className="w-64 ml-4">
                <TimeRangeSlider 
                  startHour={customStartHour}
                  endHour={customEndHour}
                  onChange={(start, end) => {
                    setCustomStartHour(start);
                    setCustomEndHour(end);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-sm">
          <div 
            ref={scrollContainerRef}
            className={`overflow-x-auto scroll-smooth custom-scrollbar ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div style={{ width: containerWidth, minWidth: "100%" }}>
              {/* Timeline Header */}
              <div className="grid grid-cols-[200px_1fr] border-b border-[#DDD2C9] bg-[#F8F5F1]">
                <div className="sticky left-0 z-20 bg-[#F8F5F1] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-[#7E6F65] border-r border-[#DDD2C9]">Employee</div>
                <div className="relative h-10">
                  {hourMarkers.map((marker) => {
                    const left = (marker.hour / 24) * 100;
                    return (
                      <span
                        key={marker.date.toISOString()}
                        className="absolute -translate-x-1/2 pt-3 text-[10px] font-bold text-[#9A9088]"
                        style={{ left: `${left}%` }}
                      >
                        {marker.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Timeline Body */}
              {loading ? (
                <div className="px-5 py-20 text-center text-[13px] font-medium uppercase tracking-widest text-[#B4AAA2]">Loading Timeline...</div>
              ) : error && !projectorMode ? (
                <div className="px-5 py-20 text-center text-[13px] text-red-500">{error}</div>
              ) : displayEmployees.length === 0 ? (
                <div className="px-5 py-20 text-center text-[13px] text-[#7E6F65]">
                  No activity data for {formatEmptyDate(dateRange.startDate)}
                </div>
              ) : (
                <div className="divide-y divide-[#F0EAE5]">
                  {displayEmployees.map((employee) => (
                    <div key={employee.userId} className="grid grid-cols-[200px_1fr] hover:bg-[#FCFAF8] transition-colors">
                      <div className="sticky left-0 z-10 flex h-[52px] items-center bg-white px-5 border-r border-[#DDD2C9]">
                        <p className="truncate text-[13px] font-semibold text-[#3F3833]">{employee.employeeName}</p>
                      </div>
                      <div className="relative h-[52px]">
                        {/* Hour Grid Lines */}
                        <div className="absolute inset-0">
                          {gridLines.map((i) => (
                            <div 
                              key={i} 
                              className={`absolute top-0 h-full border-l ${i % 2 === 0 ? "border-[#EEEAE6]" : "border-[#F5F1EE] border-dashed"}`} 
                              style={{ left: `${(i / 24) * 100}%` }} 
                            />
                          ))}
                        </div>
                        {/* Segments */}
                        <div className="absolute inset-y-3 left-0 right-0">
                          {employee.segments.map((segment, idx) => (
                            <div
                              key={idx}
                              className={`absolute h-full transition-opacity hover:ring-2 hover:ring-brand/40 ${
                                segment.kind === "active"
                                  ? "bg-brand"
                                  : "border border-[#E1D7CE] bg-white [background-image:repeating-linear-gradient(135deg,transparent,transparent_2px,#E1D7CE_2px,#E1D7CE_4px)]"
                              }`}
                              style={segmentStyle(segment, startMs, endMs)}
                              onMouseEnter={(e) => {
                                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                setHover({ employee, segment, x: e.clientX, y: e.clientY });
                              }}
                              onMouseLeave={() => {
                                hoverTimeoutRef.current = setTimeout(() => {
                                  setHover((prev) => prev?.sticky ? prev : null);
                                }, 300);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[#DDD2C9] bg-[#F8F5F1] px-4 py-2 text-[10px] font-medium text-[#9A9088]">
            <span>Drag to scroll through the full day</span>
            {rangePreset !== "24h" && (
              <span className="uppercase tracking-wider">
                {rangePreset === "custom"
                  ? "Custom View"
                  : `${formatHourLabel(presetWindows[rangePreset]?.startHour ?? 0)} - ${formatHourLabel(presetWindows[rangePreset]?.endHour ?? 24)}`}
              </span>
            )}
          </div>
        </div>
      </section>
      {hover ? (
        <div
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            setHover((prev) => prev ? { ...prev, sticky: true } : prev);
          }}
          onMouseLeave={() => {
            hoverTimeoutRef.current = setTimeout(() => setHover(null), 300);
          }}
        >
          <ActivityHoverCard hover={hover} />
        </div>
      ) : null}
    </div>
  );
}
