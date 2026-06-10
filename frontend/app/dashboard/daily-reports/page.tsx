"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays, Clock, ChevronLeft, ChevronRight, FileText,
  AlertCircle, RefreshCw, ChevronDown, BrainCircuit,
  MessageSquareText, BookOpen, Gamepad2, Ellipsis,
  Clock4, ListChecks, Sparkles, CircleAlert, ArrowUpRight,
  Users, BarChart3, Activity, Target, ArrowLeft
} from "lucide-react";
} from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import Link from "next/link";

type CategoryItem = {
  category: string;
  duration_seconds: number;
  percentage: number;
};

type TopTask = {
  task: string;
  duration: string;
};

type HourlyFocus = {
  hour: string;
  focus_level: string;
};

type DailyReport = {
  userId: string;
  fullName: string;
  reportDate: string;
  generatedAt: string;
  totalAnalyzedScreenshots: number;
  productivityScore: number;
  categoryBreakdown: CategoryItem[];
  topTasks: TopTask[];
  hourlyFocus: HourlyFocus[];
  distractionAlerts: string[];
  recommendations: string[];
  reportMarkdown: string;
};

const CATEGORY_META: Record<string, { icon: typeof BrainCircuit; color: string; label: string }> = {
  Work: { icon: BrainCircuit, color: "bg-brand/15 text-brand", label: "Work" },
  Communication: { icon: MessageSquareText, color: "bg-sky-100 text-sky-700", label: "Communication" },
  Learning: { icon: BookOpen, color: "bg-emerald-100 text-emerald-700", label: "Learning" },
  Leisure: { icon: Gamepad2, color: "bg-amber-100 text-amber-700", label: "Leisure" },
  Other: { icon: Ellipsis, color: "bg-muted text-muted-foreground", label: "Other" },
};

const FOCUS_COLORS: Record<string, string> = {
  "Deep Work": "bg-brand",
  "High": "bg-brand",
  "Medium": "bg-amber-400",
  "Low": "bg-rose-400",
  "Distraction": "bg-rose-500",
};

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<span class="text-[13px] font-semibold text-foreground block mt-4 mb-1.5">$1</span>')
    .replace(/^## (.+)$/gm, '<span class="text-[14px] font-bold text-foreground block mt-5 mb-2">$1</span>')
    .replace(/^# (.+)$/gm, '<span class="text-base font-bold text-foreground block mt-6 mb-2">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

function parseTotalTimeFromMarkdown(md: string): string {
  const match = md.match(/Total analyzed time:\s*([\dh ]+)/i);
  return match?.[1]?.trim() ?? "";
}

function parsePlainEnglishSummary(md: string): string {
  const lines = md.split("\n");
  let inPlain = false;
  const summaryLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("## Plain English Summary")) { inPlain = true; continue; }
    if (inPlain && line.startsWith("## ")) break;
    if (inPlain && line.trim()) summaryLines.push(line.trim());
  }
  return summaryLines.join(" ").replace(/\*\*(.+?)\*\*/g, "$1");
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-rose-600";
  const bg = score >= 80 ? "bg-emerald-100" : score >= 60 ? "bg-amber-100" : "bg-rose-100";
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg ${bg} ${color} px-2 py-0.5 text-[11px] font-bold leading-relaxed`}>
      <Target className="h-3 w-3" />
      {score}%
    </span>
  );
}

function FocusBar({ level, width }: { level: string; width: number }) {
  const bg = FOCUS_COLORS[level] || "bg-muted-foreground/30";
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${bg} transition-all`} style={{ width: `${width}%` }} />
    </div>
  );
}

export default function DailyReportsPage() {
  const { authHeaders } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    return now.toISOString().split("T")[0];
  });
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [regenerating, setRegenerating] = useState(false);

  const fetchReports = async (date: string) => {
    if (!authHeaders) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/ai-screenshot-report/daily-reports?date=${date}`,
        { headers: authHeaders as HeadersInit }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setReports(json.data ?? []);
      } else {
        setError(json.message ?? "Failed to load reports");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection error");
    } finally {
      setLoading(false);
    }
  };

  const fetchDates = async () => {
    if (!authHeaders) return;
    try {
      const res = await fetch(
        `/api/ai-screenshot-report/daily-reports/dates`,
        { headers: authHeaders as HeadersInit }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.success) setAvailableDates(json.data ?? []);
      }
    } catch {
      // Silently fail
    }
  };

  useEffect(() => { fetchDates(); }, []);
  useEffect(() => { fetchReports(selectedDate); }, [selectedDate]);

  const handleRegenerate = async () => {
    if (!authHeaders) return;
    setRegenerating(true);
    try {
      const res = await fetch(
        `/api/ai-screenshot-report/daily-reports/regenerate?date=${selectedDate}`,
        { method: "POST", headers: authHeaders as HeadersInit }
      );
      if (res.ok) {
        await fetchReports(selectedDate);
        await fetchDates();
      }
    } finally {
      setRegenerating(false);
    }
  };

  const navigateDate = (delta: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const today = new Date().toISOString().split("T")[0];

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!reports.length) return null;
    const totalTracked = reports.reduce((sum, r) => {
      return sum + (r.categoryBreakdown?.reduce((s, c) => s + c.duration_seconds, 0) ?? 0);
    }, 0);
    const avgScore = Math.round(reports.reduce((sum, r) => sum + r.productivityScore, 0) / reports.length);
    const totalDistractions = reports.reduce((sum, r) => sum + (r.distractionAlerts?.length ?? 0), 0);
    return { totalTracked, avgScore, totalDistractions, employeeCount: reports.length };
  }, [reports]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Daily Reports</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Team activity summary — see everyone&apos;s day at a glance
          </p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-[var(--surface-2)] px-4 text-[12.5px] font-medium text-foreground shadow-sm transition-colors hover:bg-accent/40 disabled:opacity-50"
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`} />
          {regenerating ? "Generating..." : "Generate Now"}
        </button>
      </div>

      {/* ── Date Navigation ── */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-[var(--surface-2)] px-4 py-3 shadow-sm">
        <button
          onClick={() => navigateDate(-1)}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          type="button"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-[13px] font-medium text-foreground bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
          />
          {reports.length > 0 && (
            <span className="text-[11.5px] text-muted-foreground bg-muted/50 rounded-md px-2 py-0.5">
              {reports.length} report{reports.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={() => navigateDate(1)}
          disabled={selectedDate >= today}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-30"
          type="button"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Summary Stats ── */}
      {summaryStats && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-[var(--surface-2)] px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Employees
            </p>
            <p className="text-xl font-bold text-foreground">{summaryStats.employeeCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-[var(--surface-2)] px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Avg Score
            </p>
            <p className="text-xl font-bold text-foreground">{summaryStats.avgScore}%</p>
          </div>
          <div className="rounded-xl border border-border bg-[var(--surface-2)] px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Total Tracked
            </p>
            <p className="text-xl font-bold text-foreground">{fmtDuration(summaryStats.totalTracked)}</p>
          </div>
          <div className="rounded-xl border border-border bg-[var(--surface-2)] px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Distractions
            </p>
            <p className="text-xl font-bold text-foreground">{summaryStats.totalDistractions}</p>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-[var(--surface-2)] p-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted/60" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
          <p className="text-[13px] font-medium text-rose-700">{error}</p>
          <button
            onClick={() => fetchReports(selectedDate)}
            className="mt-3 text-[12px] text-rose-600 underline hover:no-underline"
            type="button"
          >
            Try again
          </button>
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-border bg-[var(--surface-2)] p-12 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <h3 className="text-[14px] font-semibold text-foreground mb-1">No Reports Yet</h3>
          <p className="text-[12.5px] text-muted-foreground mx-auto max-w-md">
            Daily reports haven&apos;t been generated for this date yet.
            Reports are auto-generated at the configured time each day.
            You can also click &quot;Generate Now&quot; to create them manually.
          </p>
        </div>
      ) : (
        <>
          {/* ── Employee Report List (Table-like rows) ── */}
          <div className="space-y-2">
            {reports.map((report) => {
              const totalSeconds =
                report.categoryBreakdown?.reduce((s, c) => s + c.duration_seconds, 0) ?? 0;
              const totalTimeStr = parseTotalTimeFromMarkdown(report.reportMarkdown || "");
              const workPct = report.categoryBreakdown?.find(c => c.category === "Work")?.percentage ?? 0;
              const leisurePct = report.categoryBreakdown?.find(c => c.category === "Leisure")?.percentage ?? 0;
              const distCount = report.distractionAlerts?.length ?? 0;

              return (
                <div key={report.userId}>
                  <Link
                    href={`/dashboard/daily-reports/${report.userId}`}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all focus:outline-none ${
                      "border-border bg-[var(--surface-2)] shadow-sm hover:border-brand/20 hover:shadow-md"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand">
                      {(report.fullName?.split(" ") ?? [])
                        ?.map((n: string) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2) ?? "?"}
                    </div>

                    {/* Name + Time */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground truncate">
                        {report.fullName}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground flex items-center gap-1">
                        <Clock className="inline h-3 w-3" />
                        {totalTimeStr || fmtDuration(totalSeconds)}
                        <span className="mx-1">·</span>
                        {report.totalAnalyzedScreenshots} captures
                      </p>
                    </div>

                    {/* Inline metrics (visible on sm+) */}
                    <div className="hidden sm:flex items-center gap-4">
                      {/* Work % */}
                      <div className="text-right min-w-[60px]">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Work</p>
                        <p className="text-[13px] font-bold text-emerald-600">{workPct}%</p>
                      </div>
                      {/* Leisure % */}
                      <div className="text-right min-w-[60px]">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Leisure</p>
                        <p className={`text-[13px] font-bold ${leisurePct > 20 ? "text-rose-600" : "text-muted-foreground"}`}>{leisurePct}%</p>
                      </div>
                      {/* Distractions */}
                      <div className="text-right min-w-[60px]">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Distractions</p>
                        <p className={`text-[13px] font-bold ${distCount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{distCount}</p>
                      </div>
                    </div>

                    {/* Score + Arrow */}
                    <div className="flex items-center gap-2 shrink-0">
                      <ScoreBadge score={report.productivityScore} />
                      <ArrowLeft className="h-4 w-4 rotate-135 text-muted-foreground" />
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
