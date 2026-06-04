"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  ListChecks,
  Loader2,
  Monitor,
  Sparkles,
  Target,
  Timer,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth, Role } from "../../../contexts/AuthContext";

type ScreenshotReport = {
  date: string;
  userId: string;
  markdown: string;
  updatedAt: string;
  scope?: "team" | "user";
  range?: string;
  analyzedScreenshots?: number;
  requiredScreenshots?: number;
  totalDuration?: string;
  productivityScore?: number;
  executiveSummary?: string;
  categoryBreakdown?: CategoryBreakdown[];
  topTasks?: TopTask[];
  taskDetails?: TaskDetail[];
  activityTimeline?: ActivityTimelineItem[];
  distractionAlerts?: string[];
  recommendations?: string[];
};

type CategoryBreakdown = {
  category: string;
  duration: string;
  percentage: number;
};

type TopTask = {
  task: string;
  duration: string;
};

type TaskDetail = {
  task: string;
  duration: string;
  time_range: string;
  applications: string[];
  primary_category: string;
  primary_focus: string;
  evidence: string[];
};

type ActivityTimelineItem = {
  time: string;
  user_id?: string;
  application_name: string;
  task: string;
  duration: string;
  focus_level: string;
  category: string;
  evidence?: string;
};

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
};

type MetricTileProps = {
  icon: typeof Sparkles;
  label: string;
  value: string;
  subValue?: string;
};

const focusClass = (focus?: string) => {
  if (focus === "Deep Work") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (focus === "Distraction") return "bg-rose-50 text-rose-700 ring-rose-100";
  return "bg-sky-50 text-sky-700 ring-sky-100";
};

const categoryClass = (category?: string) => {
  if (category === "Work") return "bg-slate-900 text-white";
  if (category === "Learning") return "bg-indigo-50 text-indigo-700";
  if (category === "Communication") return "bg-cyan-50 text-cyan-700";
  if (category === "Leisure") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
};

const scoreTone = (score?: number) => {
  if ((score ?? 0) >= 80) return "text-emerald-700 bg-emerald-50 ring-emerald-100";
  if ((score ?? 0) >= 60) return "text-amber-700 bg-amber-50 ring-amber-100";
  return "text-rose-700 bg-rose-50 ring-rose-100";
};

function MetricTile({ icon: Icon, label, value, subValue }: MetricTileProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-4 w-4 text-brand" />
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        {subValue ? <p className="pb-1 text-xs font-medium text-slate-400">{subValue}</p> : null}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</label>;
}

export default function AICenterPage() {
  const { authHeaders, apiBase, selectedTeamId } = useAuth();
  const [report, setReport] = useState<ScreenshotReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [summaryScope, setSummaryScope] = useState<"team" | "user">("team");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [minScreenshots, setMinScreenshots] = useState("10");
  const [employees, setEmployees] = useState<ApiUser[]>([]);
  const [teams, setTeams] = useState<ApiTeam[]>([]);

  useEffect(() => {
    if (!authHeaders) return;

    const loadOptions = async () => {
      try {
        const [usersRes, teamsRes] = await Promise.all([
          fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/web/teams`, { headers: authHeaders, credentials: "include" }),
        ]);
        const usersPayload = await usersRes.json();
        const teamsPayload = await teamsRes.json();
        const userRows = ((usersPayload.success ? usersPayload.data : []) ?? []) as ApiUser[];
        setEmployees(userRows.filter((item) => item.role === "EMPLOYEE"));
        setTeams(((teamsPayload.success ? teamsPayload.data : []) ?? []) as ApiTeam[]);
      } catch {
        setEmployees([]);
        setTeams([]);
      }
    };

    void loadOptions();
  }, [apiBase, authHeaders]);

  const employeeNameById = useMemo(() => {
    const rows = new Map<string, string>();
    employees.forEach((employee) => rows.set(employee.id, employee.fullName));
    return rows;
  }, [employees]);

  const scopedEmployeeIds = useMemo(() => {
    if (!selectedTeamId) return employees.map((employee) => employee.id);
    const selectedTeam = teams.find((team) => team.id === selectedTeamId);
    if (!selectedTeam) return employees.map((employee) => employee.id);
    const memberIds = new Set(selectedTeam.members?.map((member) => member.id) ?? []);
    return employees.filter((employee) => memberIds.has(employee.id)).map((employee) => employee.id);
  }, [employees, selectedTeamId, teams]);

  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);
  const dominantCategory = report?.categoryBreakdown?.reduce<CategoryBreakdown | null>(
    (current, item) => (!current || item.percentage > current.percentage ? item : current),
    null,
  );
  const hasReport = Boolean(report);
  const windowLabel = `${startTime} - ${endTime}`;

  const loadScreenshotReport = async () => {
    setReportLoading(true);
    setReportError(null);

    try {
      const params = new URLSearchParams({
        scope: summaryScope,
        date: reportDate,
        minScreenshots,
      });
      const startDateTime = new Date(`${reportDate}T${startTime}:00`);
      const endDateTime = new Date(`${reportDate}T${endTime}:00`);

      if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime()) || endDateTime <= startDateTime) {
        setReport(null);
        setReportError("Select a valid time range.");
        return;
      }

      params.set("start", startDateTime.toISOString());
      params.set("end", endDateTime.toISOString());
      params.set("range", windowLabel);

      if (summaryScope === "user") {
        if (!selectedEmployeeId) {
          setReport(null);
          setReportError("Select an employee first.");
          return;
        }
        if (!selectedEmployee) {
          setReport(null);
          setReportError("Selected employee is not available in this workspace. Refresh the page and select an employee again.");
          return;
        }
        params.set("userId", selectedEmployeeId);
      } else if (scopedEmployeeIds.length > 0) {
        params.set("userIds", scopedEmployeeIds.join(","));
      }

      const response = await fetch(`/api/ai-screenshot-report?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        success: boolean;
        message?: string;
        data?: ScreenshotReport & {
          markdown?: string;
          report_date?: string;
          scope?: "team" | "user";
          total_analyzed_screenshots?: number;
          total_duration?: string;
          productivity_score?: number;
          executive_summary?: string;
          category_breakdown?: CategoryBreakdown[];
          top_tasks?: TopTask[];
          task_details?: TaskDetail[];
          activity_timeline?: ActivityTimelineItem[];
          distraction_alerts?: string[];
          requiredScreenshots?: number;
          analyzedScreenshots?: number;
          recommendations?: string[];
          range?: string;
        };
      };

      if (!response.ok || !payload.success || !payload.data) {
        setReport(null);
        const analyzed = payload.data?.analyzedScreenshots;
        const required = payload.data?.requiredScreenshots ?? Number(minScreenshots);
        setReportError(
          analyzed !== undefined
            ? `Not enough screenshots in this range. Required ${required}, found ${analyzed}.`
            : payload.message ?? "Unable to load screenshot intelligence.",
        );
        return;
      }

      setReport({
        date: payload.data.date ?? payload.data.report_date ?? reportDate,
        userId: payload.data.userId ?? "",
        markdown: payload.data.markdown ?? "",
        updatedAt: payload.data.updatedAt ?? new Date().toISOString(),
        scope: payload.data.scope,
        range: payload.data.range,
        analyzedScreenshots: payload.data.total_analyzed_screenshots,
        totalDuration: payload.data.total_duration,
        productivityScore: payload.data.productivity_score,
        executiveSummary: payload.data.executive_summary,
        categoryBreakdown: payload.data.category_breakdown ?? [],
        topTasks: payload.data.top_tasks ?? [],
        taskDetails: payload.data.task_details ?? [],
        activityTimeline: payload.data.activity_timeline ?? [],
        distractionAlerts: payload.data.distraction_alerts ?? [],
        recommendations: payload.data.recommendations ?? [],
      });
    } catch (error) {
      setReport(null);
      setReportError(error instanceof Error ? error.message : "Unable to load screenshot intelligence.");
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedEmployeeId) return;
    if (!employees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId("");
    }
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    if (summaryScope === "user" && !selectedEmployeeId && employees.length > 0) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId, summaryScope]);

  const applyWindowMinutes = (minutes: number) => {
    const startDateTime = new Date(`${reportDate}T${startTime}:00`);
    if (Number.isNaN(startDateTime.getTime())) return;
    const endDateTime = new Date(startDateTime.getTime() + minutes * 60 * 1000);
    setEndTime(endDateTime.toTimeString().slice(0, 5));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <BrainCircuit className="h-4 w-4 text-brand" />
            Screenshot Intelligence
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">AI Work Summary</h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ring-1 ${hasReport ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>
            {hasReport ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            {hasReport ? `Generated ${report?.range ?? windowLabel}` : "Ready"}
          </span>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div>
              <FieldLabel>Report Scope</FieldLabel>
              <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-1">
                {(["team", "user"] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setSummaryScope(scope)}
                    className={`flex h-9 items-center justify-center gap-2 rounded-md text-xs font-semibold transition ${
                      summaryScope === scope ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                    type="button"
                  >
                    {scope === "team" ? <Users className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                    {scope === "team" ? "Team" : "Employee"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {summaryScope === "user" ? (
                <div className="xl:col-span-2">
                  <FieldLabel>Employee</FieldLabel>
                  <select
                    value={selectedEmployeeId}
                    onChange={(event) => setSelectedEmployeeId(event.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
                  >
                    <option value="">Select employee</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="xl:col-span-2">
                  <FieldLabel>Team Coverage</FieldLabel>
                  <div className="mt-2 flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                    {scopedEmployeeIds.length || employees.length} employees
                  </div>
                </div>
              )}

              <div>
                <FieldLabel>Date</FieldLabel>
                <div className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(event) => setReportDate(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none"
                  />
                </div>
              </div>

              <div>
                <FieldLabel>From</FieldLabel>
                <div className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                  <Clock3 className="h-4 w-4 text-slate-400" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none"
                  />
                </div>
              </div>

              <div>
                <FieldLabel>To</FieldLabel>
                <div className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
                  <Clock3 className="h-4 w-4 text-slate-400" />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {[30, 50, 60].map((minutes) => (
                <button
                  key={minutes}
                  onClick={() => applyWindowMinutes(minutes)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                  type="button"
                >
                  {minutes} min
                </button>
              ))}
              <select
                value={minScreenshots}
                onChange={(event) => setMinScreenshots(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              >
                <option value="3">Min 3 screenshots</option>
                <option value="5">Min 5 screenshots</option>
                <option value="10">Min 10 screenshots</option>
              </select>
            </div>
            <button
              onClick={loadScreenshotReport}
              disabled={reportLoading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
            >
              {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {reportLoading ? "Generating" : "Generate Summary"}
            </button>
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current Selection</p>
              <p className="mt-1 text-sm font-semibold">{summaryScope === "user" ? selectedEmployee?.fullName || "Employee" : "Team"}</p>
            </div>
            <Monitor className="h-5 w-5 text-brand-light" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-white/10 p-3">
              <p className="text-slate-400">Date</p>
              <p className="mt-1 font-semibold text-white">{reportDate}</p>
            </div>
            <div className="rounded-md bg-white/10 p-3">
              <p className="text-slate-400">Range</p>
              <p className="mt-1 font-semibold text-white">{windowLabel}</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-400">
            {reportError ? reportError : hasReport ? report?.executiveSummary : "Summary will appear after generation."}
          </p>
        </aside>
      </section>

      {reportError ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm font-medium text-amber-900">{reportError}</p>
          </div>
        </section>
      ) : null}

      {report ? (
        <main className="space-y-4">
          <section className="grid gap-3 md:grid-cols-4">
            <MetricTile icon={ListChecks} label="Screenshots" value={`${report.analyzedScreenshots ?? 0}`} subValue={`min ${minScreenshots}`} />
            <MetricTile icon={Timer} label="Analyzed Time" value={report.totalDuration ?? "0m"} subValue={report.range ?? windowLabel} />
            <MetricTile icon={Target} label="Score" value={`${report.productivityScore ?? 0}/100`} subValue={dominantCategory?.category ?? "No category"} />
            <MetricTile icon={Activity} label="Scope" value={report.scope === "user" ? "Employee" : "Team"} subValue={selectedEmployee?.fullName} />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <BriefcaseBusiness className="h-4 w-4 text-brand" />
                  Work Summary
                </div>
                <p className="mt-3 text-base leading-7 text-slate-800">
                  {report.executiveSummary || "No clear work pattern could be inferred from this range."}
                </p>
              </div>
              <div className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${scoreTone(report.productivityScore)}`}>
                Productivity {report.productivityScore ?? 0}/100
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold text-slate-900">Category Split</h3>
              </div>
              <div className="mt-4 space-y-3">
                {(report.categoryBreakdown ?? []).map((item) => (
                  <div key={item.category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                      <span>{item.category}</span>
                      <span>{item.duration} | {item.percentage}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, item.percentage)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold text-slate-900">Top Tasks</h3>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {(report.topTasks ?? []).map((item, index) => (
                  <div key={`${item.task}-${index}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="min-w-0 truncate text-xs font-semibold text-slate-700">{index + 1}. {item.task}</span>
                    <span className="shrink-0 text-xs font-semibold text-slate-500">{item.duration}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <BriefcaseBusiness className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold text-slate-900">Exact Work Done</h3>
              </div>
              <div className="mt-4 divide-y divide-slate-100">
                {(report.taskDetails ?? []).map((item, index) => (
                  <article key={`${item.task}-${index}`} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">{item.task}</h4>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${focusClass(item.primary_focus)}`}>
                            {item.primary_focus}
                          </span>
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${categoryClass(item.primary_category)}`}>
                            {item.primary_category}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {item.time_range} | {item.duration} | {(item.applications ?? []).join(", ") || "Unknown app"}
                        </p>
                      </div>
                    </div>
                    {item.evidence?.length ? (
                      <div className="mt-3 grid gap-2">
                        {item.evidence.map((evidence, evidenceIndex) => (
                          <p key={evidenceIndex} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                            {evidence}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold text-slate-900">Timeline</h3>
              </div>
              <div className="mt-4 max-h-[680px] overflow-auto pr-1">
                {(report.activityTimeline ?? []).slice(0, 24).map((item, index) => (
                  <div key={`${item.time}-${index}`} className="relative grid grid-cols-[54px_1fr] gap-3 pb-4 last:pb-0">
                    <div className="text-xs font-semibold text-slate-400">{item.time}</div>
                    <div className="min-w-0 border-l border-slate-200 pl-4">
                      <div className="absolute left-[61px] mt-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand shadow-sm" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{item.application_name}</span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ${focusClass(item.focus_level)}`}>
                          {item.focus_level}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-700">{item.task}</p>
                      {item.user_id && report.scope !== "user" ? (
                        <p className="mt-1 text-[11px] font-medium text-slate-400">{employeeNameById.get(item.user_id) ?? item.user_id}</p>
                      ) : null}
                      {item.evidence ? <p className="mt-2 text-xs leading-5 text-slate-500">{item.evidence}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900">Distraction Alerts</h3>
              </div>
              <div className="mt-3 space-y-2">
                {(report.distractionAlerts?.length ? report.distractionAlerts : ["No significant distractions detected."]).map((item, index) => (
                  <p key={index} className="text-xs leading-5 text-slate-600">{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-slate-900">Recommendations</h3>
              </div>
              <div className="mt-3 space-y-2">
                {(report.recommendations?.length ? report.recommendations : ["No recommendation available for this range."]).map((item, index) => (
                  <p key={index} className="text-xs leading-5 text-slate-600">{item}</p>
                ))}
              </div>
            </div>
          </section>
        </main>
      ) : !reportError ? (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <BrainCircuit className="mx-auto h-9 w-9 text-brand" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">Ready for analysis</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Select a date and time window to review screenshot intelligence.
          </p>
        </section>
      ) : null}
    </div>
  );
}
