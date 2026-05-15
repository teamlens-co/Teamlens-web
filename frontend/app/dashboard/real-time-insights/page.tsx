"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Clock,
  Coffee,
  Download,
  Monitor,
  RefreshCw,
  Search,
  TimerOff,
  TrendingDown,
} from "lucide-react";
import { useAuth, type Role } from "../../../contexts/AuthContext";
import DashboardDateFilter from "../../../components/DashboardDateFilter";
import ThemedSelect from "../../../components/ThemedSelect";

type ApiUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status?: string;
};

type ApiTeam = {
  id: string;
  name: string;
  members?: Array<{ id: string }>;
};

type TimelineEmployee = {
  userId: string;
  employeeName: string;
  activeSeconds: number;
  workSeconds: number;
  idleSeconds?: number;
  unproductiveSeconds?: number;
  utilizationPercent: number;
  lastActiveAt: string | null;
  topApps: Array<{ name: string; seconds: number }>;
};

type TimesheetEntry = {
  id: string;
  userId: string;
  employeeName: string;
  teamName: string | null;
  clockInAt: string;
  clockOutAt: string | null;
  workSeconds: number;
  activeSeconds: number;
  isCurrentlyWorking: boolean;
};

type AttendanceResponse = {
  success: boolean;
  data?: {
    timesheets: TimesheetEntry[];
  };
  message?: string;
};

type ScreenshotItem = {
  id: string;
  activeApplication?: string | null;
  windowTitle?: string | null;
  capturedAt: string;
};

type UsageCategory = {
  category: "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";
  durationSeconds: number;
};

type InsightStatus = "active" | "idle" | "break" | "offline" | "absent";

type InsightRow = {
  id: string;
  name: string;
  email: string;
  initials: string;
  teamName: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  currentApp: string;
  currentWindow: string;
  lastActiveAt: string | null;
  activeSeconds: number;
  workSeconds: number;
  unproductiveSeconds: number;
  productivity: number;
  status: InsightStatus;
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "TL";

const titleCase = (value: string) =>
  value
    .replace(/\.exe$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase());

const friendlyAppName = (value?: string | null) => {
  const key = (value ?? "").trim().toLowerCase();
  if (!key) return "No active app";
  const appNameMap: Record<string, string> = {
    "brave.exe": "Brave Browser",
    brave: "Brave Browser",
    "chrome.exe": "Google Chrome",
    chrome: "Google Chrome",
    "code.exe": "Visual Studio Code",
    code: "Visual Studio Code",
    "msedge.exe": "Microsoft Edge",
    msedge: "Microsoft Edge",
  };
  return appNameMap[key] ?? titleCase(key);
};

const isRecentlyActive = (value: string | null) => {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && Date.now() - parsed <= 10 * 60 * 1000;
};

const formatClock = (value: string | null) => {
  if (!value) return "--:--";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${time} (${timeZone})`;
};

const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
};

const relativeTime = (value: string | null) => {
  if (!value) return "No activity";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
};

const csvEscape = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const downloadCsv = (filename: string, headers: string[], records: Array<Array<string | number | null>>) => {
  const csv = [headers, ...records].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const statusConfig: Record<
  InsightStatus,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  active: { label: "Active", className: "border-emerald-100 bg-emerald-50 text-emerald-700", icon: Activity },
  idle: { label: "Idle", className: "border-amber-100 bg-amber-50 text-amber-700", icon: TimerOff },
  break: { label: "On Break", className: "border-sky-100 bg-sky-50 text-sky-700", icon: Coffee },
  offline: { label: "Offline", className: "border-slate-200 bg-slate-50 text-slate-600", icon: Clock },
  absent: { label: "Absent", className: "border-[#DDD6D0] bg-[#ECE7E2] text-[#70675F]", icon: TimerOff },
};

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  className = "border-[#DDD2C9] bg-white text-[#302C28]",
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 shadow-[0_1px_2px_rgba(45,42,38,0.03)] ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold text-current/75">{label}</p>
          <p className="mt-3 text-[26px] font-semibold leading-none">{value}</p>
          {subValue ? <p className="mt-1 text-[12px] font-medium text-current/55">{subValue}</p> : null}
        </div>
        <Icon className="h-5 w-5 text-current/60" />
      </div>
    </div>
  );
}

export default function RealTimeInsightsPage() {
  const { apiBase, authHeaders, user, selectedUserId, dateRange } = useAuth();
  const [rows, setRows] = useState<InsightRow[]>([]);
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [teamFilter, setTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<InsightStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [totalUnproductiveSeconds, setTotalUnproductiveSeconds] = useState(0);

  const loadInsights = useCallback(async () => {
    if (!authHeaders || !user) return;

    setError("");
    // Only show full loading spinner on initial load to avoid flicker during background refreshes
    if (rows.length === 0) setLoading(true);

    try {
      console.log("[RealTimeInsights] Loading data for range:", dateRange.startDate.toISOString(), "to", dateRange.endDate.toISOString());

      const rangeParams = {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      };

      const [usersRes, teamsRes, timelineRes, attendanceRes, usageRes] = await Promise.all([
        user.role === "MANAGER"
          ? fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" })
          : Promise.resolve(null),
        user.role === "MANAGER"
          ? fetch(`${apiBase}/api/web/teams`, { headers: authHeaders, credentials: "include" })
          : Promise.resolve(null),
        fetch(`${apiBase}/api/web/dashboard/activity-timeline?${new URLSearchParams(rangeParams).toString()}`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/api/web/dashboard/attendance?${new URLSearchParams(rangeParams).toString()}`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/api/web/dashboard/usage-report?${new URLSearchParams(rangeParams).toString()}`, {
          headers: authHeaders,
          credentials: "include",
        }),
      ]);

      const [usersData, teamsData, timelineData, attendanceData, usageData] = await Promise.all([
        usersRes ? usersRes.json() : Promise.resolve({ success: true, data: [user] }),
        teamsRes ? teamsRes.json() : Promise.resolve({ success: true, data: [] }),
        timelineRes.json(),
        attendanceRes.json() as Promise<AttendanceResponse>,
        usageRes.json(),
      ]);

      console.log("[RealTimeInsights] Data fetched:", {
        users: usersData.success,
        timeline: timelineData.success,
        attendance: attendanceData.success,
        usage: usageData.success
      });

      const apiUsers = ((usersData.success ? usersData.data : [user]) as ApiUser[]).filter((item) =>
        user.role === "MANAGER" ? item.role === "EMPLOYEE" : item.id === user.id,
      );
      const teamList = (teamsData.success ? teamsData.data : []) as ApiTeam[];
      const timeline = ((timelineData.success ? timelineData.data?.employees : []) ?? []) as TimelineEmployee[];
      const timesheets = (attendanceData.success ? attendanceData.data?.timesheets ?? [] : []) as TimesheetEntry[];
      const categories = ((usageData.success ? usageData.data?.categories : []) ?? []) as UsageCategory[];
      
      setTotalUnproductiveSeconds(
        categories
          .filter((category) => category.category === "UNPRODUCTIVE")
          .reduce((sum, category) => sum + Number(category.durationSeconds || 0), 0),
      );

      const timelineByUser = new Map(timeline.map((item) => [item.userId, item]));
      const latestSessionByUser = new Map<string, TimesheetEntry>();
      
      // Ensure we get the absolute latest session for each user (current day)
      for (const session of timesheets) {
        const previous = latestSessionByUser.get(session.userId);
        if (!previous || new Date(session.clockInAt).getTime() > new Date(previous.clockInAt).getTime()) {
          latestSessionByUser.set(session.userId, session);
        }
      }

      // Optimization: Only fetch latest screenshot for each employee
      const screenshotPairs = await Promise.all(
        apiUsers.map(async (employee) => {
          try {
            const params = new URLSearchParams({
              userId: employee.id,
              limit: "1",
              // Fetch very recent screenshots first
            });
            const response = await fetch(`${apiBase}/api/agent/screenshots?${params.toString()}`, {
              headers: authHeaders,
              credentials: "include",
            });
            const payload = await response.json();
            return [employee.id, payload.success && payload.data?.[0] ? payload.data[0] : null] as const;
          } catch {
            return [employee.id, null] as const;
          }
        }),
      );
      const screenshotsByUser = new Map<string, ScreenshotItem | null>(screenshotPairs);

      setTeams(teamList);
      setRows(
        apiUsers.map((employee) => {
          const activity = timelineByUser.get(employee.id);
          const session = latestSessionByUser.get(employee.id);
          const screenshot = screenshotsByUser.get(employee.id);
          const teamName = teamList.find((team) => team.members?.some((member) => member.id === employee.id))?.name ?? "Unassigned";
          
          const currentlyWorking = Boolean(session?.isCurrentlyWorking);
          // A user is "active" if they have an ongoing session AND have sent a signal in the last 10 mins
          const recentlyActive = isRecentlyActive(activity?.lastActiveAt ?? null);
          
          let status: InsightStatus = "absent";
          if (currentlyWorking) {
            status = recentlyActive ? "active" : "idle";
          } else if (session?.clockOutAt) {
            status = "offline";
          }

          return {
            id: employee.id,
            name: employee.fullName,
            email: employee.email,
            initials: initials(employee.fullName),
            teamName,
            clockInAt: session?.clockInAt ?? null,
            clockOutAt: session?.clockOutAt ?? null,
            currentApp: friendlyAppName(screenshot?.activeApplication ?? activity?.topApps?.[0]?.name),
            currentWindow: (screenshot?.windowTitle || activity?.topApps?.[0]?.name || "No active window").trim(),
            lastActiveAt: activity?.lastActiveAt ?? screenshot?.capturedAt ?? null,
            activeSeconds: activity?.activeSeconds ?? session?.activeSeconds ?? 0,
            workSeconds: activity?.workSeconds ?? session?.workSeconds ?? 0,
            unproductiveSeconds: activity?.unproductiveSeconds ?? 0,
            productivity: Math.min(100, Math.max(0, Math.round(activity?.utilizationPercent ?? 0))),
            status,
          };
        }),
      );
      setLastUpdated(new Date());
    } catch (requestError) {
      console.error("[RealTimeInsights] Failed to load real-time insights", requestError);
      setError("Unable to load real-time insights. Check connection.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, dateRange, user, rows.length]);

  useEffect(() => {
    void loadInsights();
    const timer = window.setInterval(loadInsights, 30_000);
    return () => window.clearInterval(timer);
  }, [loadInsights]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesTeam = teamFilter === "all" || row.teamName === teamFilter;
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesQuery =
        !needle ||
        `${row.name} ${row.email} ${row.teamName} ${row.currentApp} ${row.currentWindow}`.toLowerCase().includes(needle);
      return matchesTeam && matchesStatus && matchesQuery;
    });
  }, [query, rows, statusFilter, teamFilter]);

  const activeCount = rows.filter((row) => row.status === "active").length;
  const idleCount = rows.filter((row) => row.status === "idle").length;
  const absentCount = rows.filter((row) => row.status === "absent").length;
  const handleDownload = () => {
    downloadCsv(
      `real-time-insights-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Employee", "Email", "Team", "Clock In", "Clock Out", "Status", "Current App", "Current Window", "Active Time", "Work Time", "Unproductive Time", "Productivity", "Last Active"],
      filteredRows.map((row) => [
        row.name,
        row.email,
        row.teamName,
        formatClock(row.clockInAt),
        formatClock(row.clockOutAt),
        statusConfig[row.status].label,
        row.currentApp,
        row.currentWindow,
        formatDuration(row.activeSeconds),
        formatDuration(row.workSeconds),
        formatDuration(row.unproductiveSeconds),
        `${row.productivity}%`,
        relativeTime(row.lastActiveAt),
      ]),
    );
  };

  return (
    <div className="space-y-5">
      <header>
        <div>
          <h1 className="text-[22px] font-semibold leading-tight text-[#302C28]">Real-time insights</h1>
          <p className="mt-1 text-[13px] font-medium text-[#8C837B]">
            Who is working, what app they are using, and their latest activity signal.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <DashboardDateFilter />
          <ThemedSelect
            label="Teams"
            value={teamFilter}
            onChange={setTeamFilter}
            minWidth={180}
            options={[{ label: "All Teams", value: "all" }, ...teams.map((team) => ({ label: team.name, value: team.name }))]}
          />
          <ThemedSelect
            label="Statuses"
            value={statusFilter}
            onChange={(nextValue) => setStatusFilter(nextValue as InsightStatus | "all")}
            minWidth={170}
            options={[
              { label: "All Statuses", value: "all" },
              { label: "Active", value: "active" },
              { label: "Idle", value: "idle" },
              { label: "Offline", value: "offline" },
              { label: "Absent", value: "absent" },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C837B]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search employee or app"
              className="h-9 w-full min-w-[240px] rounded-md border border-transparent bg-[#F1ECE7] pl-9 pr-3 text-[13px] font-medium text-[#302C28] outline-none transition placeholder:text-[#8C837B] focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/10"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadInsights()}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#E1D7CE] bg-white px-3 text-[13px] font-medium text-[#302C28] transition hover:bg-[#FCFAF8]"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={filteredRows.length === 0}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-primary/30 bg-white px-3 text-[13px] font-medium text-primary transition hover:bg-[var(--brand-tint)]"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active" value={`${activeCount}`} subValue={`/ ${rows.length}`} icon={Monitor} />
        <StatCard label="Idle" value={`${idleCount}`} icon={TimerOff} />
        <StatCard
          label="Unproductive Hours ↘"
          value={formatDuration(totalUnproductiveSeconds)}
          icon={TrendingDown}
          className="border-rose-100 bg-rose-50 text-rose-700"
        />
        <StatCard label="Absent" value={`${absentCount}`} icon={Coffee} className="border-sky-100 bg-sky-50 text-sky-800" />
      </div>

      <section className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFE8E2] px-5 py-3">
          <div>
            <h2 className="text-[13px] font-semibold text-[#302C28]">Employee activity now</h2>
            <p className="mt-0.5 text-[12px] font-medium text-[#8C837B]">
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Refreshes every 30 seconds"}
            </p>
          </div>
          <span className="rounded-full bg-[var(--brand-tint)] px-2 py-0.5 text-[11px] font-medium text-primary">
            {filteredRows.length} visible
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left">
            <thead>
              <tr className="border-b border-[#EFE8E2] bg-[#FAF8F6] text-[11px] font-semibold uppercase tracking-wider text-[#8C837B]">
                <th className="px-5 py-3">Employee Name</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Clock-In</th>
                <th className="px-4 py-3">Clock-Out</th>
                <th className="px-4 py-3">Current App</th>
                <th className="px-4 py-3">Doing Now</th>
                <th className="px-4 py-3">Real-Time Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1ECE7]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-[11px] font-medium uppercase tracking-widest text-[#B4AAA2]">
                    Loading real-time insights...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[13px] font-medium text-rose-600">
                    <AlertCircle className="mx-auto mb-2 h-5 w-5" />
                    {error}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[13px] font-medium text-[#8C837B]">
                    No employees match these filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const StatusIcon = statusConfig[row.status].icon;
                  return (
                    <tr key={row.id} className="transition hover:bg-[#FCFAF8]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/70 text-[13px] font-semibold text-white">
                            {row.initials}
                            <span className="absolute -bottom-0.5 -right-0.5 rounded-full border border-white bg-amber-100 px-1 text-[9px] font-semibold text-amber-700">
                              P
                            </span>
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-[#302C28]">{row.name}</span>
                            <span className="block truncate text-[11px] font-medium text-[#8C837B]">{row.email}</span>
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[180px] px-4 py-3 text-[13px] font-semibold text-[#302C28]">
                        <span className="block truncate">{row.teamName}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] font-semibold text-[#302C28]">{formatClock(row.clockInAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] font-semibold text-[#302C28]">{formatClock(row.clockOutAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#302C28]">
                          <Monitor className="h-4 w-4 text-[#8C837B]" />
                          <span className="truncate">{row.currentApp}</span>
                        </div>
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <p className="truncate text-[12.5px] font-medium text-[#302C28]" title={row.currentWindow}>
                          {row.currentWindow}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-[#8C837B]">
                          Active {formatDuration(row.activeSeconds)} · Last signal {relativeTime(row.lastActiveAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex h-9 min-w-[170px] items-center gap-2 rounded-full border px-3 text-[13px] font-semibold ${statusConfig[row.status].className}`}
                        >
                          <StatusIcon className="h-4 w-4" />
                          {statusConfig[row.status].label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
