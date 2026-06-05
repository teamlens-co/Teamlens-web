"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BrainCircuit,
  CalendarDays,
  Clock,
  Eye,
  GripHorizontal,
  Loader2,
  Monitor,
  RefreshCw,
  Settings2,
  UserRound,
  Users,
  X,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────────── */

type LiveSummaryItem = {
  userId: string;
  start: string;
  end: string;
  generatedAt: string;
  screenshotCount: number;
  productivityScore: number;
  task: string;
  categoryBreakdown: { category: string; duration: string; percentage: number }[];
  activeApplication: string;
};

type PeriodicSummary = {
  userId: string;
  start: string;
  end: string;
  generatedAt: string;
  screenshotCount: number;
  productivityScore: number;
  summary: {
    productivity_score?: number;
    top_tasks?: { task: string; duration: string }[];
    category_breakdown?: { category: string; duration: string; percentage: number }[];
    executive_summary?: string;
    total_analyzed_screenshots?: number;
    distraction_alerts?: string[];
    recommendations?: string[];
  };
};

/* ── Helpers ──────────────────────────────────────────────────────── */

const scoreColor = (score?: number): string => {
  const s = score ?? 0;
  if (s >= 80) return "bg-emerald-500";
  if (s >= 60) return "bg-amber-500";
  if (s >= 40) return "bg-orange-500";
  return "bg-rose-500";
};

const scoreBorder = (score?: number): string => {
  const s = score ?? 0;
  if (s >= 80) return "border-emerald-300";
  if (s >= 60) return "border-amber-300";
  if (s >= 40) return "border-orange-300";
  return "border-rose-300";
};

const scoreBg = (score?: number): string => {
  const s = score ?? 0;
  if (s >= 80) return "bg-emerald-100";
  if (s >= 60) return "bg-amber-100";
  if (s >= 40) return "bg-orange-100";
  return "bg-rose-100";
};

const scoreText = (score?: number): string => {
  const s = score ?? 0;
  if (s >= 80) return "text-emerald-800";
  if (s >= 60) return "text-amber-800";
  if (s >= 40) return "text-orange-800";
  return "text-rose-800";
};

const formatTime = (iso: string): string => {
  try {
    const d = new Date(iso.replace("Z", "+00:00"));
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

const formatDateDisplay = (iso: string): string => {
  try {
    const d = new Date(iso.replace("Z", "+00:00"));
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

const timeToSlotIndex = (timeStr: string): number => {
  try {
    const d = new Date(timeStr.replace("Z", "+00:00"));
    const hours = d.getUTCHours();
    const minutes = d.getUTCMinutes();
    return hours * 2 + Math.floor(minutes / 30);
  } catch {
    return 0;
  }
};

/* ── Interval Config Popup ────────────────────────────────────────── */

function IntervalPopup({
  currentMinutes,
  onSave,
  onClose,
}: {
  currentMinutes: number;
  onSave: (minutes: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(String(currentMinutes));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Settings2 className="h-4 w-4 text-brand" />
            Report Interval
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" type="button">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          How often should periodic summaries be generated (5–480 min)?
        </p>
        <input
          type="number"
          min={5}
          max={480}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-4 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
        />
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(Number(value))}
            disabled={Number(value) < 5 || Number(value) > 480 || !value}
            className="flex h-9 flex-1 items-center justify-center rounded-lg bg-brand text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Slot Detail Popup ────────────────────────────────────────────── */

function SlotDetailPopup({
  userName,
  start,
  end,
  summary,
  onClose,
}: {
  userName: string;
  start: string;
  end: string;
  summary: PeriodicSummary["summary"];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <UserRound className="h-4 w-4 text-brand" />
            {userName}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" type="button">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {formatTime(start)} – {formatTime(end)}
        </p>

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">Score</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${scoreBorder(summary.productivity_score)} ${scoreBg(summary.productivity_score)} ${scoreText(summary.productivity_score)}`}
            >
              {summary.productivity_score ?? "—"}
            </span>
            <span className="text-xs text-slate-400">
              {summary.total_analyzed_screenshots ?? 0} screenshots
            </span>
          </div>

          {summary.executive_summary ? (
            <p className="text-xs leading-5 text-slate-700">{summary.executive_summary}</p>
          ) : null}

          {summary.top_tasks && summary.top_tasks.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Top Tasks</p>
              <div className="mt-1 space-y-1">
                {summary.top_tasks.slice(0, 4).map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
                    <span className="text-xs font-medium text-slate-700">{t.task}</span>
                    <span className="text-[11px] font-semibold text-slate-400">{t.duration}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {summary.distraction_alerts && summary.distraction_alerts.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">Distractions</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-600">
                {summary.distraction_alerts.slice(0, 3).map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {summary.recommendations && summary.recommendations.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Recommendations</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-600">
                {summary.recommendations.slice(0, 3).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <button
          onClick={onClose}
          className="mt-5 flex h-9 w-full items-center justify-center rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ── LiveActivityBoard ────────────────────────────────────────────── */

export default function LiveActivityBoard() {
  const [liveSummaries, setLiveSummaries] = useState<LiveSummaryItem[]>([]);
  const [periodicSummaries, setPeriodicSummaries] = useState<PeriodicSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [showIntervalPopup, setShowIntervalPopup] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    userId: string;
    start: string;
    end: string;
    summary: PeriodicSummary["summary"];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  /* ── Poll live summaries every 30s ──────────────────────────── */
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/ai-screenshot-report/live-summaries", { cache: "no-store" });
        const body = await res.json();
        if (body.success) setLiveSummaries(body.data as LiveSummaryItem[]);
      } catch {
        /* silent */
      }
    };
    poll();
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, []);

  /* ── Load interval config ───────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai-screenshot-report/config/report-interval");
        const body = await res.json();
        if (body.success) setIntervalMinutes(body.data.intervalMinutes);
      } catch {
        /* silent */
      }
    })();
  }, []);

  /* ── Load periodic summaries for selected date ──────────────── */
  const loadPeriodicSummaries = useCallback(async () => {
    setLoading(true);
    try {
      const start = `${selectedDate}T00:00:00Z`;
      const end = `${selectedDate}T23:59:59Z`;
      const res = await fetch(
        `/api/ai-screenshot-report/periodic-summaries?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { cache: "no-store" },
      );
      const body = await res.json();
      if (body.success) setPeriodicSummaries(body.data as PeriodicSummary[]);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadPeriodicSummaries();
  }, [loadPeriodicSummaries]);

  /* ── Save interval config ───────────────────────────────────── */
  const saveInterval = async (minutes: number) => {
    try {
      const res = await fetch(`/api/ai-screenshot-report/config/report-interval?minutes=${minutes}`, {
        method: "POST",
      });
      const body = await res.json();
      if (body.success) setIntervalMinutes(minutes);
    } catch {
      /* silent */
    }
    setShowIntervalPopup(false);
  };

  /* ── Slot grid helpers ───────────────────────────────────────── */
  const timeSlots = useMemo(() => {
    const slots: { label: string; index: number }[] = [];
    // 08:00 – 20:00 = 24 slots
    for (let h = 8; h < 20; h++) {
      slots.push({ label: `${String(h).padStart(2, "0")}:00`, index: h * 2 });
      slots.push({ label: `${String(h).padStart(2, "0")}:30`, index: h * 2 + 1 });
    }
    return slots;
  }, []);

  /* Build a map: userId -> { slotIndex -> PeriodicSummary } */
  const gridData = useMemo(() => {
    const map = new Map<string, Map<number, PeriodicSummary>>();
    for (const ps of periodicSummaries) {
      if (!map.has(ps.userId)) map.set(ps.userId, new Map());
      const slotIndex = timeToSlotIndex(ps.start);
      map.get(ps.userId)!.set(slotIndex, ps);
    }
    return map;
  }, [periodicSummaries]);

  /* Merged user list: from live summaries + periodic summaries */
  const allUsers = useMemo(() => {
    const seen = new Set<string>();
    const users: { userId: string; live?: LiveSummaryItem }[] = [];

    for (const ls of liveSummaries) {
      if (!seen.has(ls.userId)) {
        seen.add(ls.userId);
        users.push({ userId: ls.userId, live: ls });
      }
    }

    for (const ps of periodicSummaries) {
      if (!seen.has(ps.userId)) {
        seen.add(ps.userId);
        users.push({ userId: ps.userId });
      }
    }

    return users;
  }, [liveSummaries, periodicSummaries]);

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Activity className="h-4 w-4 text-brand" />
            Live Activity
          </div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Employee Activity Board</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Date picker */}
          <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="min-w-0 bg-transparent text-xs font-semibold text-slate-700 outline-none"
            />
          </div>

          {/* Refresh */}
          <button
            onClick={loadPeriodicSummaries}
            disabled={loading}
            className="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Interval config */}
          <button
            onClick={() => setShowIntervalPopup(true)}
            className="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            type="button"
            title="Configure interval"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Live Employee Cards (4-column grid) ─────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {liveSummaries.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 p-8 text-center">
            <Monitor className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-400">No live employee data yet</p>
            <p className="mt-1 text-[11px] text-slate-400">Screenshots are being analyzed and summaries will appear here.</p>
          </div>
        ) : (
          liveSummaries.map((item) => (
            <div
              key={item.userId}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${scoreColor(item.productivityScore)}`} />
                  <p className="truncate text-sm font-semibold text-slate-900" title={item.userId}>
                    {item.userId}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${scoreBorder(item.productivityScore)} ${scoreBg(item.productivityScore)} ${scoreText(item.productivityScore)}`}
                >
                  {item.productivityScore}
                </span>
              </div>
              <p className="mt-2 truncate text-xs font-medium text-slate-600" title={item.task}>
                {item.task || "No task data"}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                <Clock className="h-3 w-3" />
                <span>Updated {formatDateDisplay(item.generatedAt)}</span>
              </div>
              {item.activeApplication ? (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Monitor className="h-3 w-3" />
                  <span className="truncate">{item.activeApplication}</span>
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>

      {/* ── Timeline Grid ───────────────────────────────────────── */}
      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {allUsers.length === 0 ? (
          <div className="p-8 text-center">
            <GripHorizontal className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-400">No timeline data</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Select a date and wait for periodic summaries to populate.
            </p>
          </div>
        ) : (
          <div className="min-w-[800px]">
            {/* Header row */}
            <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-50">
              <div className="flex h-10 w-48 shrink-0 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <UserRound className="mr-2 h-3.5 w-3.5" />
                Employee
              </div>
              <div className="flex flex-1">
                {timeSlots.map((slot) => (
                  <div
                    key={slot.index}
                    className="flex h-10 flex-1 items-center justify-center border-l border-slate-100 text-[10px] font-semibold text-slate-400"
                  >
                    {slot.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Employee rows */}
            {allUsers.map((user) => {
              const userGrid = gridData.get(user.userId);
              return (
                <div
                  key={user.userId}
                  className="flex border-b border-slate-100 transition hover:bg-slate-50/50 last:border-b-0"
                >
                  {/* Employee name + score */}
                  <div className="flex h-12 w-48 shrink-0 items-center gap-2 border-r border-slate-100 px-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`h-2 w-2 shrink-0 rounded-full ${scoreColor(user.live?.productivityScore)}`}
                      />
                      <p className="truncate text-xs font-semibold text-slate-800" title={user.userId}>
                        {user.userId}
                      </p>
                    </div>
                    {user.live ? (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${scoreBg(user.live.productivityScore)} ${scoreText(user.live.productivityScore)}`}
                      >
                        {user.live.productivityScore}
                      </span>
                    ) : null}
                  </div>

                  {/* Time slots */}
                  <div className="flex flex-1">
                    {timeSlots.map((slot) => {
                      const summary = userGrid?.get(slot.index);
                      const score = summary?.productivityScore ?? summary?.summary.productivity_score;
                      return (
                        <button
                          key={slot.index}
                          onClick={() => {
                            if (summary) {
                              setSelectedSlot({
                                userId: summary.userId,
                                start: summary.start,
                                end: summary.end,
                                summary: summary.summary,
                              });
                            }
                          }}
                          className={`relative flex flex-1 items-center justify-center border-l border-slate-100 text-[10px] transition ${
                            score !== undefined ? scoreBg(score) + " cursor-pointer hover:brightness-95" : "hover:bg-slate-100"
                          }`}
                          type="button"
                          title={
                            score !== undefined
                              ? `Score: ${score}`
                              : "No data"
                          }
                        >
                          {score !== undefined ? (
                            <span
                              className={`font-bold ${scoreText(score)}`}
                            >
                              {score}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Legend ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-400">Score Legend</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> 80+
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" /> 60–79
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-500" /> 40–59
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" /> &lt;40
        </span>
      </div>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {showIntervalPopup ? (
        <IntervalPopup
          currentMinutes={intervalMinutes}
          onSave={saveInterval}
          onClose={() => setShowIntervalPopup(false)}
        />
      ) : null}

      {selectedSlot ? (
        <SlotDetailPopup
          userName={selectedSlot.userId}
          start={selectedSlot.start}
          end={selectedSlot.end}
          summary={selectedSlot.summary}
          onClose={() => setSelectedSlot(null)}
        />
      ) : null}
    </div>
  );
}
