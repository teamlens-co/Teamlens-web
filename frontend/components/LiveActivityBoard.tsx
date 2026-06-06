"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BrainCircuit,
  CalendarDays,
  CheckCircle,
  CircleX,
  Clock,
  Eye,
  GripHorizontal,
  Loader2,
  Monitor,
  RefreshCw,
  Settings2,
  Star,
  TriangleAlert,
  UserRound,
  Users,
  X,
} from "lucide-react";
import DateFilter, { DateRange, getPresetRange } from "./DateFilter";

/* ── Types ────────────────────────────────────────────────────────── */

type LiveSummaryItem = {
  userId: string;
  fullName?: string;
  start: string;
  end: string;
  generatedAt: string;
  screenshotCount: number;
  productivityScore: number;
  rating?: string;
  task: string;
  categoryBreakdown: { category: string; duration: string; percentage: number }[];
  activeApplication: string;
};

type PeriodicSummary = {
  userId: string;
  fullName?: string;
  start: string;
  end: string;
  generatedAt: string;
  screenshotCount: number;
  productivityScore: number;
  summary: {
    productivity_score?: number;
    rating?: string;
    top_tasks?: { task: string; duration: string }[];
    category_breakdown?: { category: string; duration: string; percentage: number }[];
    executive_summary?: string;
    score_explanation?: string;
    top_issue?: string;
    distraction_summary?: string;
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

/* ── IST Helpers ──────────────────────────────────────────────────── */

/** Given a UTC ISO string, returns {hours, minutes} in IST (UTC+5:30). */
const getISTTime = (iso: string): { hours: number; minutes: number } => {
  const d = new Date(iso.replace("Z", "+00:00").replace(" ", "T"));
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const istMin = (utcMin + 330) % 1440; // 5.5h = 330 min, wrap at 24h
  return { hours: Math.floor(istMin / 60), minutes: istMin % 60 };
};

const formatTime = (iso: string): string => {
  try {
    const { hours, minutes } = getISTTime(iso);
    const period = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    return `${h12}:${minutes.toString().padStart(2, "0")} ${period}`;
  } catch {
    return iso;
  }
};

const formatDateDisplay = (iso: string): string => {
  try {
    const { hours, minutes } = getISTTime(iso);
    const period = hours >= 12 ? "PM" : "AM";
    const h12 = hours % 12 || 12;
    // Extract date portion from ISO
    const d = new Date(iso.replace("Z", "+00:00").replace(" ", "T"));
    const month = d.toLocaleString("en-IN", { month: "short", timeZone: "Asia/Kolkata" });
    const day = d.toLocaleString("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" });
    return `${month} ${day}, ${h12}:${minutes.toString().padStart(2, "0")} ${period}`;
  } catch {
    return iso;
  }
};

const timeToSlotIndex = (timeStr: string): number => {
  try {
    const { hours, minutes } = getISTTime(timeStr);
    return hours * 2 + Math.floor(minutes / 30);
  } catch {
    return 0;
  }
};

const istTimeLabel = (h: number, m: number): string => {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}:00 ${period}` : `${h12}:30 ${period}`;
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

function SlotDetailModal({
  userName,
  start,
  end,
  summary,
  userIndex,
  totalUsers,
  intervalLabel,
  intervalIndex,
  totalIntervals,
  onPrev,
  onNext,
  onPrevInterval,
  onNextInterval,
  onClose,
}: {
  userName: string;
  start: string;
  end: string;
  summary: PeriodicSummary["summary"];
  userIndex: number;
  totalUsers: number;
  intervalLabel?: string;
  intervalIndex?: number;
  totalIntervals?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onPrevInterval?: () => void;
  onNextInterval?: () => void;
  onClose: () => void;
}) {
  const rating = summary.rating || (summary.productivity_score != null ? (summary.productivity_score >= 90 ? "excellent" : summary.productivity_score >= 75 ? "good" : summary.productivity_score >= 60 ? "average" : summary.productivity_score >= 40 ? "below_average" : "poor") : "average");

  const ratingLabel: Record<string, string> = {
    excellent: "Excellent",
    good: "Good",
    average: "Average",
    below_average: "Below Average",
    poor: "Poor",
  };

  /* ── Touch swipe for interval nav on mobile ──────── */
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0) {
      onPrevInterval?.();
    } else {
      onNextInterval?.();
    }
  };

  /* ── Keyboard nav: ← → for intervals, Shift+←/→ for employees ── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && e.shiftKey) {
        e.preventDefault();
        onPrev?.();
      } else if (e.key === "ArrowRight" && e.shiftKey) {
        e.preventDefault();
        onNext?.();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrevInterval?.();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNextInterval?.();
      } else if (e.key === "Escape") {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onPrev, onNext, onPrevInterval, onNextInterval, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <div
          className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* ── Header ── */}
          <div className="shrink-0 border-b border-slate-200">
            {/* Row 1: Employee nav */}
            <div className="flex items-center gap-3 px-5 pt-3 pb-1.5">
              <div className="flex items-center gap-1">
                <button
                  onClick={onPrev}
                  disabled={!onPrev}
                  className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                  type="button"
                  title="Previous employee"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  onClick={onNext}
                  disabled={!onNext}
                  className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                  type="button"
                  title="Next employee"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2">
                <UserRound className="h-3.5 w-3.5 shrink-0 text-brand" />
                <span className="truncate text-sm font-semibold text-slate-900">{userName}</span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {userIndex + 1}/{totalUsers}
                </span>
              </div>

              <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600" type="button" title="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {/* Row 2: Interval nav */}
            <div className="flex items-center gap-2 px-5 pb-3">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={onPrevInterval}
                  disabled={!onPrevInterval}
                  className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-25 active:bg-slate-200"
                  type="button"
                  title="← Previous interval"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  onClick={onNextInterval}
                  disabled={!onNextInterval}
                  className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-25 active:bg-slate-200"
                  type="button"
                  title="→ Next interval"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              <span className="text-xs font-semibold text-slate-700">
                {intervalLabel || `${formatTime(start)} – ${formatTime(end)}`}
              </span>
              {intervalIndex != null && totalIntervals != null && totalIntervals > 0 ? (
                <span className="text-[10px] text-slate-400 font-medium">
                  {intervalIndex + 1}/{totalIntervals}
                </span>
              ) : null}
              <span
                className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1 sm:hidden ${scoreBorder(summary.productivity_score)} ${scoreBg(summary.productivity_score)} ${scoreText(summary.productivity_score)}`}
              >
                {summary.productivity_score ?? "—"}
              </span>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-5">
              {/* Score + time (mobile) */}
              <div className="flex flex-wrap items-center gap-3 sm:hidden">
                <span
                  className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ${scoreBorder(summary.productivity_score)} ${scoreBg(summary.productivity_score)} ${scoreText(summary.productivity_score)}`}
                >
                  {summary.productivity_score ?? "—"}/100
                </span>
                <span className="text-xs text-slate-500">
                  {formatTime(start)} – {formatTime(end)}
                </span>
                <span className="text-xs text-slate-400">
                  {summary.total_analyzed_screenshots ?? 0} screenshots
                </span>
              </div>

              {/* ═══ Score Explanation ═══ */}
              {summary.score_explanation ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Why This Score</p>
                  <div
                    className="mt-1 text-xs leading-5 text-slate-700"
                    dangerouslySetInnerHTML={{
                      __html: (summary.score_explanation || "")
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/\n/g, "<br/>"),
                    }}
                  />
                </div>
              ) : null}

              {/* ═══ Executive Summary ═══ */}
              {summary.executive_summary ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Detailed Summary</p>
                  <div
                    className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700"
                    dangerouslySetInnerHTML={{
                      __html: (summary.executive_summary || "")
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/^•/gm, "→")
                        .replace(/\n/g, "<br/>"),
                    }}
                  />
                </div>
              ) : null}

              {/* ═══ Top Tasks ═══ */}
              {summary.top_tasks && summary.top_tasks.length > 0 ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Top Tasks</p>
                  <div className="mt-1 space-y-1">
                    {summary.top_tasks.slice(0, 6).map((t, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5">
                        <span className="text-xs font-medium text-slate-700">{t.task}</span>
                        <span className="text-[11px] font-semibold text-slate-400">{t.duration}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* ═══ Category Breakdown ═══ */}
              {summary.category_breakdown && summary.category_breakdown.length > 0 ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Activity Split</p>
                  <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                    {summary.category_breakdown.map((c, i) => {
                      const barColor =
                        c.category === "Work"
                          ? "bg-emerald-400"
                          : c.category === "Learning"
                            ? "bg-blue-400"
                            : c.category === "Communication"
                              ? "bg-amber-400"
                              : c.category === "Leisure"
                                ? "bg-rose-400"
                                : "bg-slate-300";
                      return (
                        <div key={i} className="rounded-md bg-slate-50 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-700">{c.category}</span>
                            <span className="text-[11px] font-semibold text-slate-400">{c.duration} ({c.percentage}%)</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${c.percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* ═══ Top Issue ═══ */}
              {summary.top_issue && summary.productivity_score != null && summary.productivity_score < 75 ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600">
                    <TriangleAlert className="h-4 w-4" />
                    Key Issue
                  </div>
                  <div
                    className="mt-1 whitespace-pre-wrap text-xs leading-5 text-rose-800"
                    dangerouslySetInnerHTML={{
                      __html: (summary.top_issue || "").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
                    }}
                  />
                </div>
              ) : null}

              {/* ═══ Distractions ═══ */}
              {summary.distraction_alerts && summary.distraction_alerts.length > 0 ? (
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600">
                    <CircleX className="h-4 w-4" />
                    Distractions ({summary.distraction_alerts.length})
                  </div>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-600">
                    {summary.distraction_alerts.slice(0, 5).map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle className="h-4 w-4" />
                    No Distractions Detected — Focused session
                  </div>
                </div>
              )}

              {/* ═══ Recommendations ═══ */}
              {summary.recommendations && summary.recommendations.length > 0 ? (
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                    <Star className="h-4 w-4" />
                    Recommendations
                  </div>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-600">
                    {summary.recommendations.slice(0, 4).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* ── Dot indicators (interval nav hint) ── */}
              {totalIntervals != null && totalIntervals > 1 ? (
                <div className="flex items-center justify-center gap-1.5 pb-1 sm:hidden">
                  {Array.from({ length: totalIntervals }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === intervalIndex
                          ? "w-5 bg-indigo-500"
                          : "w-1.5 bg-slate-300"
                      }`}
                    />
                  ))}
                  <span className="ml-1.5 text-[10px] text-slate-400 font-medium">{intervalIndex != null ? intervalIndex + 1 : "—"}/{totalIntervals}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── LiveActivityBoard ────────────────────────────────────────────── */

export default function LiveActivityBoard() {
  const [liveSummaries, setLiveSummaries] = useState<LiveSummaryItem[]>([]);
  const [periodicSummaries, setPeriodicSummaries] = useState<PeriodicSummary[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange("Today"));
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [showIntervalPopup, setShowIntervalPopup] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    userId: string;
    fullName?: string;
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
      const start = dateRange.startDate.toISOString();
      const end = dateRange.endDate.toISOString();
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
  }, [dateRange]);

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
    // 08:00 IST – 20:00 IST = 24 half-hour slots
    for (let h = 8; h < 20; h++) {
      slots.push({ label: istTimeLabel(h, 0), index: h * 2 });
      slots.push({ label: istTimeLabel(h, 30), index: h * 2 + 1 });
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
    const seen = new Map<string, { userId: string; fullName?: string; live?: LiveSummaryItem }>();

    for (const ls of liveSummaries) {
      if (!seen.has(ls.userId)) {
        seen.set(ls.userId, { userId: ls.userId, fullName: ls.fullName, live: ls });
      }
    }

    for (const ps of periodicSummaries) {
      const existing = seen.get(ps.userId);
      if (!existing) {
        seen.set(ps.userId, { userId: ps.userId, fullName: ps.fullName });
      } else if (ps.fullName && !existing.fullName) {
        existing.fullName = ps.fullName;
      }
    }

    return Array.from(seen.values());
  }, [liveSummaries, periodicSummaries]);

  const userName = (u: { userId: string; fullName?: string }): string =>
    u.fullName || u.userId.slice(0, 12) + "…";

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Activity className="h-4 w-4 text-brand" />
            Live Activity
          </div>
          <div className="mt-1 flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Employee Activity Board</h2>
            <DateFilter value={dateRange} onChange={setDateRange} />
          </div>
        </div>
        <div className="flex items-center gap-2">
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
      <section>
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <Activity className="h-4 w-4" />
          Current Window — Latest {intervalMinutes}-min summary per employee
          <span className="ml-auto text-[10px] font-normal normal-case text-slate-400">
            Auto-refreshes every 30s
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                    {item.fullName || item.userId.slice(0, 12) + "…"}
                  </p>
                </div>
                <div className="shrink-0">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${scoreBorder(item.productivityScore)} ${scoreBg(item.productivityScore)} ${scoreText(item.productivityScore)}`}
                  >
                    {item.productivityScore}
                  </span>
                </div>
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
        </div>
      </section>

      {/* ── Timeline Grid ───────────────────────────────────────── */}
      <section className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* Mobile scroll hint — hides once scrolled */}
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-black/5 to-transparent md:hidden" />

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
            <div className="sticky left-0 z-10 flex border-b border-slate-200 bg-slate-50">
              <div className="flex h-10 w-36 shrink-0 items-center px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:w-48">
                <UserRound className="mr-2 hidden h-3.5 w-3.5 sm:inline" />
                <span className="sm:hidden">Name</span>
                <span className="hidden sm:inline">Employee</span>
              </div>
              <div className="flex flex-1">
                {timeSlots.map((slot) => (
                  <div
                    key={slot.index}
                    className="flex h-10 flex-1 items-center justify-center border-l border-slate-100 text-[9px] sm:text-[10px] font-semibold text-slate-400"
                  >
                    <span className="hidden sm:inline">{slot.label}</span>
                    <span className="sm:hidden">{slot.label.replace(" AM","A").replace(" PM","P")}</span>
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
                  <div className="flex h-12 w-36 shrink-0 items-center gap-2 border-r border-slate-100 px-3 sm:w-48">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`h-2 w-2 shrink-0 rounded-full ${scoreColor(user.live?.productivityScore)}`}
                      />
                      <p className="truncate text-xs font-semibold text-slate-800" title={user.userId}>
                        {userName(user)}
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
                                fullName: summary.fullName,
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

      {selectedSlot ? (() => {
        const currIndex = allUsers.findIndex((x) => x.userId === selectedSlot.userId);
        const total = allUsers.length;

        const goToUser = (direction: -1 | 1) => {
          const nextIndex = currIndex + direction;
          if (nextIndex < 0 || nextIndex >= total) return;
          const nextUser = allUsers[nextIndex];
          // Look up same time slot for next user from gridData
          const slotIndex = timeToSlotIndex(selectedSlot.start);
          const nextSummary = gridData.get(nextUser.userId)?.get(slotIndex);
          if (nextSummary) {
            setSelectedSlot({
              userId: nextSummary.userId,
              fullName: nextSummary.fullName,
              start: nextSummary.start,
              end: nextSummary.end,
              summary: nextSummary.summary,
            });
          } else {
            // No data for this window — show empty state
            setSelectedSlot({
              userId: nextUser.userId,
              fullName: nextUser.fullName,
              start: selectedSlot.start,
              end: selectedSlot.end,
              summary: {} as PeriodicSummary["summary"],
            });
          }
        };

        // Interval navigation: find current slot index, move to adjacent
        const currSlotIndex = timeToSlotIndex(selectedSlot.start);
        const userGrid = selectedSlot.userId ? gridData.get(selectedSlot.userId) : undefined;
        const availableIntervalIndices = userGrid ? Array.from(userGrid.keys()).sort((a, b) => a - b) : [];
        const currIntervalPos = availableIntervalIndices.indexOf(currSlotIndex);

        const goToInterval = (direction: -1 | 1) => {
          const nextPos = currIntervalPos + direction;
          if (nextPos < 0 || nextPos >= availableIntervalIndices.length) return;
          const nextSlotIndex = availableIntervalIndices[nextPos];
          const summary = userGrid?.get(nextSlotIndex);
          if (summary) {
            setSelectedSlot({
              userId: summary.userId,
              fullName: summary.fullName,
              start: summary.start,
              end: summary.end,
              summary: summary.summary,
            });
          }
        };

        const u = currIndex >= 0 ? allUsers[currIndex] : null;
        const displayName = u ? userName(u) : selectedSlot.userId;

        // Find matching time slot label
        const matchingSlot = timeSlots.find(s => s.index === currSlotIndex);
        const intervalLabel = matchingSlot ? matchingSlot.label : undefined;

        return (
          <SlotDetailModal
            userName={displayName}
            start={selectedSlot.start}
            end={selectedSlot.end}
            summary={selectedSlot.summary}
            userIndex={currIndex >= 0 ? currIndex : 0}
            totalUsers={total}
            intervalLabel={intervalLabel}
            intervalIndex={currIntervalPos >= 0 ? currIntervalPos : 0}
            totalIntervals={availableIntervalIndices.length}
            onPrev={currIndex > 0 ? () => goToUser(-1) : undefined}
            onNext={currIndex < total - 1 ? () => goToUser(1) : undefined}
            onPrevInterval={currIntervalPos > 0 ? () => goToInterval(-1) : undefined}
            onNextInterval={currIntervalPos < availableIntervalIndices.length - 1 ? () => goToInterval(1) : undefined}
            onClose={() => setSelectedSlot(null)}
          />
        );
      })() : null}
    </div>
  );
}
