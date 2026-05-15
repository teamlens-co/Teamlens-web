"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Globe2, Laptop, MapPin, PieChart, Users } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import DashboardDateFilter from "../../../components/DashboardDateFilter";
import ThemedSelect from "../../../components/ThemedSelect";

type Category = "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";
type TargetType = "APP" | "DOMAIN" | "URL";
type ReportTab = "total" | "employee" | "team" | "location";

type UsageItem = {
  name: string;
  targetType: TargetType;
  appName: string;
  domain?: string;
  category: Category;
  durationSeconds: number;
  samples: number;
};

type UsageBreakdown = {
  name: string;
  employeeName: string;
  teamName: string;
  locationName: string;
  durationSeconds: number;
  samples: number;
};

type UsageReport = {
  items: UsageItem[];
  categories: Array<{ name: string; category: Category; durationSeconds: number }>;
  breakdowns: UsageBreakdown[];
  groupBy: string;
};

type DonutSlice = {
  name: string;
  durationSeconds: number;
  color: string;
};

type ApiUser = {
  id: string;
  fullName: string;
  email: string;
};

type ApiTeam = {
  id: string;
  name: string;
  members?: Array<{ id: string }>;
};

const tabs: Array<{ id: ReportTab; label: string; icon: typeof PieChart }> = [
  { id: "total", label: "Total Usage", icon: PieChart },
  { id: "employee", label: "Usage Per Employee", icon: Users },
  { id: "team", label: "Usage Per Team", icon: Building2 },
  { id: "location", label: "Usage Per Location", icon: MapPin },
];

const chartColors = ["#E85A3C", "#2BAE78", "#F59E0B", "#4F46E5", "#7E6F65", "#C47A00", "#008F5E", "#A8A09A"];

const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} h`;
};

function DonutChart({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.durationSeconds, 0);
  const arcs = slices.reduce<Array<DonutSlice & { dash: string; offset: number }>>((items, slice) => {
    const value = total > 0 ? (slice.durationSeconds / total) * 100 : 0;
    const used = items.reduce((sum, item) => sum + Number(item.dash.split(" ")[0]), 0);
    return [...items, { ...slice, dash: `${value} ${100 - value}`, offset: 25 - used }];
  }, []);

  if (total <= 0) {
    return <div className="flex h-80 items-center justify-center text-[12px] font-medium uppercase tracking-widest text-[#A8A09A]">No usage found</div>;
  }

  return (
    <div className="flex flex-col items-center gap-8 py-10 px-4">
      <div className="relative">
        <svg viewBox="0 0 42 42" className="h-48 w-48 sm:h-64 sm:w-64 -rotate-90">
          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#F1ECE7" strokeWidth="5.2" />
          {arcs.map((slice) => {
            return (
              <circle
                key={slice.name}
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke={slice.color}
                strokeWidth="5.2"
                strokeDasharray={slice.dash}
                strokeDashoffset={slice.offset}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] sm:text-[11px] font-medium text-[#8C837B]">Selected Usage</span>
          <span className="mt-0.5 sm:mt-1 text-[18px] sm:text-[24px] font-semibold text-[#171717]">{formatDuration(total)}</span>
        </div>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {slices.slice(0, 8).map((slice) => (
          <div key={slice.name} className="flex min-w-0 items-center gap-3 text-[13px]">
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
            <span className="truncate font-medium text-[#171717]">{slice.name}</span>
            <span className="ml-auto shrink-0 text-[#7E6F65]">{formatDuration(slice.durationSeconds)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { authHeaders, apiBase, dateRange, user } = useAuth();
  const [report, setReport] = useState<UsageReport>({ items: [], categories: [], breakdowns: [], groupBy: "total" });
  const [employees, setEmployees] = useState<ApiUser[]>([]);
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [activeTab, setActiveTab] = useState<ReportTab>("total");
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authHeaders || user?.role !== "MANAGER") return;

    const loadFilters = async () => {
      try {
        const [usersRes, teamsRes] = await Promise.all([
          fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/web/teams`, { headers: authHeaders, credentials: "include" }),
        ]);
        const [usersPayload, teamsPayload] = await Promise.all([usersRes.json(), teamsRes.json()]);
        setEmployees(usersPayload.success ? (usersPayload.data ?? []) : []);
        setTeams(teamsPayload.success ? (teamsPayload.data ?? []) : []);
      } catch (error) {
        console.error("Failed to load report filters", error);
        setEmployees([]);
        setTeams([]);
      }
    };

    void loadFilters();
  }, [apiBase, authHeaders, user?.role]);

  useEffect(() => {
    if (!authHeaders || !user) return;

    const loadReport = async () => {
      setLoading(true);
      setSelectedNames([]);
      try {
        const params = new URLSearchParams({
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString(),
        });
        if (user.role !== "MANAGER") {
          params.set("userId", user.id);
        } else if (employeeFilter) {
          params.set("userId", employeeFilter);
        } else if (teamFilter) {
          params.set("teamId", teamFilter);
        }

        const response = await fetch(`${apiBase}/api/web/dashboard/usage-report?${params.toString()}`, {
          headers: authHeaders,
          credentials: "include",
        });
        const payload = await response.json();
        setReport(payload.success ? payload.data : { items: [], categories: [], breakdowns: [], groupBy: "total" });
      } catch (error) {
        console.error("Failed to load usage report", error);
        setReport({ items: [], categories: [], breakdowns: [], groupBy: "total" });
      } finally {
        setLoading(false);
      }
    };

    void loadReport();
  }, [apiBase, authHeaders, dateRange, employeeFilter, teamFilter, user]);

  const currentFilterLabel = useMemo(() => {
    const employee = employees.find((item) => item.id === employeeFilter);
    if (employee) return employee.fullName;
    const team = teams.find((item) => item.id === teamFilter);
    if (team) return team.name;
    return user?.role === "MANAGER" ? "All employees" : user?.fullName ?? "My usage";
  }, [employeeFilter, employees, teamFilter, teams, user]);

  const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames]);
  const activeItems = useMemo(
    () => (selectedNames.length === 0 ? report.items : report.items.filter((item) => selectedSet.has(item.name))),
    [report.items, selectedNames.length, selectedSet],
  );
  const activeNameSet = useMemo(() => new Set(activeItems.map((item) => item.name)), [activeItems]);

  const donutSlices = useMemo(
    () =>
      activeItems
        .filter((item) => item.durationSeconds > 0)
        .slice(0, 8)
        .map((item, index) => ({ name: item.name, durationSeconds: item.durationSeconds, color: chartColors[index % chartColors.length]! })),
    [activeItems],
  );

  const breakdownRows = useMemo(() => {
    const keyFor = (row: UsageBreakdown) => {
      if (activeTab === "employee") return `${row.employeeName}|${row.teamName}`;
      if (activeTab === "team") return row.teamName;
      return row.locationName;
    };

    const grouped = new Map<string, { label: string; sub: string; durationSeconds: number; samples: number }>();
    for (const row of report.breakdowns) {
      if (!activeNameSet.has(row.name)) continue;
      const key = keyFor(row);
      const label = activeTab === "employee" ? row.employeeName : activeTab === "team" ? row.teamName : row.locationName;
      const sub = activeTab === "employee" ? row.teamName : activeTab === "team" ? "Team total" : "Usage location";
      const current = grouped.get(key) ?? { label, sub, durationSeconds: 0, samples: 0 };
      current.durationSeconds += row.durationSeconds;
      current.samples += row.samples;
      grouped.set(key, current);
    }

    return Array.from(grouped.values()).sort((a, b) => b.durationSeconds - a.durationSeconds);
  }, [activeNameSet, activeTab, report.breakdowns]);

  const toggleSelection = (name: string) => {
    setSelectedNames((current) => {
      if (current.length === 0) return [name];
      return current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
    });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[18px] font-semibold leading-tight text-[#171717]">Apps and Websites</h1>
          <p className="mt-1 text-[13px] text-[#7E6F65]">Software, websites, teams, and location usage</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <DashboardDateFilter />
          {user?.role === "MANAGER" ? (
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <ThemedSelect
                label="Employees"
                value={employeeFilter}
                minWidth={160}
                onChange={(nextValue) => {
                  setEmployeeFilter(nextValue);
                  if (nextValue) setTeamFilter("");
                }}
                options={[{ label: "All employees", value: "" }, ...employees.map((employee) => ({ label: employee.fullName, value: employee.id }))]}
              />
              <ThemedSelect
                label="Teams"
                value={teamFilter}
                minWidth={160}
                onChange={(nextValue) => {
                  setTeamFilter(nextValue);
                  if (nextValue) setEmployeeFilter("");
                }}
                options={[{ label: "All teams", value: "" }, ...teams.map((team) => ({ label: team.name, value: team.id }))]}
              />
            </div>
          ) : null}
        </div>
      </header>

      <div className="rounded-xl border border-[#DDD2C9] bg-white px-4 py-3 text-[13px] text-[#7E6F65]">
        <span>Showing apps and websites for {currentFilterLabel}. Pick an employee or team above for a focused report.</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white">
          <div className="flex h-14 items-center justify-between border-b border-[#DDD2C9] bg-[#FCFAF8] px-5">
            <h2 className="text-[11px] font-medium text-[#7E6F65]">All Apps and Websites</h2>
          </div>

          <div className="max-h-[510px] space-y-2 overflow-y-auto p-4">
            {loading ? (
              <div className="py-20 text-center text-[12px] font-medium uppercase tracking-widest text-[#A8A09A]">Loading usage</div>
            ) : report.items.length === 0 ? (
              <div className="py-20 text-center text-[12px] font-medium uppercase tracking-widest text-[#A8A09A]">No apps or websites found</div>
            ) : (
              report.items.map((item) => {
                const selected = selectedNames.length === 0 || selectedSet.has(item.name);
                return (
                  <button
                    key={`${item.targetType}-${item.name}`}
                    onClick={() => toggleSelection(item.name)}
                    className={`flex h-[58px] w-full items-center gap-3 rounded-xl border px-4 text-left transition ${
                      selected ? "border-brand/50 bg-[#FCE8E1] text-brand" : "border-[#EFE8E2] bg-white text-[#171717] hover:border-brand/30 hover:bg-[#FCFAF8]"
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? "bg-white text-brand" : "bg-[#F2EFEC] text-[#7E6F65]"}`}>
                      {item.domain || item.targetType !== "APP" ? <Globe2 className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.name}</span>
                    <span className="shrink-0 text-[12px] font-medium tabular-nums">{formatDuration(item.durationSeconds)}</span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[#EFE8E2] px-5 py-3 text-[12px]">
            <span className="text-[#7E6F65]">{selectedNames.length === 0 ? "Showing all resources" : `${selectedNames.length} selected`}</span>
            <button onClick={() => setSelectedNames([])} className="font-medium text-brand">Select all</button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white">
          <div className="flex items-center justify-between border-b border-[#DDD2C9] bg-[#FCFAF8] px-5">
            <div className="flex min-h-12 gap-6 overflow-x-auto custom-scrollbar">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative inline-flex items-center gap-2 whitespace-nowrap px-1 text-[12px] font-medium transition ${
                    activeTab === tab.id ? "text-brand" : "text-[#7E6F65] hover:text-[#171717]"
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  {activeTab === tab.id ? <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand" /> : null}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "total" ? (
            <DonutChart slices={donutSlices} />
          ) : (
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-[1fr_100px] sm:grid-cols-[1fr_160px_120px] md:grid-cols-[1fr_220px_160px] gap-4 border-b border-[#EFE8E2] bg-[#FCFAF8] px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-[#7E6F65]">
                <span>{activeTab === "employee" ? "Employee Name" : activeTab === "team" ? "Team" : "Usage Location"}</span>
                <span className="hidden sm:block">{activeTab === "employee" ? "Team" : "Detail"}</span>
                <span className="text-right sm:text-left">Total Time</span>
              </div>

              <div className="divide-y divide-[#EFE8E2] overflow-hidden rounded-b-xl border-x border-b border-[#EFE8E2]">
                {breakdownRows.length === 0 ? (
                  <div className="py-16 text-center text-[13px] font-medium text-[#9A9088]">No usage for this selection</div>
                ) : (
                  breakdownRows.map((row) => (
                    <div key={`${row.label}-${row.sub}`} className="grid grid-cols-[1fr_100px] sm:grid-cols-[1fr_160px_120px] md:grid-cols-[1fr_220px_160px] items-center gap-4 bg-white px-4 py-3 transition hover:bg-[#FCFAF8]">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-[#F2EFEC] text-[10px] sm:text-[11px] font-medium text-[#171717]">
                          {row.label.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate text-[12px] sm:text-[13px] font-medium text-[#171717]">{row.label}</span>
                      </div>
                      <span className="hidden sm:block truncate text-[11px] sm:text-[12px] text-[#7E6F65]">{row.sub}</span>
                      <span className="text-right sm:text-left text-[11px] sm:text-[12px] font-medium text-[#171717] tabular-nums">{formatDuration(row.durationSeconds)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
