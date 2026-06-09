"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Camera, Clock3, RefreshCw, Users, CheckCircle2, XCircle, Activity } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import DashboardDateFilter from "../../components/DashboardDateFilter";
import ThemedSelect from "../../components/ThemedSelect";
import ActivityTimelineChart, { buildDailyActivityBars } from "../../components/ActivityTimelineChart";

type DashboardAnalytics = {
  workSeconds?: number;
  activeSeconds?: number;
  idleSeconds?: number;
  productivityPercent?: number;
  totalTrackedSeconds?: number;
  totalActiveSeconds?: number;
  totalIdleSeconds?: number;
  avgActivityPercent?: number;
};

type ApiUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
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
  segments?: TimelineSegment[];
};

type UsageItem = {
  name: string;
  appName?: string;
  durationSeconds: number;
};

type UsageCategory = {
  category: "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";
  durationSeconds: number;
};

const formatHours = (seconds: number) => (Math.max(0, seconds) / 3600).toFixed(1);

const formatTime = (date: Date) =>
  date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  variant = "brand",
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "brand" | "success" | "danger" | "neutral";
}) {
  const variantStyles = {
    brand: "bg-[#FDEBE5] text-brand",
    success: "bg-[#E7F9F0] text-[#24C98B]",
    danger: "bg-[#FEECEF] text-[#F47C8E]",
    neutral: "bg-[#F0F2F5] text-[#7E6F65]",
  };

  return (
    <div className="rounded-xl border border-[#E7E0DA] bg-[#FFFDFB] p-4 shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
      <div className="mb-4 flex items-start justify-between">
        <p className="text-[11px] font-medium text-[#9A9088]">{label}</p>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${variantStyles[variant]}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="text-[22px] font-semibold leading-none text-[#34302B]">{value}</p>
      <p className="mt-3 text-[11px] font-medium text-[#9A9088]">{sub}</p>
    </div>
  );
}

export default function DashboardOverview() {
  const {
    authHeaders,
    apiBase,
    dateRange,
    user,
  } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<DashboardAnalytics>({});
  const [employees, setEmployees] = useState<ApiUser[]>([]);
  const [allEmployees, setAllEmployees] = useState<ApiUser[]>([]);
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [dashboardTeamId, setDashboardTeamId] = useState("");
  const [dashboardUserId, setDashboardUserId] = useState("");
  const [timelineEmployees, setTimelineEmployees] = useState<TimelineEmployee[]>([]);
  const [screenshotCount, setScreenshotCount] = useState(0);
  const [topApplications, setTopApplications] = useState<UsageItem[]>([]);
  const [activityUtilization, setActivityUtilization] = useState({
    productiveSeconds: 0,
    neutralSeconds: 0,
    unproductiveSeconds: 0,
  });
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchDashboardData = useCallback(async () => {
    if (!authHeaders) return;

    setLoading(true);
    try {
      const rangeParams = {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      };
      let analyticsEndpoint = `${apiBase}/api/web/dashboard/analytics`;
      const analyticsParams: Record<string, string> = { ...rangeParams };
      const selectedIndividualId = dashboardUserId;

      if (selectedIndividualId && selectedIndividualId !== user?.id) {
        analyticsParams.userId = selectedIndividualId;
      } else if (dashboardTeamId) {
        analyticsEndpoint = `${apiBase}/api/web/teams/${dashboardTeamId}/analytics`;
      }

      const [analyticsRes, usersRes, teamsRes, timelineRes, usageRes] = await Promise.all([
        fetch(`${analyticsEndpoint}?${new URLSearchParams(analyticsParams).toString()}`, {
          headers: authHeaders,
          credentials: "include",
        }),
        user?.role === "MANAGER" ? fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" }) : Promise.resolve(null),
        user?.role === "MANAGER" ? fetch(`${apiBase}/api/web/teams`, { headers: authHeaders, credentials: "include" }) : Promise.resolve(null),
        fetch(`${apiBase}/api/web/dashboard/activity-timeline?${new URLSearchParams(rangeParams).toString()}`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(
          `${apiBase}/api/web/dashboard/usage-report?${new URLSearchParams({
            ...rangeParams,
            ...(selectedIndividualId && selectedIndividualId !== user?.id ? { userId: selectedIndividualId } : {}),
            ...(!selectedIndividualId && dashboardTeamId ? { teamId: dashboardTeamId } : {}),
          }).toString()}`,
          { headers: authHeaders, credentials: "include" },
        ),
      ]);

      const [analyticsJson, usersJson, teamsJson, timelineJson, usageJson] = await Promise.all([
        analyticsRes.json(),
        usersRes ? usersRes.json() : Promise.resolve(null),
        teamsRes ? teamsRes.json() : Promise.resolve(null),
        timelineRes.json(),
        usageRes.json(),
      ]);

      if (analyticsJson.success) setAnalytics(analyticsJson.data);

      const allUsers = (usersJson?.success ? usersJson.data : user ? [user] : []) as ApiUser[];
      const teamList = (teamsJson?.success ? teamsJson.data : []) as ApiTeam[];
      const selectedTeam = dashboardTeamId ? teamList.find((team) => team.id === dashboardTeamId) : null;
      const teamScopedUsers = selectedTeam
        ? allUsers.filter((item) => selectedTeam.members?.some((member) => member.id === item.id))
        : allUsers;
      const scopedUsers = selectedIndividualId
        ? teamScopedUsers.filter((item) => item.id === selectedIndividualId)
        : teamScopedUsers;
      const scopedUserIds = new Set(scopedUsers.map((item) => item.id));

      const timelineRows = ((timelineJson.success ? timelineJson.data?.employees : []) ?? []) as TimelineEmployee[];
      const scopedTimelineRows = timelineRows.filter((item) => scopedUserIds.size === 0 || scopedUserIds.has(item.userId));

      setEmployees(scopedUsers);
      setAllEmployees(allUsers);
      setTeams(teamList);
      setTimelineEmployees(scopedTimelineRows);
      setTopApplications(((usageJson.success ? usageJson.data?.items : []) ?? []) as UsageItem[]);
      const usageCategories = ((usageJson.success ? usageJson.data?.categories : []) ?? []) as UsageCategory[];
      setActivityUtilization({
        productiveSeconds: Number(usageCategories.find((item) => item.category === "PRODUCTIVE")?.durationSeconds || 0),
        neutralSeconds: Number(usageCategories.find((item) => item.category === "NEUTRAL")?.durationSeconds || 0),
        unproductiveSeconds: Number(usageCategories.find((item) => item.category === "UNPRODUCTIVE")?.durationSeconds || 0),
      });

      const screenshotCounts = await Promise.all(
        scopedUsers.slice(0, 50).map(async (employee) => {
          const params = new URLSearchParams({
            userId: employee.id,
            limit: "5000",
            ...rangeParams,
          });
          const response = await fetch(`${apiBase}/api/agent/screenshots?${params.toString()}`, {
            headers: authHeaders,
            credentials: "include",
          });
          const json = await response.json();
          return json.success && Array.isArray(json.data) ? json.data.length : 0;
        }),
      );

      setScreenshotCount(screenshotCounts.reduce((sum, count) => sum + count, 0));
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to load dashboard data", error);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, apiBase, dashboardTeamId, dashboardUserId, dateRange, user]);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  const aggregatedBars = useMemo(() => {
    const allSegments = timelineEmployees.flatMap((emp) => emp.segments || []);
    return buildDailyActivityBars(allSegments, dateRange.startDate, dateRange.endDate);
  }, [timelineEmployees, dateRange.startDate, dateRange.endDate]);

  const timelineTrackedSeconds = timelineEmployees.reduce((sum, item) => sum + item.workSeconds, 0);
  const timelineActiveSeconds = timelineEmployees.reduce((sum, item) => sum + item.activeSeconds, 0);
  const timelineIdleSeconds = timelineEmployees.reduce((sum, item) => sum + item.idleSeconds, 0);
  const trackedSeconds = analytics.totalTrackedSeconds ?? (timelineTrackedSeconds || analytics.workSeconds) ?? 0;
  const activeSeconds = analytics.totalActiveSeconds ?? (timelineActiveSeconds || analytics.activeSeconds) ?? 0;
  const idleSeconds = analytics.totalIdleSeconds ?? (timelineIdleSeconds || analytics.idleSeconds) ?? Math.max(0, trackedSeconds - activeSeconds);
  const productivity = Math.min(
    100,
    Math.round(analytics.avgActivityPercent ?? analytics.productivityPercent ?? (trackedSeconds > 0 ? (activeSeconds / trackedSeconds) * 100 : 0)),
  );
  const activeAgents = timelineEmployees.filter((item) => item.lastActiveAt && Date.now() - new Date(item.lastActiveAt).getTime() <= 10 * 60 * 1000).length;
  const alertRows = timelineEmployees.filter((item) => item.workSeconds > 0 && item.utilizationPercent < 40).slice(0, 3);

  const metricCards = useMemo(
    () => [
      { label: "Work Hours", value: loading ? "..." : `${formatHours(trackedSeconds)}h`, sub: `${activeAgents} active now`, icon: Clock3 },
      { label: "Active Hours", value: loading ? "..." : `${formatHours(activeSeconds)}h`, sub: `${productivity}% active ratio`, icon: Clock3 },
      { label: "Idle Hours", value: loading ? "..." : `${formatHours(idleSeconds)}h`, sub: "No input time", icon: AlertTriangle },
      {
        label: "Productive",
        value: loading ? "..." : `${formatHours(activityUtilization.productiveSeconds)}h`,
        sub: "Categorized apps",
        icon: CheckCircle2,
        variant: "success" as const,
      },
      {
        label: "Unproductive",
        value: loading ? "..." : `${formatHours(activityUtilization.unproductiveSeconds)}h`,
        sub: "Categorized apps",
        icon: XCircle,
        variant: "danger" as const,
      },
      {
        label: "Neutral",
        value: loading ? "..." : `${formatHours(activityUtilization.neutralSeconds)}h`,
        sub: "Categorized apps",
        icon: Activity,
        variant: "neutral" as const,
      },
      { label: "Screenshots", value: loading ? "..." : String(screenshotCount), sub: "Selected range", icon: Camera },
      { label: "Total Employees", value: loading ? "..." : String(employees.length), sub: `${activeAgents} online`, icon: Users },
    ],
    [
      activeAgents,
      activeSeconds,
      employees.length,
      idleSeconds,
      loading,
      productivity,
      screenshotCount,
      trackedSeconds,
      activityUtilization,
    ],
  );

  const maxAppSeconds = Math.max(...topApplications.map((item) => item.durationSeconds), 1);
  const teamFilteredEmployees = useMemo(() => {
    if (!dashboardTeamId) return allEmployees;
    const selectedTeam = teams.find((team) => team.id === dashboardTeamId);
    if (!selectedTeam) return allEmployees;
    return allEmployees.filter((employee) => selectedTeam.members?.some((member) => member.id === employee.id));
  }, [allEmployees, dashboardTeamId, teams]);

  const handleTeamChange = (teamId: string) => {
    setDashboardTeamId(teamId);
    setDashboardUserId("");
  };
  const teamOptions = useMemo(
    () => [{ label: "All Teams", value: "" }, ...teams.map((team) => ({ label: team.name, value: team.id }))],
    [teams],
  );
  const employeeOptions = useMemo(
    () => [
      { label: "All Individuals", value: "" },
      ...teamFilteredEmployees.map((employee) => ({ label: employee.fullName, value: employee.id })),
    ],
    [teamFilteredEmployees],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-[18px] font-semibold leading-tight text-[#302C28]">Dashboard</h1>
          <p className="mt-1 text-[12px] font-medium text-[#8C837B]">Live team activity · Updated {formatTime(lastUpdated)}</p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-3">
          <DashboardDateFilter />
          {user?.role === "MANAGER" ? (
            <>
              <ThemedSelect
                label="Teams"
                value={dashboardTeamId}
                options={teamOptions}
                onChange={handleTeamChange}
                minWidth={210}
              />
              <ThemedSelect
                label="Individuals"
                value={dashboardUserId}
                options={employeeOptions}
                onChange={setDashboardUserId}
                minWidth={210}
              />
            </>
          ) : null}
          <button
            onClick={() => void fetchDashboardData()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-[#9A9088] transition hover:bg-[#F1ECE7] hover:text-[#4A423C]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      {timelineEmployees.length === 0 ? (
        <section className="rounded-xl border border-[#E7E0DA] bg-[#FFFDFB] px-5 py-12 text-center shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
          <p className="text-[12px] font-medium text-[#9A9088]">No activity data yet. Agents will populate this as they run.</p>
        </section>
      ) : (
        <ActivityTimelineChart
          bars={aggregatedBars}
          utilization={activityUtilization}
          rangeLabel={dateRange.label || `${dateRange.startDate.toLocaleDateString()} - ${dateRange.endDate.toLocaleDateString()}`}
          title="Activity Timeline"
          description="The same activity and utilization view used on employee profiles, aggregated for the selected filters."
        />
      )}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-[#E7E0DA] bg-[#FFFDFB] p-4 shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
          <h2 className="mb-3 text-[13px] font-semibold text-[#3A332E]">Recent Alerts</h2>
          <div className="space-y-2">
            {alertRows.length === 0 ? (
              <p className="rounded-xl bg-[#F8F5F1] px-3 py-8 text-center text-[12px] font-medium text-[#9A9088]">No alerts for the selected range.</p>
            ) : (
              alertRows.map((employee) => (
                <div key={employee.userId} className="flex items-start gap-3 rounded-xl bg-[#F8F5F1] px-3 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#E8A13A]" />
                  <div>
                    <p className="text-[11px] font-semibold text-[#4A423C]">{employee.employeeName}</p>
                    <p className="text-[11px] font-medium text-[#9A9088]">Productivity at {employee.utilizationPercent}% - below threshold</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#E7E0DA] bg-[#FFFDFB] p-4 shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
          <h2 className="text-[13px] font-semibold text-[#3A332E]">Top Applications</h2>
          <div className="mt-4 min-h-[112px] space-y-3">
            {topApplications.length === 0 ? (
              <div className="flex min-h-[112px] items-center justify-center text-[12px] font-medium text-[#B4AAA2]">No application data yet.</div>
            ) : (
              topApplications.slice(0, 5).map((item) => (
                <div key={item.name} className="grid grid-cols-[130px_1fr_64px] items-center gap-3 text-sm">
                  <span className="truncate text-[13px] font-medium text-[#4A423C]">{item.appName || item.name}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#EEEAE6]">
                    <div className="h-full rounded-full bg-[#2BAE78]" style={{ width: `${Math.max(4, (item.durationSeconds / maxAppSeconds) * 100)}%` }} />
                  </div>
                  <span className="text-right text-[11px] font-medium text-[#7E6F65]">{formatHours(item.durationSeconds)}h</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

