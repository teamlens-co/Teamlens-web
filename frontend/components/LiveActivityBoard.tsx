"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Loader2,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

// ── Types ──────────────────────────────────────────────────────────────

type CategoryBreakdown = {
  category: string;
  duration: string;
  percentage: number;
};

type LiveSummaryItem = {
  userId: string;
  start: string;
  end: string;
  generatedAt: string;
  screenshotCount: number;
  productivityScore: number;
  task: string;
  categoryBreakdown: CategoryBreakdown[];
  activeApplication: string;
};

type PeriodicSummaryItem = {
  userId: string;
  start: string;
  end: string;
  generatedAt: string;
  screenshotCount: number;
  productivityScore: number;
  summary: {
    productivity_score?: number;
    category_breakdown?: CategoryBreakdown[];
    activity_timeline?: Array<{
      time: string;
      application_name: string;
      task: string;
      focus_level: string;
      category: string;
    }>;
    top_tasks?: Array<{ task: string; duration: string }>;
  };
};

// ── Styling Helpers (mirrors page.tsx) ─────────────────────────────────

const categoryClass = (category?: string) => {
  if (category === "Work") return "bg-slate-900 text-white";
  if (category === "Learning") return "bg-indigo-50 text-indigo-700";
  if (category === "Communication") return "bg-cyan-50 text-cyan-700";
  if (category === "Leisure") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
};

const scoreTone = (score?: number) => {
  if ((score ?? 0) >= 80) return "text-emerald-700 bg-emerald-50 ring-emerald-100";
  if ((score ?? 0) >= 60) return "text-amber-700 bg-amber-50 ring-amber-100";
  return "text-rose-700 bg-rose-50 ring-rose-100";
};

const scoreEmoji = (score?: number) => {
  if ((score ?? 0) >= 80) return "🟢";
  if ((score ?? 0) >= 60) return "🟡";
  return "🔴";
};

// ── Component ──────────────────────────────────────────────────────────

export default function LiveActivityBoard() {
  const { authHeaders, apiBase, user } = useAuth();

  // State
  const [liveSummaries, setLiveSummaries] = useState<LiveSummaryItem[]>([]);
  const [timelineData, setTimelineData] = useState<PeriodicSummaryItem[]>([]);
  const [currentInterval, setCurrentInterval] = useState(30);
  const [intervalInput, setIntervalInput] = useState("30");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [intervalOpen, setIntervalOpen] = useState(false);

  // ── Data Fetching ────────────────────────────────────────────────────

  const loadLiveSummaries = useCallback(async () => {
    if (!authHeaders) return;
    setLoading(true);
    try {
      const response = await fetch("/api/ai-screenshot-report/live-summaries", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (payload.success) {
        setLiveSummaries(payload.data as LiveSummaryItem[]);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadTimelineData = useCallback(async () => {
    if (!authHeaders) return;
    setTimelineLoading(true);
    try {
      const start = new Date(`${date}T00:00:00`).toISOString();
      const end = new Date(`${date}T23:59:59`).toISOString();
      const url = `/api/ai-screenshot-report/periodic-summaries?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json();
      if (payload.success) {
        setTimelineData(payload.data as PeriodicSummaryItem[]);
      }
    } catch {
      // silently fail
    } finally {
      setTimelineLoading(false);
    }
  }, [authHeaders, date]);

  const loadIntervalConfig = useCallback(async () => {
    if (!authHeaders) return;
    try {
      const response = await fetch("/api/ai-screenshot-report/config/report-interval", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (payload.success) {
        const interval = payload.data.intervalMinutes as number;
        setCurrentInterval(interval);
        setIntervalInput(String(interval));
      }
    } catch {
      // ignore
    }
  }, [authHeaders]);

  // ── Polling & Initial Load ───────────────────────────────────────────

  // Poll live summaries every 30s
  useEffect(() => {
    if (!authHeaders) return;
    void loadLiveSummaries();
    const interval = setInterval(loadLiveSummaries, 30_000);
    return () => clearInterval(interval);
  }, [authHeaders, loadLiveSummaries]);

  // Load timeline and interval on mount / date change
  useEffect(() => {
    if (!authHeaders) return;
    void loadTimelineData();
    void loadIntervalConfig();
  }, [authHeaders, loadTimelineData, loadIntervalConfig]);

  // ── Interval Save ────────────────────────────────────────────────────

  const saveIntervalConfig = async () => {
    const minutes = parseInt(intervalInput, 10);
    if (Number.isNaN(minutes) || minutes < 5 || minutes > 480) return;
    try {
      const response = await fetch(
        `/api/ai-screenshot-report/config/report-interval?minutes=${minutes}`,
        { method: "POST", cache: "no-store" },
      );
      const payload = await response.json();
      if (payload.success) {
        setCurrentInterval(payload.data.intervalMinutes as number);
        setIntervalOpen(false);
      }
    } catch {
      // ignore
    }
  };

  // ── Derived Data ─────────────────────────────────────────────────────

  const employeeNames = useMemo(() => {
    const names = new Map<string, string>();
    // Try to extract user names from timeline data
    for (const item of timelineData) {
      const taskObj = item.summary?.top_tasks?.[0];
      if (taskObj?.task) {
        names.set(
          item.userId,
          taskObj.task.split(" ").slice(0, 2).join(" ") || item.userId.slice(0, 8),
        );
      }
    }
    // Fall back to live summaries
    for (const item of liveSummaries) {
      if (!names.has(item.userId)) {
        names.set(item.userId, item.userId.slice(0, 8));
      }
    }
    return names;
  }, [timelineData, liveSummaries]);

  const employeeIds = useMemo(() => {
    const ids = new Set<string>();
    liveSummaries.forEach((s) => ids.add(s.userId));
    timelineData.forEach((s) => ids.add(s.userId));
    const sorted = Array.from(ids).sort();
    if (selectedEmployee !== "all" && !ids.has(selectedEmployee)) {
      // Reset to all if selected employee no longer in data
      setTimeout(() => setSelectedEmployee("all"), 0);
    }
    return sorted;
  }, [liveSummaries, timelineData, selectedEmployee]);

  // Build time slots for the timeline grid (30-min intervals from 9:00 to 18:00)
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 9; h <= 18; h++) {
      slots.push(`${h.toString().padStart(2, "0")}:00`);
      if (h < 18) slots.push(`${h.toString().padStart(2, "0")}:30`);
    }
    return slots;
  }, []);

  // Map periodic summaries to timeline grid cells per employee
  const timelineGrid = useMemo(() => {
    const grid = new Map<string, Map<string, PeriodicSummaryItem>>();
    for (const item of timelineData) {
      if (!grid.has(item.userId)) {
        grid.set(item.userId, new Map());
      }
      // Key by start time rounded to nearest 30-min slot
      const startTime = item.start;
      try {
        const dt = new Date(startTime);
        const key = `${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes() < 30 ? "00" : "30"}`;
        grid.get(item.userId)!.set(key, item);
      } catch {
        // skip unparseable
      }
    }
    return grid;
  }, [timelineData]);

  // Filter visible employees
  const visibleEmployees = useMemo(() => {
    if (selectedEmployee === "all") return employeeIds;
    return employeeIds.filter((id) => id === selectedEmployee);
  }, [employeeIds, selectedEmployee]);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Header Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-brand" />
          <h3 className="text-sm font-semibold text-slate-900">Live Activity Board</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            Every {currentInterval} min
          </span>
        </div>

        <div className="flex items-center gap-2">
          {user?.role === "MANAGER" && (
            <div className="relative">
              <button
                onClick={() => setIntervalOpen(!intervalOpen)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                type="button"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Every {currentInterval} min
              </button>
              {intervalOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Auto Report Interval
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Summary generates automatically every X minutes for all employees.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={480}
                      value={intervalInput}
                      onChange={(e) => setIntervalInput(e.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                    />
                    <span className="shrink-0 text-xs font-semibold text-slate-500">min</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setIntervalOpen(false)}
                      className="h-8 flex-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveIntervalConfig}
                      className="h-8 flex-1 rounded-lg bg-brand text-xs font-semibold text-white"
                      type="button"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
          />

          <button
            onClick={() => {
              void loadLiveSummaries();
              void loadTimelineData();
            }}
            disabled={loading || timelineLoading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            type="button"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading || timelineLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Employee Filter ── */}
      {employeeIds.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedEmployee("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              selectedEmployee === "all"
                ? "bg-brand text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:border-brand/40 hover:bg-brand/5"
            }`}
            type="button"
          >
            All
          </button>
          {employeeIds.map((id) => (
            <button
              key={id}
              onClick={() => setSelectedEmployee(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selectedEmployee === id
                  ? "bg-brand text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-brand/40 hover:bg-brand/5"
              }`}
              type="button"
            >
              {employeeNames.get(id) || id.slice(0, 8)}
            </button>
          ))}
        </div>
      )}

      {/* ── Live Employee Cards (4-col grid) ── */}
      <section>
        {liveSummaries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <Clock3 className="mx-auto h-5 w-5 text-slate-400" />
            <p className="mt-2 text-xs font-semibold text-slate-500">Waiting for data...</p>
            <p className="mt-1 text-xs text-slate-400">
              Live summaries will appear once the system collects enough screenshots.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {liveSummaries
              .filter((item) => selectedEmployee === "all" || item.userId === selectedEmployee)
              .map((item) => (
                <div
                  key={item.userId}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">
                      {item.userId.slice(0, 8)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${scoreTone(item.productivityScore)}`}
                    >
                      {scoreEmoji(item.productivityScore)}
                      {item.productivityScore}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(item.categoryBreakdown ?? []).slice(0, 3).map((cat) => (
                      <span
                        key={cat.category}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryClass(cat.category)}`}
                      >
                        {cat.category}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600 line-clamp-2">
                    {item.task || item.activeApplication || "No activity data"}
                  </p>
                  <p className="mt-2 text-[10px] font-medium text-slate-400">
                    {item.screenshotCount} screenshots{" "}
                    {item.generatedAt
                      ? `• ${new Date(item.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
                      : ""}
                  </p>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* ── Timeline Grid ── */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-brand" />
          <h3 className="text-sm font-semibold text-slate-900">Activity Timeline</h3>
          {timelineLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>

        {visibleEmployees.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <Clock3 className="mx-auto h-5 w-5 text-slate-400" />
            <p className="mt-2 text-xs font-semibold text-slate-500">
              No timeline data for {date}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Employee
                  </th>
                  {timeSlots.map((slot) => (
                    <th
                      key={slot}
                      className="px-1.5 py-2 text-center text-[10px] font-semibold text-slate-400"
                    >
                      {slot}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((empId) => {
                  const empGrid = timelineGrid.get(empId);
                  return (
                    <tr key={empId} className="border-t border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-2 py-3 text-xs font-semibold text-slate-700">
                        {employeeNames.get(empId) || empId.slice(0, 8)}
                      </td>
                      {timeSlots.map((slot) => {
                        const entry = empGrid?.get(slot);
                        const score = entry?.productivityScore ?? -1;
                        const toneClass = score >= 0 ? scoreTone(score) : "";
                        const emoji = score >= 0 ? scoreEmoji(score) : "⚪";
                        return (
                          <td
                            key={`${empId}-${slot}`}
                            className={`px-1.5 py-2 text-center ${
                              score >= 0 ? `rounded ${toneClass}` : "text-slate-200"
                            }`}
                            title={
                              entry
                                ? `Score: ${score} | Screenshots: ${entry.screenshotCount}`
                                : "No data"
                            }
                          >
                            <span className="text-sm">{emoji}</span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="font-semibold text-slate-600">Productivity Score:</span>
        <span className="flex items-center gap-1">
          <span className="text-sm">🟢</span> 80+
        </span>
        <span className="flex items-center gap-1">
          <span className="text-sm">🟡</span> 60–79
        </span>
        <span className="flex items-center gap-1">
          <span className="text-sm">🔴</span> &lt;60
        </span>
        <span className="flex items-center gap-1">
          <span className="text-sm">⚪</span> No data
        </span>
      </div>
    </div>
  );
}
