"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Clock,
  ExternalLink,
  Shield,
  Timer,
  Users,
} from "lucide-react";
import { useAuth, type Role } from "../../../../contexts/AuthContext";
import DashboardDateFilter from "../../../../components/DashboardDateFilter";

type TeamUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: string;
};

type Team = {
  id: string;
  name: string;
  managerId: string;
  createdAt: string;
  memberCount: number;
  members?: TeamUser[];
};

type MemberAnalytics = {
  userId: string;
  fullName: string;
  email: string;
  activeSeconds: number;
  trackedSeconds: number;
  workSeconds: number;
  manualSeconds: number;
  productivityPercent: number;
};

type TeamAnalytics = {
  team?: Team;
  start: string;
  end: string;
  memberCount: number;
  totalActiveSeconds: number;
  totalTrackedSeconds: number;
  avgActivityPercent: number;
  members: MemberAnalytics[];
};

const formatDuration = (seconds: number): string => {
  const total = Math.round(seconds || 0);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  return `${hrs}h ${mins}m`;
};

const formatDate = (value?: string): string => {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
};

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-[var(--surface-2)] p-4 shadow-[0_1px_2px_rgba(45,42,38,0.04)]">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function TeamDetailPage() {
  const params = useParams();
  const { user, authHeaders, apiBase, dateRange } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [analytics, setAnalytics] = useState<TeamAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const teamId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
  }, [params]);

  const loadTeam = useCallback(async () => {
    if (!authHeaders || !teamId || user?.role !== "MANAGER") return;

    setLoading(true);
    setError("");
    try {
      const rangeQuery = new URLSearchParams({
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      }).toString();

      const [teamResponse, analyticsResponse] = await Promise.all([
        fetch(`${apiBase}/api/web/teams/${teamId}`, { headers: authHeaders, credentials: "include" }),
        fetch(`${apiBase}/api/web/teams/${teamId}/analytics?${rangeQuery}`, {
          headers: authHeaders,
          credentials: "include",
        }),
      ]);

      const teamData = await teamResponse.json();
      const analyticsData = await analyticsResponse.json();

      if (!teamData.success) {
        setError(teamData.message || "Unable to load this team.");
        setTeam(null);
        setAnalytics(null);
        return;
      }

      setTeam(teamData.data);
      setAnalytics(analyticsData.success ? analyticsData.data : null);
      if (!analyticsData.success) {
        setError(analyticsData.message || "Team loaded, but analytics are unavailable.");
      }
    } catch {
      setError("Network error occurred while loading team details.");
      setTeam(null);
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, dateRange, teamId, user?.role]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  if (user?.role !== "MANAGER") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-[32px] border border-border bg-[var(--surface-2)] p-8 text-center shadow-sm">
        <Shield className="mb-6 h-14 w-14 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Access Restricted</h2>
        <p className="mt-2 max-w-sm text-[13px] font-medium text-muted-foreground">
          Only organization managers can view team performance pages.
        </p>
      </div>
    );
  }

  const members = analytics?.members ?? [];
  const roster = team?.members ?? [];
  const bestMember = members.reduce<MemberAnalytics | null>(
    (best, member) => (!best || member.productivityPercent > best.productivityPercent ? member : best),
    null,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            href="/dashboard/team"
            className="inline-flex items-center gap-2 text-[12px] font-medium text-muted-foreground transition hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to teams
          </Link>
          <p className="mt-5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Team performance detail
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {team?.name ?? (loading ? "Loading team..." : "Team details")}
          </h1>
          <p className="mt-2 text-[12.5px] font-medium text-muted-foreground">
            {formatDate(analytics?.start)} - {formatDate(analytics?.end)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <DashboardDateFilter />
          <div className="flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-2)] px-3 py-2 text-[12px] font-medium text-muted-foreground">
            <Users className="h-4 w-4 text-primary" />
            {analytics?.memberCount ?? team?.memberCount ?? 0} members
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/15 bg-destructive/5 px-4 py-3 text-[12.5px] font-medium text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-[var(--surface-2)] px-4 py-16 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Loading team detail...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <StatCard
              icon={Timer}
              label="Work Time"
              value={formatDuration(analytics?.totalTrackedSeconds ?? 0)}
              accent="border-primary/10 bg-[var(--brand-tint)] text-primary"
            />
            <StatCard
              icon={Clock}
              label="Active Time"
              value={formatDuration(analytics?.totalActiveSeconds ?? 0)}
              accent="border-emerald-100 bg-emerald-50 text-emerald-600"
            />
            <StatCard
              icon={Activity}
              label="Productivity"
              value={`${analytics?.avgActivityPercent ?? 0}%`}
              accent="border-amber-100 bg-amber-50 text-amber-600"
            />
            <StatCard
              icon={Users}
              label="Members"
              value={`${analytics?.memberCount ?? team?.memberCount ?? 0}`}
              accent="border-sky-100 bg-sky-50 text-sky-600"
            />
          </div>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-xl border border-border bg-[var(--surface-2)] p-5 shadow-[0_1px_2px_rgba(45,42,38,0.04)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-[13.5px] font-semibold text-foreground">Team Activity Mix</h2>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Active time against total tracked work for the current dashboard date range.
                  </p>
                </div>
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>

              <div className="mt-7 space-y-5">
                <div>
                  <div className="mb-2 flex justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Active Time</span>
                    <span>{analytics?.avgActivityPercent ?? 0}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, analytics?.avgActivityPercent ?? 0)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-[10px] font-medium text-muted-foreground">Tracked</p>
                    <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                      {formatDuration(analytics?.totalTrackedSeconds ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-4">
                    <p className="text-[10px] font-medium text-muted-foreground">Top Performer</p>
                    <p className="mt-2 truncate text-[13px] font-semibold text-foreground">
                      {bestMember?.fullName ?? "No activity yet"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-[var(--surface-2)] p-5 shadow-[0_1px_2px_rgba(45,42,38,0.04)]">
              <h2 className="text-[13.5px] font-semibold text-foreground">Roster Snapshot</h2>
              <div className="mt-4 space-y-3">
                {roster.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">No members assigned to this team.</p>
                ) : (
                  roster.slice(0, 5).map((member) => (
                    <div key={member.id} className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-[12px] font-semibold text-muted-foreground">
                        {member.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-foreground">{member.fullName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        {member.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(45,42,38,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="text-[13.5px] font-semibold text-foreground">Member Performance</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Work time, active time, manual time, and productivity for every member in this team.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[12.5px]">
                <thead className="bg-muted/30 text-left text-muted-foreground">
                  <tr>
                    {["Employee", "Work Time", "Active Time", "Manual Time", "Productivity", ""].map((heading) => (
                      <th key={heading} className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">
                        Add employees to this team to start monitoring detailed performance.
                      </td>
                    </tr>
                  ) : (
                    members.map((member) => (
                      <tr key={member.userId} className="border-t border-border transition hover:bg-accent/30">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{member.fullName}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{member.email}</p>
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums text-foreground">
                          {formatDuration(member.trackedSeconds)}
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums text-primary">
                          {formatDuration(member.activeSeconds)}
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums text-muted-foreground">
                          {formatDuration(member.manualSeconds)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${Math.min(100, member.productivityPercent)}%` }}
                              />
                            </div>
                            <span className="w-10 text-[12px] font-semibold tabular-nums text-foreground">
                              {member.productivityPercent}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/dashboard/employees/${member.userId}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[var(--brand-tint)] hover:text-primary"
                            title="Open employee"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
