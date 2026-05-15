"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Grid2X2, List, MoreHorizontal, Search, Upload, UserPlus, TimerOff, TrendingUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useAuth, Role } from "../../../contexts/AuthContext";
import DashboardDateFilter from "../../../components/DashboardDateFilter";
import ThemedSelect from "../../../components/ThemedSelect";

type ApiTeam = {
  id: string;
  name: string;
  members?: Array<{ id: string }>;
};

type ApiUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status?: "ACTIVE" | "INVITED" | "DISABLED";
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
};

type EmployeeRow = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  accountStatus: ApiUser["status"];
  team: string;
  teamId: string | null;
  onlineStatus: "online" | "afk" | "offline";
  activeApp: string;
  hours: number;
  activeSeconds: number;
  idleSeconds: number;
  activity: number;
  productivity: number;
  lastActive: string;
};

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TL";
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
};

const formatHours = (seconds: number) => {
  const hours = seconds / 3600;
  if (hours <= 0) return "0h";
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)}h`;
};

const toFiniteSeconds = (value: unknown) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : 0;
};

const formatSummaryHours = (seconds: number) => {
  const total = Math.max(0, Math.round(toFiniteSeconds(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

const formatPercentOf = (part: number, total: number) => {
  const safePart = toFiniteSeconds(part);
  const safeTotal = toFiniteSeconds(total);
  if (safeTotal <= 0) return null;
  return Math.round((safePart / safeTotal) * 100);
};

const relativeTime = (value: string | null) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const deriveOnlineStatus = (userStatus: ApiUser["status"], lastActiveAt: string | null, activity: number): EmployeeRow["onlineStatus"] => {
  if (userStatus !== "ACTIVE") return "offline";
  if (!lastActiveAt) return "offline";
  const minutes = (Date.now() - new Date(lastActiveAt).getTime()) / 60000;
  if (minutes <= 10 && activity >= 25) return "online";
  if (minutes <= 30) return "afk";
  return "offline";
};

const statusColor = {
  online: "text-[#00A86B]",
  afk: "text-[#F59E0B]",
  offline: "text-[#7E6F65]",
};

const dotColor = {
  online: "bg-[#2DBE83]",
  afk: "bg-[#F59E0B]",
  offline: "bg-[#A8A09A]",
};

export default function EmployeesPage() {
  const { authHeaders, apiBase, user, selectedTeamId, dateRange } = useAuth();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    if (!authHeaders || user?.role !== "MANAGER") return;

    const fetchEmployees = async () => {
      setLoading(true);
      setError("");
      try {
        const [usersRes, teamsRes, timelineRes] = await Promise.all([
          fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/web/teams`, { headers: authHeaders, credentials: "include" }),
          fetch(
            `${apiBase}/api/web/dashboard/activity-timeline?${new URLSearchParams({
              startDate: dateRange.startDate.toISOString(),
              endDate: dateRange.endDate.toISOString(),
            }).toString()}`,
            { headers: authHeaders, credentials: "include" },
          ),
        ]);

        const usersData = await usersRes.json();
        const teamsData = await teamsRes.json();
        const timelineData = await timelineRes.json();

        if (!usersData.success || !teamsData.success) {
          setError("Failed to load employee data");
          setEmployees([]);
          return;
        }

        const teamList = (teamsData.data ?? []) as ApiTeam[];
        const timeline = ((timelineData.success ? timelineData.data?.employees : []) ?? []) as TimelineEmployee[];
        const timelineByUser = new Map(timeline.map((item) => [item.userId, item]));

        const rows = ((usersData.data ?? []) as ApiUser[]).map((apiUser) => {
          const team = teamList.find((item) => item.members?.some((member) => member.id === apiUser.id));
          const activity = timelineByUser.get(apiUser.id);
          const workSeconds = toFiniteSeconds(activity?.workSeconds);
          const activeSeconds = toFiniteSeconds(activity?.activeSeconds);
          const idleSeconds = toFiniteSeconds(activity?.idleSeconds);
          const activityPercent = workSeconds ? Math.min(100, Math.round((activeSeconds / workSeconds) * 100)) : 0;
          const onlineStatus = deriveOnlineStatus(apiUser.status, activity?.lastActiveAt ?? null, activityPercent);

          return {
            id: apiUser.id,
            fullName: apiUser.fullName,
            email: apiUser.email,
            role: apiUser.role,
            accountStatus: apiUser.status,
            team: team?.name ?? "Unassigned",
            teamId: team?.id ?? null,
            onlineStatus,
            activeApp: activity?.topApps[0]?.name ?? "-",
            hours: workSeconds,
            activeSeconds,
            idleSeconds,
            activity: activityPercent,
            productivity: Math.min(100, toFiniteSeconds(activity?.utilizationPercent)),
            lastActive: relativeTime(activity?.lastActiveAt ?? null),
          } satisfies EmployeeRow;
        });

        setTeams(teamList);
        setEmployees(rows);
      } catch (err) {
        console.error(err);
        setError("Network error occurred");
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchEmployees();
  }, [authHeaders, apiBase, dateRange, user?.role]);

  const filteredEmployees = useMemo(() => {
    let result = employees;
    if (selectedTeamId) result = result.filter((employee) => employee.teamId === selectedTeamId);
    if (statusFilter !== "all") result = result.filter((employee) => employee.onlineStatus === statusFilter);
    if (teamFilter !== "all") result = result.filter((employee) => employee.teamId === teamFilter);

    const needle = query.toLowerCase().trim();
    if (needle) {
      result = result.filter((employee) =>
        `${employee.fullName} ${employee.email} ${employee.team}`.toLowerCase().includes(needle),
      );
    }
    return result;
  }, [employees, query, selectedTeamId, statusFilter, teamFilter]);

  const summary = useMemo(() => {
    return filteredEmployees.reduce(
      (totals, employee) => ({
        workSeconds: totals.workSeconds + employee.hours,
        activeSeconds: totals.activeSeconds + employee.activeSeconds,
        idleSeconds: totals.idleSeconds + employee.idleSeconds,
      }),
      { workSeconds: 0, activeSeconds: 0, idleSeconds: 0 },
    );
  }, [filteredEmployees]);

  const productiveSeconds = summary.activeSeconds;

  const rangeLabel = dateRange.label || `${dateRange.startDate.toLocaleDateString()} - ${dateRange.endDate.toLocaleDateString()}`;
  const activePercent = formatPercentOf(summary.activeSeconds, summary.workSeconds);
  const idlePercent = formatPercentOf(summary.idleSeconds, summary.workSeconds);
  const productivePercent = formatPercentOf(productiveSeconds, summary.workSeconds);

  const deleteEmployee = async (employee: EmployeeRow) => {
    if (!authHeaders || deletingEmployeeId) return;
    if (employee.role !== "EMPLOYEE") {
      setError("Only employee accounts can be deleted from this section.");
      return;
    }

    const confirmed = window.confirm(`Delete ${employee.fullName}? This will remove the employee and their tracked data.`);
    if (!confirmed) return;

    setDeletingEmployeeId(employee.id);
    setOpenActionMenuId(null);
    setError("");

    try {
      const response = await fetch(`${apiBase}/api/web/users/${employee.id}`, {
        method: "DELETE",
        headers: authHeaders,
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        setError(payload?.message || "Unable to delete employee.");
        return;
      }

      setEmployees((current) => current.filter((item) => item.id !== employee.id));
    } catch (err) {
      console.error("Failed to delete employee", err);
      setError("Network error occurred while deleting employee.");
    } finally {
      setDeletingEmployeeId(null);
    }
  };

  if (user?.role !== "MANAGER") {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-[12px] font-medium uppercase tracking-widest text-[#9A9088]">Access Restricted</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-[18px] font-semibold leading-tight text-[#171717]">Employees</h1>
            <p className="mt-1 text-[13px] text-[#7E6F65]">{employees.length} team members</p>
          </div>
          <div className="sm:ml-2">
            <DashboardDateFilter />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/team"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E1D7CE] bg-white px-4 text-[13px] font-medium text-[#171717] transition hover:bg-[#FCFAF8]"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Link>
          <Link
            href="/dashboard/team"
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-medium text-white shadow-sm shadow-brand/20 transition hover:bg-brand-dark"
          >
            <UserPlus className="h-4 w-4" />
            Add Employee
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[#DDD2C9] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-[#7E6F65]">Total Work Time</p>
              <p className="mt-2 text-[24px] font-semibold leading-none text-[#171717]">{formatSummaryHours(summary.workSeconds)}</p>
              <p className="mt-2 text-[12px] text-[#8C837B]">{filteredEmployees.length} employees · {rangeLabel}</p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FCE8E1] text-brand">
              <Clock3 className="h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-[#DDD2C9] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-[#7E6F65]">Active Hours</p>
              <p className="mt-2 text-[24px] font-semibold leading-none text-[#171717]">{formatSummaryHours(summary.activeSeconds)}</p>
              <p className="mt-2 text-[12px] text-[#8C837B]">
                {activePercent !== null ? `${activePercent}% active utilization` : "No tracked work in range"}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F7F0] text-[#008F5E]">
              <Clock3 className="h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-[#DDD2C9] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-[#7E6F65]">Idle Time</p>
              <p className="mt-2 text-[24px] font-semibold leading-none text-[#171717]">{formatSummaryHours(summary.idleSeconds)}</p>
              <p className="mt-2 text-[12px] text-[#8C837B]">
                {idlePercent !== null ? `${idlePercent}% of work time` : "No tracked idle time"}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF4DD] text-[#C47A00]">
              <TimerOff className="h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-[#DDD2C9] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-[#7E6F65]">Productive Time</p>
              <p className="mt-2 text-[24px] font-semibold leading-none text-[#171717]">{formatSummaryHours(productiveSeconds)}</p>
              <p className="mt-2 text-[12px] text-[#8C837B]">
                {productivePercent !== null ? `${productivePercent}% productive utilization` : "No productive time in range"}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 md:flex-row">
          <label className="relative block max-w-[480px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C837B]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-full rounded-xl border border-[#E1D7CE] bg-white pl-10 pr-4 text-[13px] text-[#171717] outline-none transition placeholder:text-[#8C837B] focus:border-brand focus:ring-2 focus:ring-brand/10"
              placeholder="Search by name or email..."
            />
          </label>

          <ThemedSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            minWidth={150}
            options={[
              { label: "All Status", value: "all" },
              { label: "Online", value: "online" },
              { label: "Afk", value: "afk" },
              { label: "Offline", value: "offline" },
            ]}
          />

          <ThemedSelect
            label="Teams"
            value={teamFilter}
            onChange={setTeamFilter}
            minWidth={160}
            options={[{ label: "All Teams", value: "all" }, ...teams.map((team) => ({ label: team.name, value: team.id }))]}
          />
        </div>

        <div className="inline-flex h-9 w-fit overflow-hidden rounded-xl border border-[#E1D7CE] bg-white">
          <button
            onClick={() => setViewMode("list")}
            className={`flex h-full w-9 items-center justify-center ${viewMode === "list" ? "bg-[#FCE8E1] text-brand" : "text-[#8C837B] hover:bg-[#FCFAF8]"}`}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`flex h-full w-9 items-center justify-center transition ${viewMode === "grid" ? "bg-[#FCE8E1] text-brand" : "text-[#8C837B] hover:bg-[#FCFAF8]"}`}
          >
            <Grid2X2 className="h-4 w-4" />
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-[13px] font-medium text-rose-600">{error}</div>}

      {viewMode === "grid" ? (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {loading ? (
            <div className="col-span-full rounded-xl border border-[#DDD2C9] bg-white px-5 py-16 text-center text-[11px] font-medium uppercase tracking-widest text-[#B4AAA2]">Loading employees...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="col-span-full rounded-xl border border-[#DDD2C9] bg-white px-5 py-16 text-center text-[13px] font-medium text-[#9A9088]">No employees match your filters.</div>
          ) : (
            filteredEmployees.map((employee) => (
              <Link key={employee.id} href={`/dashboard/employees/${employee.id}`} className="rounded-xl border border-[#DDD2C9] bg-white p-4 transition hover:border-brand/40 hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2EFEC] text-[10px] font-medium text-[#171717]">
                      {initials(employee.fullName)}
                      <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${dotColor[employee.onlineStatus]}`} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-[#171717]">{employee.fullName}</span>
                      <span className="block truncate text-[11px] text-[#7E6F65]">{employee.email}</span>
                    </span>
                  </div>
                  <span className={`text-[12px] font-medium capitalize ${statusColor[employee.onlineStatus]}`}>{employee.onlineStatus}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <p className="text-[#9A9088]">Team</p>
                    <p className="mt-1 truncate font-medium text-[#171717]">{employee.team}</p>
                  </div>
                  <div>
                    <p className="text-[#9A9088]">Active App</p>
                    <p className="mt-1 truncate font-medium text-[#171717]">{employee.activeApp}</p>
                  </div>
                  <div>
                    <p className="text-[#9A9088]">Hours</p>
                    <p className="mt-1 font-medium text-[#171717]">{formatHours(employee.hours)}</p>
                  </div>
                  <div>
                    <p className="text-[#9A9088]">Productivity</p>
                    <p className="mt-1 font-medium text-[#171717]">{employee.productivity}%</p>
                  </div>
                </div>
              </Link>
            ))
          )}
        </section>
      ) : (
      <section className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="px-5 py-20 text-center text-[11px] font-medium uppercase tracking-widest text-[#B4AAA2]">Loading employees...</div>
          ) : (
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-[#DDD2C9] bg-[#FCFAF8]">
                  {["Employee", "Team", "Status", "Active App", "Hours", "Activity", "Productivity", "Last Active", ""].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[#7E6F65]">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE8E2]">
                {filteredEmployees.map((employee) => (
                  <tr key={employee.id} className="transition hover:bg-[#FCFAF8]">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/employees/${employee.id}`} className="flex items-center gap-3">
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F2EFEC] text-[10px] font-medium text-[#171717]">
                          {initials(employee.fullName)}
                          <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${dotColor[employee.onlineStatus]}`} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-[#171717]">{employee.fullName}</span>
                          <span className="block truncate text-[11px] text-[#7E6F65]">{employee.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-[#F1ECE7] px-2 py-0.5 text-[11px] text-[#171717]">{employee.team}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-[12px] font-medium capitalize ${statusColor[employee.onlineStatus]}`}>{employee.onlineStatus}</td>
                    <td className="px-4 py-2.5 text-[12px] text-[#7E6F65]">{employee.activeApp}</td>
                    <td className="px-4 py-2.5 text-[12px] font-medium text-[#171717]">{formatHours(employee.hours)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-4">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#EEEAE6]">
                          <div className={`h-full rounded-full ${employee.activity < 25 ? "bg-[#DC2626]" : "bg-[#2BAE78]"}`} style={{ width: `${employee.activity}%` }} />
                        </div>
                        <span className="w-10 text-[11px] text-[#7E6F65]">{employee.activity}%</span>
                      </div>
                    </td>
                    <td className={`px-4 py-2.5 text-[12px] font-medium ${employee.productivity >= 85 ? "text-[#00A86B]" : employee.productivity >= 70 ? "text-[#F59E0B]" : "text-[#DC2626]"}`}>
                      {employee.productivity}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-[#7E6F65]">{employee.lastActive}</td>
                    <td className="relative px-4 py-2.5 text-right">
                      <button
                        onClick={() => setOpenActionMenuId((current) => (current === employee.id ? null : employee.id))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#7E6F65] transition hover:bg-[#F1ECE7] hover:text-[#171717]"
                        aria-label={`Open actions for ${employee.fullName}`}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                      {openActionMenuId === employee.id && (
                        <div className="absolute right-4 top-9 z-20 w-40 overflow-hidden rounded-lg border border-[#E1D7CE] bg-white py-1 text-left shadow-lg">
                          <button
                            onClick={() => void deleteEmployee(employee)}
                            disabled={deletingEmployeeId === employee.id || employee.role !== "EMPLOYEE"}
                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-[#DC2626] transition hover:bg-[#FFF1F1] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingEmployeeId === employee.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-16 text-center text-[13px] font-medium text-[#9A9088]">
                      No employees match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
