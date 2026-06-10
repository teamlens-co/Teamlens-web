"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays, Clock, ChevronLeft, ChevronRight, FileText,
  AlertCircle, RefreshCw, ChevronDown, BrainCircuit,
  MessageSquareText, BookOpen, Gamepad2, Ellipsis,
  Clock4, ListChecks, Sparkles, CircleAlert, ArrowUpRight,
  Target, ArrowLeft, Loader2
} from "lucide-react";
import { useAuth } from "../../../../contexts/AuthContext";

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

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />;
}

export default function EmployeeReportPage() {
  const params = useParams();
  const router = useRouter();
  const { authHeaders } = useAuth();
  const userId = params?.userId as string;

  const [report, setReport] = useState<DailyReport | null>(null);
  const [allReports, setAllReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    return now.toISOString().split("T")[0];
  });

  // Fetch all reports for navigation
  const fetchReports = useCallback(async (date: string) => {
    if (!authHeaders) return;
    try {
      const res = await fetch(
        `/api/ai-screenshot-report/daily-reports?date=${date}`,
        { headers: authHeaders as HeadersInit }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) return json.data ?? [];
      return [];
    } catch {
      return [];
    }
  }, [authHeaders]);

  // Fetch single employee report
  const fetchEmployeeReport = useCallback(async (date: string, employeeId: string) => {
    if (!authHeaders) return null;
    try {
      const res = await fetch(
        `/api/ai-screenshot-report/daily-reports?date=${date}`,
        { headers: authHeaders as HeadersInit }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) return null;
      const reports: DailyReport[] = json.data ?? [];
      setAllReports(reports);
      return reports.find((r) => r.userId === employeeId) ?? null;
    } catch {
      return null;
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!authHeaders) return;
    setLoading(true);
    setError("");
    fetchEmployeeReport(selectedDate, userId).then((r) => {
      if (r) {
        setReport(r);
      } else {
        setError("Report not found for this employee on the selected date");
      }
      setLoading(false);
    });
  }, [authHeaders, userId, selectedDate, fetchEmployeeReport]);

  // Current index for navigation
  const currentIndex = allReports.findIndex((r) => r.userId === userId);

  const navigateDate = useCallback((delta: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  }, [selectedDate]);

  const navigateEmployee = useCallback((delta: number) => {
    const newIndex = currentIndex + delta;
    if (newIndex >= 0 && newIndex < allReports.length) {
      router.push(`/dashboard/daily-reports/${allReports[newIndex].userId}`);
    }
  }, [currentIndex, allReports, router]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Avoid interfering with input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowLeft" && !e.shiftKey) {
        e.preventDefault();
        navigateDate(-1);
      } else if (e.key === "ArrowRight" && !e.shiftKey) {
        e.preventDefault();
        navigateDate(1);
      } else if (e.key === "ArrowLeft" && e.shiftKey) {
        e.preventDefault();
        navigateEmployee(-1);
      } else if (e.key === "ArrowRight" && e.shiftKey) {
        e.preventDefault();
        navigateEmployee(1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.push("/dashboard/daily-reports");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigateDate, navigateEmployee, router]);

  const today = new Date().toISOString().split("T")[0];

  // Computed values
  const totalSeconds = report?.categoryBreakdown?.reduce((s, c) => s + c.duration_seconds, 0) ?? 0;
  const totalTimeStr = report ? parseTotalTimeFromMarkdown(report.reportMarkdown || "") : "";
  const plainSummary = report ? parsePlainEnglishSummary(report.reportMarkdown || "") : "";
  const focusByHour = report?.hourlyFocus ?? [];

  // Touch swipe for employee navigation
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx > 0) navigateEmployee(-1);
    else navigateEmployee(1);
    setTouchStart(null);
  };

  if (!authHeaders) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-4xl px-4 sm:px-0"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Back + Navigation Bar ── */}
      <div className="mb-5 flex items-center justify-between">
        <Link
          href="/dashboard/daily-reports"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg text-[12.5px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        {/* Employee nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateEmployee(-1)}
            disabled={currentIndex <= 0}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-30"
            type="button"
            title="Previous employee (Shift+←)"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[11px] font-medium text-muted-foreground min-w-[80px] text-center">
            {currentIndex >= 0
              ? `${currentIndex + 1} / ${allReports.length}`
              : "-"}
          </span>
          <button
            onClick={() => navigateEmployee(1)}
            disabled={currentIndex < 0 || currentIndex >= allReports.length - 1}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-30"
            type="button"
            title="Next employee (Shift+→)"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Date Navigation ── */}
      <div className="mb-5 flex items-center justify-between rounded-xl border border-border bg-[var(--surface-2)] px-4 py-3 shadow-sm">
        <button
          onClick={() => navigateDate(-1)}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          type="button"
          title="Previous day (←)"
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
        </div>
        <button
          onClick={() => navigateDate(1)}
          disabled={selectedDate >= today}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground disabled:opacity-30"
          type="button"
          title="Next day (→)"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
          <p className="text-[13px] font-medium text-rose-700">{error}</p>
          <Link
            href="/dashboard/daily-reports"
            className="mt-3 inline-block text-[12px] text-rose-600 underline hover:no-underline"
          >
            Back to reports
          </Link>
        </div>
      ) : report ? (
        <div className="space-y-5">
          {/* ── Employee Header Card ── */}
          <div className="rounded-xl border border-border bg-[var(--surface-2)] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-lg font-bold text-brand">
                  {(report.fullName?.split(" ") ?? []).map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?"}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{report.fullName}</h2>
                  <p className="text-[12.5px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {report.reportDate
                      ? new Date(report.reportDate + "T12:00:00").toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Score</p>
                  <ScoreBadge score={report.productivityScore} />
                </div>
              </div>
            </div>
            {/* Quick stats row */}
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/60 pt-4">
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time Tracked</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{totalTimeStr || fmtDuration(totalSeconds)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Captures</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{report.totalAnalyzedScreenshots}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Generated</p>
                <p className="text-sm font-bold text-foreground mt-0.5">
                  {report.generatedAt
                    ? new Date(report.generatedAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* ── Executive Summary ── */}
          {plainSummary && (
            <div className="rounded-xl border border-border/60 bg-gradient-to-br from-background/80 to-background p-5">
              <p className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-brand" />
                Executive Summary
              </p>
              <p className="text-[13px] leading-relaxed text-foreground/85">{plainSummary}</p>
            </div>
          )}

          {/* ── Activity Split ── */}
          {report.categoryBreakdown && report.categoryBreakdown.filter(c => c.percentage > 0).length > 0 && (
            <div className="rounded-xl border border-border bg-[var(--surface-2)] p-5 shadow-sm">
              <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock4 className="h-3.5 w-3.5 text-brand" />
                Activity Split
              </p>
              <div className="space-y-3.5">
                {report.categoryBreakdown.filter(c => c.percentage > 0).map((item) => {
                  const meta = CATEGORY_META[item.category] ?? { icon: Ellipsis, color: "bg-muted text-muted-foreground", label: item.category };
                  const Icon = meta.icon;
                  return (
                    <div key={item.category} className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-[12px] mb-1">
                          <span className="font-medium text-foreground">{meta.label}</span>
                          <span className="text-muted-foreground">
                            {fmtDuration(item.duration_seconds)}
                            <span className="ml-1.5 font-semibold text-foreground">{item.percentage}%</span>
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-brand/60 transition-all" style={{ width: `${Math.max(2, item.percentage)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Top Tasks ── */}
          {report.topTasks && report.topTasks.length > 0 && (
            <div className="rounded-xl border border-border bg-[var(--surface-2)] p-5 shadow-sm">
              <p className="mb-3.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5 text-brand" />
                Top Activities
              </p>
              <div className="space-y-2">
                {report.topTasks.slice(0, 6).map((task, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-lg bg-background/40 px-3.5 py-2.5">
                    <span className="text-[12.5px] text-foreground/85 truncate min-w-0 flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[9px] font-bold text-muted-foreground">{i + 1}</span>
                      {task.task}
                    </span>
                    <span className="text-[11.5px] text-muted-foreground shrink-0 font-medium">{task.duration}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Hourly Focus ── */}
          {focusByHour.length > 0 && (
            <div className="rounded-xl border border-border bg-[var(--surface-2)] p-5 shadow-sm">
              <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-brand" />
                Hourly Focus
              </p>
              <div className="space-y-2">
                {focusByHour.map((fh, i) => {
                  const level = fh.focus_level;
                  const bg = FOCUS_COLORS[level] || "bg-muted";
                  const label = level === "High" ? "Deep Work" : level === "Medium" ? "Moderate" : level === "Low" ? "Light" : level;
                  return (
                    <div key={i} className="flex items-center gap-3 text-[11.5px]">
                      <span className="w-10 shrink-0 font-medium text-muted-foreground">{fh.hour?.slice(0, 5)}</span>
                      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${bg} transition-all`} style={{ width: level === "High" ? "90" : level === "Medium" ? "60" : level === "Low" ? "30" : "15" }} />
                      </div>
                      <span className="w-18 shrink-0 text-right text-muted-foreground">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Distractions ── */}
          {report.distractionAlerts && report.distractionAlerts.length > 0 && (
            <div className="rounded-xl border border-border bg-[var(--surface-2)] p-5 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <CircleAlert className="h-3.5 w-3.5 text-amber-500" />
                Distractions ({report.distractionAlerts.length})
              </p>
              <div className="space-y-2">
                {report.distractionAlerts.slice(0, 4).map((d, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-rose-50/50 px-3.5 py-2.5">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-400" />
                    <span className="text-[12px] text-rose-800/80">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recommendations ── */}
          {report.recommendations && report.recommendations.length > 0 && (
            <div className="rounded-xl border border-border bg-[var(--surface-2)] p-5 shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                Recommendations
              </p>
              <div className="space-y-2">
                {report.recommendations.slice(0, 3).map((r, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-emerald-50/50 px-3.5 py-2.5">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                    <span className="text-[12px] text-emerald-800/80">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Full Report Markdown ── */}
          {report.reportMarkdown && (
            <details className="group rounded-xl border border-border/60 bg-[var(--surface-2)] shadow-sm">
              <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                <FileText className="h-3.5 w-3.5" />
                Full Report
                <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div
                className="border-t border-border/40 px-5 py-5 text-[12px] leading-relaxed text-foreground/70 space-y-1"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(report.reportMarkdown) }}
              />
            </details>
          )}

          {/* ── Keyboard Shortcuts Hint ── */}
          <div className="rounded-xl border border-border/40 bg-muted/20 px-5 py-3">
            <p className="text-[11px] text-muted-foreground text-center">
              ← / → Change day &nbsp;·&nbsp; Shift+← / Shift+→ Change employee &nbsp;·&nbsp; Esc Back to list
              <span className="block sm:hidden mt-1">&nbsp;·&nbsp; Swipe left/right to switch employee</span>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
