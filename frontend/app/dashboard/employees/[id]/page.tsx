"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  Activity,
  ArrowLeft,
  Ban,
  BarChart3,
  Brain,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileText,
  Laptop,
  LineChart,
  MoreHorizontal,
  Phone,
  Settings,
  Video,
} from "lucide-react";
import { useAuth, Role } from "../../../../contexts/AuthContext";
import DashboardDateFilter from "../../../../components/DashboardDateFilter";
import ActivityTimelineChart, {
  buildDailyActivityBars,
} from "../../../../components/ActivityTimelineChart";

type TabType = "overview" | "screenshots" | "activity" | "apps" | "calls" | "video" | "reports" | "ai" | "settings";

type ApiUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status?: "ACTIVE" | "INVITED" | "DISABLED";
};

type ApiTeam = {
  id: string;
  name: string;
  members?: Array<{ id: string }>;
};

type TimelineSegment = {
  start: string;
  end: string;
  kind: "active" | "idle";
  mouseMoves: number;
  keyPresses: number;
};

type TimelineEmployee = {
  userId: string;
  employeeName: string;
  email: string;
  activeSeconds: number;
  idleSeconds: number;
  workSeconds: number;
  utilizationPercent: number;
  lastActiveAt: string | null;
  topApps: Array<{ name: string; seconds: number }>;
  segments: TimelineSegment[];
};

type AnalyticsData = {
  activeSeconds?: number;
  idleSeconds?: number;
  workSeconds?: number;
  manualSeconds?: number;
  productivityPercent?: number;
};

type UsageItem = {
  name: string;
  targetType: "APP" | "DOMAIN" | "URL";
  appName: string;
  domain: string;
  category: "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";
  durationSeconds: number;
};

type UsageReport = {
  items: UsageItem[];
  categories: Array<{ category: UsageItem["category"]; durationSeconds: number }>;
};

type ScreenshotItem = {
  id: string;
  activeApplication?: string | null;
  windowTitle?: string | null;
  capturedAt: string;
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "TL";

const formatCompactDuration = (seconds = 0) => {
  const total = Math.max(0, Math.round(toFiniteSeconds(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

const formatHours = (seconds = 0) => {
  const hours = toFiniteSeconds(seconds) / 3600;
  if (hours <= 0) return "0h";
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)}h`;
};

const toFiniteSeconds = (value: unknown) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : 0;
};

const formatPercentOf = (part: number, total: number) => {
  const safePart = toFiniteSeconds(part);
  const safeTotal = toFiniteSeconds(total);
  if (safeTotal <= 0) return "0%";
  return `${Math.round((safePart / safeTotal) * 100)}%`;
};

const relativeTime = (value: string | null) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const segmentHourLevels = (segments: TimelineSegment[]) => {
  const levels = Array.from({ length: 24 }, (_, hour) => ({ hour, level: 0 }));
  for (const segment of segments) {
    if (segment.kind !== "active") continue;
    const start = new Date(segment.start);
    const end = new Date(segment.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    let cursor = start.getTime();
    const endMs = end.getTime();
    while (cursor < endMs) {
      const cursorDate = new Date(cursor);
      const hourEnd = new Date(cursorDate);
      hourEnd.setMinutes(59, 59, 999);
      const sliceEnd = Math.min(endMs, hourEnd.getTime() + 1);
      const activeSecondsInHour = Math.max(0, (sliceEnd - cursor) / 1000);
      const hour = cursorDate.getHours();
      levels[hour]!.level = Math.min(100, levels[hour]!.level + Math.round((activeSecondsInHour / 3600) * 100));
      cursor = sliceEnd;
    }
  }
  return levels;
};

function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "green" | "amber" }) {
  const toneClass = tone === "green" ? "text-[#26B978]" : tone === "amber" ? "text-[#F59E0B]" : "text-[#171717]";
  return (
    <div className="rounded-xl border border-[#DDD2C9] bg-white p-4">
      <p className="text-xs text-[#7E6F65]">{label}</p>
      <p className={`mt-2 text-[22px] font-medium leading-none ${toneClass}`}>{value}</p>
    </div>
  );
}

function UsageBars({ title, items, color }: { title: string; items: UsageItem[]; color: string }) {
  const max = Math.max(...items.map((item) => item.durationSeconds), 1);
  return (
    <section className="rounded-xl border border-[#DDD2C9] bg-white p-5">
      <h3 className="mb-4 text-base font-medium text-[#171717]">{title}</h3>
      <div className="space-y-4">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#9A9088]">No usage data for the selected range.</p>
        ) : (
          items.slice(0, 5).map((item) => (
            <div key={`${title}-${item.name}`} className="grid grid-cols-[90px_1fr_54px] items-center gap-4 text-sm">
              <span className="truncate text-[#171717]">{item.name || "Unknown"}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#EEEAE6]">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(4, (item.durationSeconds / max) * 100)}%` }} />
              </div>
              <span className="text-right text-[#7E6F65]">{formatHours(item.durationSeconds)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ToggleRow({ label, enabled = true }: { label: string; enabled?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[#EFE8E2] py-4 last:border-0">
      <span className="text-base text-[#171717]">{label}</span>
      <span className={`flex h-8 w-14 items-center rounded-full p-1 transition ${enabled ? "justify-end bg-brand" : "justify-start bg-[#DDD6D0]"}`}>
        <span className="h-6 w-6 rounded-full bg-white shadow-sm" />
      </span>
    </div>
  );
}

export default function EmployeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const employeeId = String(params.id ?? "");
  const { authHeaders, apiBase, dateRange } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [employee, setEmployee] = useState<ApiUser | null>(null);
  const [teamName, setTeamName] = useState("Unassigned");
  const [timeline, setTimeline] = useState<TimelineEmployee | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData>({});
  const [usage, setUsage] = useState<UsageReport>({ items: [], categories: [] });
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [selectedScreenshot, setSelectedScreenshot] = useState<ScreenshotItem | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authHeaders || !employeeId) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString(),
        }).toString();
        const [usersRes, teamsRes, timelineRes, analyticsRes, usageRes, screenshotsRes] = await Promise.all([
          fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/web/teams`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/web/dashboard/activity-timeline?${query}`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/web/dashboard/analytics?userId=${employeeId}&${query}`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/web/dashboard/usage-report?userId=${employeeId}&${query}`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/agent/screenshots?userId=${employeeId}&limit=24&${query}`, { headers: authHeaders, credentials: "include" }),
        ]);

        const [usersData, teamsData, timelineData, analyticsData, usageData, screenshotsData] = await Promise.all([
          usersRes.json(),
          teamsRes.json(),
          timelineRes.json(),
          analyticsRes.json(),
          usageRes.json(),
          screenshotsRes.json(),
        ]);

        const userList = (usersData.success ? usersData.data : []) as ApiUser[];
        const teamList = (teamsData.success ? teamsData.data : []) as ApiTeam[];
        const foundUser = userList.find((item) => item.id === employeeId) ?? null;
        const foundTeam = teamList.find((team) => team.members?.some((member) => member.id === employeeId));
        const foundTimeline = ((timelineData.success ? timelineData.data?.employees : []) as TimelineEmployee[] | undefined)?.find(
          (item) => item.userId === employeeId,
        );

        setEmployee(foundUser);
        setTeamName(foundTeam?.name ?? "Unassigned");
        setTimeline(foundTimeline ?? null);
        setAnalytics((analyticsData.success ? analyticsData.data : {}) as AnalyticsData);
        setUsage((usageData.success ? usageData.data : { items: [], categories: [] }) as UsageReport);
        setScreenshots((screenshotsData.success ? screenshotsData.data : []) as ScreenshotItem[]);
      } catch (error) {
        console.error("Failed to load employee profile", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [authHeaders, apiBase, dateRange, employeeId]);

  const displayName = employee?.fullName ?? timeline?.employeeName ?? "Employee";
  const email = employee?.email ?? timeline?.email ?? "";
  const timelineWorkSeconds = toFiniteSeconds(timeline?.workSeconds);
  const timelineActiveSeconds = toFiniteSeconds(timeline?.activeSeconds);
  const timelineIdleSeconds = toFiniteSeconds(timeline?.idleSeconds);
  const analyticsWorkSeconds = toFiniteSeconds(analytics.workSeconds);
  const analyticsActiveSeconds = toFiniteSeconds(analytics.activeSeconds);
  const analyticsIdleSeconds = toFiniteSeconds(analytics.idleSeconds);
  const hasTimelineMetrics = Boolean(timeline) && timelineWorkSeconds > 0;
  const computerSeconds = hasTimelineMetrics ? timelineWorkSeconds : analyticsWorkSeconds;
  const activeSeconds = Math.min(hasTimelineMetrics ? timelineActiveSeconds : analyticsActiveSeconds, computerSeconds);
  const idleSeconds = hasTimelineMetrics
    ? Math.min(timelineIdleSeconds || Math.max(computerSeconds - activeSeconds, 0), computerSeconds)
    : Math.min(analyticsIdleSeconds || Math.max(computerSeconds - activeSeconds, 0), computerSeconds);
  const manualSeconds = toFiniteSeconds(analytics.manualSeconds);
  const workSeconds = computerSeconds + manualSeconds;
  const activityPercent = computerSeconds > 0 ? Math.min(100, Math.round((activeSeconds / computerSeconds) * 100)) : 0;
  const activeApp = timeline?.topApps[0]?.name ?? usage.items[0]?.name ?? "-";
  const hourLevels = useMemo(() => segmentHourLevels(timeline?.segments ?? []), [timeline?.segments]);
  const dailyActivityBars = useMemo(
    () => buildDailyActivityBars(timeline?.segments ?? [], dateRange.startDate, dateRange.endDate, manualSeconds),
    [dateRange.endDate, dateRange.startDate, manualSeconds, timeline?.segments],
  );
  const appItems = usage.items.filter((item) => item.targetType === "APP" || !item.domain);
  const websiteItems = usage.items.filter((item) => item.domain || item.targetType === "DOMAIN" || item.targetType === "URL");
  const productiveSeconds = toFiniteSeconds(usage.categories.find((item) => item.category === "PRODUCTIVE")?.durationSeconds);
  const neutralSeconds = toFiniteSeconds(usage.categories.find((item) => item.category === "NEUTRAL")?.durationSeconds);
  const unproductiveSeconds = toFiniteSeconds(usage.categories.find((item) => item.category === "UNPRODUCTIVE")?.durationSeconds);
  const categoryTotal = Math.max(productiveSeconds + neutralSeconds + unproductiveSeconds, 1);
  const productivity = Math.round((productiveSeconds / categoryTotal) * 100);
  const rangeLabel = dateRange.label || `${dateRange.startDate.toLocaleDateString()} - ${dateRange.endDate.toLocaleDateString()}`;
  const selectedScreenshotIndex = selectedScreenshot ? screenshots.findIndex((shot) => shot.id === selectedScreenshot.id) : -1;
  const canNavigateScreenshots = screenshots.length > 1 && selectedScreenshotIndex >= 0;
  const screenshotPosition = selectedScreenshotIndex >= 0 ? selectedScreenshotIndex + 1 : 0;

  const showPreviousScreenshot = () => {
    if (!canNavigateScreenshots) return;
    const previousIndex = selectedScreenshotIndex === 0 ? screenshots.length - 1 : selectedScreenshotIndex - 1;
    setSelectedScreenshot(screenshots[previousIndex] ?? null);
  };

  const showNextScreenshot = () => {
    if (!canNavigateScreenshots) return;
    const nextIndex = selectedScreenshotIndex === screenshots.length - 1 ? 0 : selectedScreenshotIndex + 1;
    setSelectedScreenshot(screenshots[nextIndex] ?? null);
  };

  useEffect(() => {
    if (!selectedScreenshot) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") showPreviousScreenshot();
      if (event.key === "ArrowRight") showNextScreenshot();
      if (event.key === "Escape") setSelectedScreenshot(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canNavigateScreenshots, screenshots, selectedScreenshot, selectedScreenshotIndex]);

  const tabs: Array<{ id: TabType; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "screenshots", label: "Screenshots", icon: Camera },
    { id: "activity", label: "Activity", icon: LineChart },
    { id: "apps", label: "Apps & Websites", icon: Laptop },
    { id: "calls", label: "Calls", icon: Phone },
    { id: "video", label: "Video Analysis", icon: Video },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "ai", label: "AI Insights", icon: Brain },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button onClick={() => router.push("/dashboard/employees")} className="inline-flex items-center gap-2 text-base text-[#7E6F65] transition hover:text-brand">
          <ArrowLeft className="h-4 w-4" />
          Back to Employees
        </button>
      </div>

      <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-5">
            <div className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full bg-[#F2EFEC] text-xl font-medium text-[#171717]">
              {initials(displayName)}
              <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-[#F8F5F1] bg-[#2DBE83]" />
            </div>
            <div>
              <h1 className="text-[24px] font-medium leading-tight text-[#171717]">{displayName}</h1>
              <p className="mt-1 text-sm text-[#7E6F65]">{email}</p>
              <p className="mt-1 text-sm text-[#7E6F65]">
                {teamName} - {employee?.role ?? "EMPLOYEE"} - {relativeTime(timeline?.lastActiveAt ?? null)}
              </p>
            </div>
          </div>
          <DashboardDateFilter />
        </div>

        <div className="flex items-center gap-3 lg:self-start">
          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen((current) => !current)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#E1D7CE] bg-white text-[#7E6F65] transition hover:bg-[#FCFAF8] hover:text-[#171717]"
              aria-label="Open employee actions"
              aria-expanded={actionsOpen}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {actionsOpen ? (
              <div className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-lg border border-[#E1D7CE] bg-white p-1.5 shadow-[0_16px_36px_rgba(45,42,38,0.16)]">
                <button
                  type="button"
                  onClick={() => setActionsOpen(false)}
                  className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-medium text-[#DC2626] transition hover:bg-rose-50"
                >
                  <Ban className="h-4 w-4" />
                  Deactivate
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="flex gap-5 overflow-x-auto border-b border-[#DDD2C9]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition ${
                isActive ? "border-brand text-brand" : "border-transparent text-[#7E6F65] hover:text-[#171717]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {loading ? (
        <div className="rounded-xl border border-[#DDD2C9] bg-white px-5 py-20 text-center text-sm font-medium uppercase tracking-widest text-[#B4AAA2]">
          Loading employee data...
        </div>
      ) : (
        <>
          {activeTab === "overview" && (
            <div className="space-y-5">
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatCard label="Working Hours" value={formatCompactDuration(workSeconds)} />
                <StatCard label="Active Hours" value={formatCompactDuration(activeSeconds)} tone="green" />
                <StatCard label="Idle Time" value={formatCompactDuration(idleSeconds)} tone="amber" />
                <StatCard label="Productive Time" value={formatCompactDuration(productiveSeconds)} tone="green" />
                <StatCard label="Productivity" value={`${productivity}%`} />
              </section>

              <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <StatCard label="Selected Range" value={rangeLabel} />
                <StatCard label="Active Ratio" value={formatPercentOf(activeSeconds, computerSeconds)} tone="green" />
                <StatCard label="Idle Ratio" value={formatPercentOf(idleSeconds, computerSeconds)} tone="amber" />
                <StatCard label="Active App" value={activeApp} />
              </section>

              <ActivityTimelineChart
                bars={dailyActivityBars}
                utilization={{ productiveSeconds, neutralSeconds, unproductiveSeconds }}
                rangeLabel={rangeLabel}
              />

              <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <UsageBars title="Top Apps" items={appItems} color="bg-[#2BAE78]" />
                <UsageBars title="Top Websites" items={websiteItems} color="bg-brand" />
              </section>
            </div>
          )}

          {activeTab === "screenshots" && (
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {screenshots.length === 0 ? (
                <div className="col-span-full rounded-xl border border-[#DDD2C9] bg-white p-14 text-center">
                  <Camera className="mx-auto h-8 w-8 text-[#B4AAA2]" />
                  <h3 className="mt-4 text-base font-medium text-[#171717]">No screenshots yet</h3>
                  <p className="mt-2 text-sm text-[#7E6F65]">This employee has no screenshots in the selected range.</p>
                </div>
              ) : (
                screenshots.map((shot) => (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() => setSelectedScreenshot(shot)}
                    className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white transition hover:border-brand/40 hover:shadow-sm"
                  >
                    <div className="relative aspect-video bg-[#F1ECE7]">
                      <Image
                        src={`${apiBase}/api/agent/screenshots/${shot.id}`}
                        alt={shot.windowTitle || "Employee screenshot"}
                        fill
                        unoptimized
                        sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover"
                      />
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium text-[#171717]">{shot.activeApplication || shot.windowTitle || "Screenshot"}</p>
                      <p className="mt-1 text-xs text-[#7E6F65]">{new Date(shot.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </button>
                ))
              )}
            </section>
          )}

          {activeTab === "activity" && (
            <div className="space-y-5">
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Working Hours" value={formatCompactDuration(workSeconds)} />
                <StatCard label="Active Hours" value={formatCompactDuration(activeSeconds)} tone="green" />
                <StatCard label="Idle Hours" value={formatCompactDuration(idleSeconds)} tone="amber" />
                <StatCard label="Productive Time" value={formatCompactDuration(productiveSeconds)} tone="green" />
              </section>

              <section className="rounded-xl border border-[#DDD2C9] bg-white p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-[#171717]">Hourly Active Time</h3>
                    <p className="mt-1 text-sm text-[#7E6F65]">Percentage of each hour with real mouse or keyboard input.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-[#7E6F65]">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#3478F6]" />
                      Active-time %
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#22C36A]" />
                      Active input tracked
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
                      Idle time is excluded
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-[42px_1fr] gap-3">
                  <div className="relative h-[230px] text-right text-[11px] font-medium text-[#7E6F65]">
                    <span className="absolute right-0 top-0">100%</span>
                    <span className="absolute right-0 top-1/4 -translate-y-1/2">75%</span>
                    <span className="absolute right-0 top-1/2 -translate-y-1/2">50%</span>
                    <span className="absolute right-0 top-3/4 -translate-y-1/2">25%</span>
                    <span className="absolute bottom-0 right-0">0%</span>
                    <span className="absolute -left-3 top-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[10px] uppercase tracking-wide text-[#9A9088]">
                      Active %
                    </span>
                  </div>

                  <div className="relative h-[230px]">
                    <div className="absolute inset-0 grid grid-rows-4 rounded-md border border-dashed border-[#344A68]/60">
                      <div className="border-b border-dashed border-[#344A68]/60" />
                      <div className="border-b border-dashed border-[#344A68]/60" />
                      <div className="border-b border-dashed border-[#344A68]/60" />
                      <div />
                    </div>
                    <div className="absolute inset-y-0 left-0 right-0 grid grid-cols-8">
                      {Array.from({ length: 8 }).map((_, index) => (
                        <span key={index} className="border-r border-dashed border-[#DCD3CB] last:border-r-0" />
                      ))}
                    </div>
                    <svg className="absolute inset-0 h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 1000 220">
                    <polyline
                      fill="none"
                      stroke="#3478F6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="10"
                      points={hourLevels
                          .map((item, index) => `${(index / Math.max(hourLevels.length - 1, 1)) * 1000},${220 - Math.min(100, item.level) * 2.2}`)
                        .join(" ")}
                    />
                  </svg>
                    <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-[11px] font-medium text-[#6C7A9C]">
                      <span>12AM</span>
                      <span>3AM</span>
                      <span>6AM</span>
                      <span>9AM</span>
                      <span>12PM</span>
                      <span>3PM</span>
                      <span>6PM</span>
                      <span>9PM</span>
                      <span>11PM</span>
                    </div>
                    <span className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-[11px] font-medium uppercase tracking-wide text-[#9A9088]">
                      Time of day
                    </span>
                  </div>
                </div>
                <p className="mt-14 text-xs text-[#7E6F65]">
                  100% means the full hour had active mouse or keyboard input. 0% means no active input was recorded in that hour.
                </p>
              </section>

              <section className="rounded-xl border border-[#DDD2C9] bg-white p-8">
                <h3 className="mb-7 text-lg font-medium text-[#171717]">Productivity Breakdown</h3>
                <div className="flex flex-wrap items-center gap-12">
                  <div
                    className="h-[172px] w-[172px] rounded-full"
                    style={{
                      background: `conic-gradient(#22C55E 0 ${(productiveSeconds / categoryTotal) * 100}%, #3B82F6 ${(productiveSeconds / categoryTotal) * 100}% ${((productiveSeconds + neutralSeconds) / categoryTotal) * 100}%, #EF4444 ${((productiveSeconds + neutralSeconds) / categoryTotal) * 100}% 100%)`,
                    }}
                  >
                    <div className="m-[30px] h-[112px] w-[112px] rounded-full bg-white" />
                  </div>
                  <div className="space-y-4 text-base">
                    <p className="flex items-center gap-3"><span className="h-4 w-4 rounded-full bg-[#22C55E]" /> Productive: {Math.round((productiveSeconds / categoryTotal) * 100)}%</p>
                    <p className="flex items-center gap-3"><span className="h-4 w-4 rounded-full bg-[#3B82F6]" /> Neutral: {Math.round((neutralSeconds / categoryTotal) * 100)}%</p>
                    <p className="flex items-center gap-3"><span className="h-4 w-4 rounded-full bg-[#EF4444]" /> Unproductive: {Math.round((unproductiveSeconds / categoryTotal) * 100)}%</p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === "apps" && (
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <UsageBars title="Top Apps" items={appItems} color="bg-[#2BAE78]" />
              <UsageBars title="Top Websites" items={websiteItems} color="bg-brand" />
            </section>
          )}

          {activeTab === "ai" && (
            <div className="space-y-4">
              {[
                ["BURNOUT", "CRITICAL", "Burnout Risk Detected", `${displayName} has ${formatHours(workSeconds)} tracked in ${rangeLabel} with ${activityPercent}% activity. Review workload if this pattern continues.`, "10 min ago"],
                ["PRODUCTIVITY", "INFO", "Peak Performance", `${teamName} productivity is currently ${productivity}% for this employee in ${rangeLabel}.`, "25 min ago"],
                ["ANOMALY", "WARNING", "Unusual Activity Pattern", `${displayName} last checked in ${relativeTime(timeline?.lastActiveAt ?? null)}.`, "1 hr ago"],
              ].map(([tag, severity, title, body, time]) => (
                <section key={title} className="rounded-xl border border-[#DDD2C9] bg-white p-5">
                  <div className="flex justify-between gap-4">
                    <div>
                      <div className="mb-4 flex gap-2">
                        <span className="rounded-full bg-[#FDEBE5] px-3 py-1 text-xs font-medium text-brand">{tag}</span>
                        <span className="rounded-full bg-[#FDEBE5] px-3 py-1 text-xs font-medium text-brand">{severity}</span>
                      </div>
                      <h3 className="text-lg font-medium text-[#171717]">{title}</h3>
                      <p className="mt-2 text-sm text-[#7E6F65]">{body}</p>
                      <div className="mt-4 flex gap-3">
                        <button className="rounded-xl border border-[#E1D7CE] px-4 py-2 text-sm font-medium">Acknowledge</button>
                        <button className="rounded-xl border border-[#E1D7CE] px-4 py-2 text-sm font-medium">Share</button>
                      </div>
                    </div>
                    <span className="text-sm text-[#7E6F65]">{time}</span>
                  </div>
                </section>
              ))}
            </div>
          )}

          {activeTab === "settings" && (
            <section className="max-w-[640px] rounded-xl border border-[#DDD2C9] bg-white p-8">
              <h3 className="mb-6 text-lg font-medium text-[#171717]">Monitoring Configuration</h3>
              <ToggleRow label="Screenshots" />
              <ToggleRow label="App Tracking" />
              <ToggleRow label="URL Tracking" />
              <ToggleRow label="Activity Level Tracking" />
              <ToggleRow label="Call Recording" />
              <ToggleRow label="Video Analysis" />
              <ToggleRow label="Keyboard Activity" />
              <ToggleRow label="Stealth Mode" enabled={false} />
            </section>
          )}

          {["calls", "video", "reports"].includes(activeTab) && (
            <section className="rounded-xl border border-[#DDD2C9] bg-white p-16 text-center">
              <BarChart3 className="mx-auto h-8 w-8 text-[#B4AAA2]" />
              <h3 className="mt-4 text-lg font-medium capitalize text-[#171717]">{activeTab} data</h3>
              <p className="mt-2 text-sm text-[#7E6F65]">No records available for this employee in the selected range.</p>
            </section>
          )}
        </>
      )}

      {selectedScreenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/75 p-6"
          onClick={() => setSelectedScreenshot(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#EFE8E2] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#171717]">
                  {selectedScreenshot.activeApplication || selectedScreenshot.windowTitle || "Screenshot"}
                </p>
                <p className="mt-0.5 text-xs text-[#7E6F65]">
                  {new Date(selectedScreenshot.capturedAt).toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedScreenshot(null)}
                className="rounded-lg border border-[#E1D7CE] px-3 py-1.5 text-sm font-medium text-[#171717] transition hover:bg-[#FCFAF8]"
              >
                Close
              </button>
            </div>
            <div className="relative h-[72vh] bg-[#171717]">
              {canNavigateScreenshots ? (
                <>
                  <button
                    type="button"
                    onClick={showPreviousScreenshot}
                    className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/95 text-[#171717] shadow-xl transition hover:bg-white"
                    title="Previous screenshot"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={showNextScreenshot}
                    className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/95 text-[#171717] shadow-xl transition hover:bg-white"
                    title="Next screenshot"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-[#171717] shadow-lg">
                    {screenshotPosition} / {screenshots.length}
                  </div>
                </>
              ) : null}
              <Image
                src={`${apiBase}/api/agent/screenshots/${selectedScreenshot.id}`}
                alt={selectedScreenshot.windowTitle || "Employee screenshot"}
                fill
                unoptimized
                sizes="100vw"
                className="object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
