"use client";

import { useEffect, useMemo, useState } from "react";
import { Maximize2, MonitorPlay, Users, X } from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useAuth, type Role } from "../../../contexts/AuthContext";
import LiveScreenViewer from "../../../components/LiveScreenViewer";
import DashboardDateFilter from "../../../components/DashboardDateFilter";
import ThemedSelect from "../../../components/ThemedSelect";

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

type TimelineEmployee = {
  userId: string;
  employeeName: string;
  activeSeconds: number;
  workSeconds: number;
  utilizationPercent: number;
  lastActiveAt: string | null;
  topApps: Array<{ name: string; seconds: number }>;
};

type ScreenshotItem = {
  id: string;
  userId?: string;
  employeeName?: string | null;
  activeApplication?: string | null;
  windowTitle?: string | null;
  capturedAt: string;
};

type LiveEmployee = {
  id: string;
  name: string;
  email: string;
  role: Role;
  teamName: string;
  online: boolean;
  productivity: number;
  activeApp: string;
  lastActiveAt: string | null;
  screenshot: ScreenshotItem | null;
};

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "TL";

const isRecentlyActive = (value: string | null) => {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && Date.now() - parsed <= 10 * 60 * 1000;
};

const relativeTime = (value: string | null) => {
  if (!value) return "Never";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
};

function LiveCard({ employee, apiBase, onOpen }: { employee: LiveEmployee; apiBase: string; onOpen: (employee: LiveEmployee) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(employee)}
      className="group overflow-hidden rounded-xl border border-[#DDD2C9] bg-white text-left shadow-[0_1px_2px_rgba(45,42,38,0.03)] transition hover:border-brand/50 hover:shadow-[0_10px_28px_rgba(45,42,38,0.08)]"
    >
      <div className="relative aspect-video bg-[#FAF8F6]">
        <div className="absolute left-3 top-3 z-10 inline-flex max-w-[78%] items-center gap-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#3F3833] shadow-sm backdrop-blur">
          <span className={`h-2 w-2 rounded-full ${employee.online ? "bg-[#4FD17D]" : "bg-[#B8B0AA]"}`} />
          <span className="truncate">{employee.name}</span>
        </div>

        {employee.screenshot ? (
          <Image
            src={`${apiBase}/api/agent/screenshots/${employee.screenshot.id}`}
            alt={`${employee.name} latest screen`}
            fill
            unoptimized
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E6DED7] bg-white text-[#D2CAC3]">
              <MonitorPlay className="h-5 w-5" />
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-3 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-[#7E6F65] shadow-sm backdrop-blur">
          {employee.activeApp}
        </div>
        <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 transition group-hover:opacity-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/90 text-[#3F3833] shadow-sm backdrop-blur">
            <Maximize2 className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3 border-t border-[#EFE8E2] px-4 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-[#302C28]">{employee.name}</p>
          <p className="truncate text-[11px] font-medium text-[#8C837B]">{employee.role === "MANAGER" ? "Manager" : "Employee"} · {employee.teamName}</p>
        </div>
        <div className="text-right">
          <p className="text-[13px] font-medium text-[#302C28]">{employee.productivity}%</p>
          <p className="text-[11px] font-medium text-[#8C837B]">productivity</p>
        </div>
      </div>
    </button>
  );
}

export default function LiveStreamPage() {
  const { apiBase, authHeaders, user, dateRange } = useAuth();
  const searchParams = useSearchParams();
  const requestedEmployeeId = searchParams.get("employeeId") || "";
  const [employees, setEmployees] = useState<LiveEmployee[]>([]);
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [teamFilter, setTeamFilter] = useState("");
  const [gridSize, setGridSize] = useState<"2" | "3" | "4">("3");
  const [selectedEmployee, setSelectedEmployee] = useState<LiveEmployee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authHeaders) return;

    const fetchLiveData = async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString(),
        }).toString();

        const [usersRes, teamsRes, timelineRes] = await Promise.all([
          fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/web/teams`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/web/dashboard/activity-timeline?${query}`, { headers: authHeaders, credentials: "include" }),
        ]);

        const [usersData, teamsData, timelineData] = await Promise.all([usersRes.json(), teamsRes.json(), timelineRes.json()]);
        const users = (usersData.success ? usersData.data : []) as ApiUser[];
        const teamList = (teamsData.success ? teamsData.data : []) as ApiTeam[];
        const timeline = ((timelineData.success ? timelineData.data?.employees : []) ?? []) as TimelineEmployee[];
        const timelineByUser = new Map(timeline.map((item) => [item.userId, item]));

        const screenshotResults = await Promise.all(
          users.map(async (employee) => {
            const params = new URLSearchParams({
              userId: employee.id,
              limit: "1",
              startDate: dateRange.startDate.toISOString(),
              endDate: dateRange.endDate.toISOString(),
            });
            const response = await fetch(`${apiBase}/api/agent/screenshots?${params.toString()}`, {
              headers: authHeaders,
              credentials: "include",
            });
            const payload = await response.json();
            return [employee.id, payload.success && payload.data?.[0] ? payload.data[0] : null] as const;
          }),
        );
        const screenshotsByUser = new Map<string, ScreenshotItem | null>(screenshotResults);

        setTeams(teamList);
        setEmployees(
          users.map((employee) => {
            const activity = timelineByUser.get(employee.id);
            const teamName = teamList.find((team) => team.members?.some((member) => member.id === employee.id))?.name ?? "Unassigned";
            const productivity = Math.min(100, Math.max(0, Math.round(activity?.utilizationPercent ?? 0)));
            return {
              id: employee.id,
              name: employee.fullName,
              email: employee.email,
              role: employee.role,
              teamName,
              online: isRecentlyActive(activity?.lastActiveAt ?? null),
              productivity,
              activeApp: activity?.topApps?.[0]?.name ?? screenshotsByUser.get(employee.id)?.activeApplication ?? "No active app",
              lastActiveAt: activity?.lastActiveAt ?? null,
              screenshot: screenshotsByUser.get(employee.id) ?? null,
            };
          }),
        );
      } catch (error) {
        console.error("Failed to load live view", error);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchLiveData();
    const timer = window.setInterval(fetchLiveData, 30_000);
    return () => window.clearInterval(timer);
  }, [apiBase, authHeaders, dateRange]);

  const filteredCards = useMemo(() => {
    return employees.filter((employee) => {
      const matchesTeam = !teamFilter || employee.teamName === teamFilter;
      return matchesTeam;
    });
  }, [employees, teamFilter]);

  const filteredList = useMemo(() => {
    return employees;
  }, [employees]);

  const onlineCount = employees.filter((employee) => employee.online).length;
  const gridClass = gridSize === "2" ? "xl:grid-cols-2" : gridSize === "4" ? "xl:grid-cols-4" : "xl:grid-cols-3";

  useEffect(() => {
    if (!requestedEmployeeId || selectedEmployee || employees.length === 0) return;
    const employee = employees.find((item) => item.id === requestedEmployeeId);
    if (employee) {
      setSelectedEmployee(employee);
    }
  }, [employees, requestedEmployeeId, selectedEmployee]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[18px] font-semibold leading-tight text-[#302C28]">Live View</h1>
          <p className="mt-1 text-[13px] font-medium text-[#8C837B]">{onlineCount} agents online · refreshes every 30s</p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <DashboardDateFilter />
          <ThemedSelect
            label="Teams"
            value={teamFilter}
            onChange={setTeamFilter}
            minWidth={170}
            options={[{ label: "All Teams", value: "" }, ...teams.map((team) => ({ label: team.name, value: team.name }))]}
          />
          <div className="inline-flex h-9 overflow-hidden rounded-xl border border-[#E1D7CE] bg-white">
            {(["2", "3", "4"] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setGridSize(size)}
                className={`px-4 text-[13px] font-medium transition ${gridSize === size ? "bg-brand text-white" : "text-[#7E6F65] hover:bg-[#F8F5F1]"}`}
              >
                {size}x{size}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <section className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${gridClass}`}>
          {loading ? (
            <div className="col-span-full rounded-xl border border-[#DDD2C9] bg-white py-20 text-center text-[11px] font-medium uppercase tracking-widest text-[#B4AAA2]">
              Loading live screens...
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="col-span-full rounded-xl border border-[#DDD2C9] bg-white py-20 text-center">
              <MonitorPlay className="mx-auto h-8 w-8 text-[#C8BFB8]" />
              <p className="mt-3 text-[13px] font-medium text-[#302C28]">No live screens match this filter.</p>
            </div>
          ) : (
            filteredCards.map((employee) => <LiveCard key={employee.id} employee={employee} apiBase={apiBase} onOpen={setSelectedEmployee} />)
          )}
        </section>

        <aside className="rounded-xl border border-[#DDD2C9] bg-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-brand" />
            <h2 className="text-[13px] font-medium text-[#302C28]">Employees</h2>
            <span className="ml-auto text-[11px] font-medium text-[#9A9088]">{filteredList.length}</span>
          </div>
          <div className="max-h-[calc(100vh-260px)] space-y-1 overflow-y-auto pr-1">
            {filteredList.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => setSelectedEmployee(employee)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-[#F8F5F1]"
              >
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1ECE7] text-[10px] font-medium text-[#302C28]">
                  {initials(employee.name)}
                  <span className={`absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-white ${employee.online ? "bg-[#4FD17D]" : "bg-[#B8B0AA]"}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[#302C28]">{employee.name}</span>
                  <span className="block truncate text-[11px] font-medium text-[#8C837B]">{employee.online ? "Online" : relativeTime(employee.lastActiveAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {selectedEmployee ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5 backdrop-blur-sm" onClick={() => setSelectedEmployee(null)}>
          <div className="w-full max-w-5xl rounded-xl bg-[#F8F5F1] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[18px] font-medium text-[#302C28]">{selectedEmployee.name}</h2>
                <p className="text-[13px] font-medium text-[#8C837B]">{selectedEmployee.teamName} · {selectedEmployee.activeApp}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#DDD2C9] bg-white text-[#7E6F65] transition hover:text-[#302C28]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <LiveScreenViewer
              employeeId={selectedEmployee.id}
              autoStart
              disabled={!selectedEmployee.id || selectedEmployee.id === user?.id}
              disabledReason={selectedEmployee.id === user?.id ? "You cannot view your own screen" : undefined}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
