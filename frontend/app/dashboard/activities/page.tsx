"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Keyboard, MousePointer2 } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import DashboardDateFilter from "../../../components/DashboardDateFilter";
import TimeRangeSlider from "../../../components/TimeRangeSlider";

type RangePreset = "24h" | "12h" | "10h" | "custom";

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

function ActivityHoverCard({ hover }: { hover: HoverState }) {
  const { employee, segment, x, y } = hover;
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
      className="pointer-events-none fixed z-[100] w-[320px] border border-[#E7E0DA] bg-white p-4 text-[#312D29] shadow-[0_12px_38px_rgba(39,34,30,0.18)]"
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
    </div>
  );
}

export default function ActivitiesPage() {
  const { authHeaders, apiBase, dateRange } = useAuth();
  const [employees, setEmployees] = useState<ActivityEmployee[]>([]);
  const [rangePreset, setRangePreset] = useState<RangePreset>("24h");
  const [customStartHour, setCustomStartHour] = useState(0);
  const [customEndHour, setCustomEndHour] = useState(24);
  const [hover, setHover] = useState<HoverState | null>(null);
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

  useEffect(() => {
    if (!authHeaders) return;

    const fetchTimeline = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          startDate: effectiveRange.start.toISOString(),
          endDate: effectiveRange.end.toISOString(),
        });
        const response = await fetch(`${apiBase}/api/web/dashboard/activity-timeline?${params.toString()}`, {
          headers: authHeaders,
          credentials: "include",
        });
        const payload = (await response.json()) as TimelineResponse;
        if (!response.ok || !payload.success) {
          setEmployees([]);
          setError(payload.message || "Unable to load activity timeline.");
          return;
        }

        setEmployees(payload.data.employees);
      } catch (requestError) {
        console.error("Failed to load activity timeline", requestError);
        setEmployees([]);
        setError("Unable to load activity timeline.");
      } finally {
        setLoading(false);
      }
    };

    void fetchTimeline();
  }, [apiBase, authHeaders, effectiveRange]);

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
    <div className="mx-auto max-w-none space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-[18px] font-semibold leading-tight text-[#171717]">Activities</h1>
            <p className="mt-1 text-[13px] text-[#7E6F65]">Timeline view of all employee activities</p>
          </div>
          <div className="sm:ml-2">
            <DashboardDateFilter />
          </div>
        </div>
      </header>

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
              ) : error ? (
                <div className="px-5 py-20 text-center text-[13px] text-red-500">{error}</div>
              ) : employees.length === 0 ? (
                <div className="px-5 py-20 text-center text-[13px] text-[#7E6F65]">
                  No activity data for {formatEmptyDate(dateRange.startDate)}
                </div>
              ) : (
                <div className="divide-y divide-[#F0EAE5]">
                  {employees.map((employee) => (
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
                              onMouseEnter={(e) => setHover({ employee, segment, x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setHover(null)}
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
      {hover ? <ActivityHoverCard hover={hover} /> : null}
    </div>
  );
}
