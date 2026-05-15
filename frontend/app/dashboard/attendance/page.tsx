"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Circle, Clock, MapPin, RefreshCw, Users } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import DashboardDateFilter from "../../../components/DashboardDateFilter";

type AttendanceStatus = "attended" | "working" | "below" | "absent" | "weekend" | "future";

type AttendanceCell = {
  date: string;
  day: number;
  status: AttendanceStatus;
  workSeconds: number;
  shiftName: string | null;
  locationStatus: string | null;
  clockInAt: string | null;
  clockOutAt: string | null;
  sessions: Array<{
    id: string;
    clockInAt: string;
    clockOutAt: string | null;
    workSeconds: number;
    shiftName: string;
    locationType: string | null;
    isCurrentlyWorking: boolean;
  }>;
};

type AttendanceEmployee = {
  userId: string;
  employeeName: string;
  email: string;
  initials: string;
  attendedDays: number;
  belowThresholdDays: number;
  absentDays: number;
  workingDays: number;
  officeDays: number;
  remoteDays: number;
  shiftSummary: string;
  cells: AttendanceCell[];
};

type AttendanceOverview = {
  month: string;
  thresholdMinutes: number;
  daysInMonth: number;
  stats: {
    attendedDays: number;
    currentlyWorking: number;
    belowThreshold: number;
    employees: number;
    officeDays: number;
    remoteDays: number;
  };
  employees: AttendanceEmployee[];
  timesheets: TimesheetEntry[];
};

type TimesheetEntry = {
  id: string;
  userId: string;
  employeeName: string;
  teamName: string | null;
  locationStatus: string | null;
  shiftName: string;
  date: string;
  clockInAt: string;
  clockOutAt: string | null;
  workSeconds: number;
  activeSeconds: number;
  isCurrentlyWorking: boolean;
};

type AttendanceResponse = {
  success: boolean;
  data?: AttendanceOverview;
  message?: string;
};

const statusClass: Record<AttendanceStatus, string> = {
  attended: "bg-brand text-white",
  working: "bg-emerald-500 text-white shadow-[0_0_0_5px_rgba(16,185,129,0.12)]",
  below: "bg-amber-400 text-amber-950",
  absent: "bg-[#DDD6D0] text-[#7E6F65]",
  weekend: "bg-transparent text-[#C8BFB8]",
  future: "bg-transparent text-[#D8D0C9]",
};

const formatHours = (seconds: number): string => {
  const hours = Math.max(0, seconds) / 3600;
  return hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1);
};

const formatClock = (value: string | null): string =>
  value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--";

const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
};

const formatDate = (value: string): string =>
  new Date(`${value}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

const cellLabel = (cell: AttendanceCell): string => {
  if (cell.status === "weekend" || cell.status === "future") return "";
  if (cell.status === "absent") return "-";
  return formatHours(cell.workSeconds);
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#DDD2C9] bg-white p-4 shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
      <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-[11px] font-medium text-[#9A9088]">{label}</span>
        <strong className="mt-1 block text-[22px] font-semibold leading-none text-[#302C28]">{value}</strong>
      </span>
    </div>
  );
}

export default function AttendancePage() {
  const { authHeaders, apiBase, selectedUserId, user, dateRange } = useAuth();
  const [attendance, setAttendance] = useState<AttendanceOverview | null>(null);
  const [activeTab, setActiveTab] = useState<"timesheets" | "attendance">("timesheets");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAttendance = async () => {
    if (!authHeaders) return;

    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      });
      if (user?.role === "MANAGER" && selectedUserId && selectedUserId !== user.id) {
        params.set("userId", selectedUserId);
      }

      const response = await fetch(`${apiBase}/api/web/dashboard/attendance?${params.toString()}`, {
        headers: authHeaders,
        credentials: "include",
      });
      const payload = (await response.json()) as AttendanceResponse;
      if (!response.ok || !payload.success || !payload.data) {
        setAttendance(null);
        setError(payload.message || "Unable to load attendance.");
        return;
      }

      setAttendance(payload.data);
    } catch (requestError) {
      console.error("Failed to load attendance", requestError);
      setAttendance(null);
      setError("Unable to load attendance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAttendance();
  }, [apiBase, authHeaders, dateRange, selectedUserId, user?.id, user?.role]);

  const employees = attendance?.employees ?? [];
  const timesheets = attendance?.timesheets ?? [];
  const stats = attendance?.stats;
  const days = useMemo(() => {
    const firstEmployeeCells = employees[0]?.cells;
    if (firstEmployeeCells && firstEmployeeCells.length > 0) {
      return firstEmployeeCells.map((cell) => ({ date: cell.date, label: String(cell.day) }));
    }
    return Array.from({ length: attendance?.daysInMonth ?? 0 }, (_, index) => ({ date: String(index), label: String(index + 1) }));
  }, [attendance?.daysInMonth, employees]);

  return (
    <div className="space-y-5">
      <div>
        <div>
          <h1 className="text-[18px] font-semibold leading-tight text-[#302C28]">Attendance Calendar</h1>
          <p className="mt-1 text-[13px] font-medium text-[#8C837B]">Clock-ins, shifts, and office or remote status from live work sessions</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <DashboardDateFilter />
        <button
          onClick={() => void fetchAttendance()}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E1D7CE] bg-white px-3 text-[13px] font-medium text-[#302C28] transition hover:bg-[#FCFAF8]"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Attended Days" value={loading ? "..." : String(stats?.attendedDays ?? 0)} icon={CalendarDays} tone="text-brand bg-brand/10" />
        <StatCard label="Currently Working" value={loading ? "..." : String(stats?.currentlyWorking ?? 0)} icon={Clock} tone="text-emerald-700 bg-emerald-50" />
        <StatCard label="Below Threshold" value={loading ? "..." : String(stats?.belowThreshold ?? 0)} icon={Circle} tone="text-amber-700 bg-amber-50" />
        <StatCard label="Office Days" value={loading ? "..." : String(stats?.officeDays ?? 0)} icon={MapPin} tone="text-sky-700 bg-sky-50" />
        <StatCard label="Employees" value={loading ? "..." : String(stats?.employees ?? 0)} icon={Users} tone="text-brand-dark bg-brand-light" />
      </div>

      <div className="border-b border-[#DDD2C9]">
        <div className="flex gap-9">
          {[
            ["timesheets", "Timesheets"],
            ["attendance", "Attendance"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as "timesheets" | "attendance")}
              className={`-mb-px border-b-2 px-0 pb-2 pt-1 text-[15px] font-semibold transition ${
                activeTab === tab ? "border-brand text-brand" : "border-transparent text-[#6F7280] hover:text-[#302C28]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <section className={`${activeTab === "attendance" ? "block" : "hidden"} overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]`}>
        <div className="overflow-x-auto p-4">
          {loading ? (
            <div className="py-12 text-center text-[13px] font-medium text-[#8C837B]">Loading attendance...</div>
          ) : error ? (
            <div className="py-12 text-center text-[13px] font-medium text-red-500">{error}</div>
          ) : employees.length === 0 ? (
            <div className="py-12 text-center text-[13px] font-medium text-[#8C837B]">No employees or attendance records found for this month.</div>
          ) : (
            <table className="min-w-[1260px] w-full border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="w-64 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[#9A9088]">Employee</th>
                  <th className="w-36 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-[#9A9088]">Shift</th>
                  {days.map((day) => (
                    <th key={day.date} className="px-1 py-2 text-center text-[11px] font-medium text-[#9A9088]">
                      {day.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.userId}>
                    <td className="whitespace-nowrap px-3 py-2 text-[13px] font-medium text-[#302C28]">
                      <span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs text-white">
                        {employee.initials}
                      </span>
                      <span>{employee.employeeName}</span>
                      <span className="ml-2 text-[11px] font-medium text-[#9A9088]">
                        {employee.attendedDays} attended · {employee.officeDays} office · {employee.remoteDays} remote
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[12px] font-medium text-[#4A423C]">
                      <span className="inline-flex rounded-md bg-[#F8F5F1] px-2.5 py-1 text-[#70675F]">
                        {employee.shiftSummary}
                      </span>
                    </td>
                    {employee.cells.map((cell) => (
                      <td key={cell.date} className="px-1 py-1 text-center">
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-medium ${statusClass[cell.status]}`}
                          title={[
                            cell.date,
                            cell.shiftName || "No shift",
                            cell.locationStatus || "No location",
                            `${formatClock(cell.clockInAt)} - ${formatClock(cell.clockOutAt)}`,
                            `${formatHours(cell.workSeconds)}h`,
                          ].join(" | ")}
                        >
                          {cellLabel(cell)}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex flex-wrap gap-5 border-t border-[#EFE8E2] px-5 py-4 text-[12px] font-medium text-[#8C837B]">
          {[
            ["Attended", "bg-brand"],
            ["Currently Working", "bg-emerald-500"],
            ["Below Threshold", "bg-amber-400"],
            ["Absent", "bg-[#DDD6D0]"],
            ["Office/Remote shown in hover", "bg-sky-500"],
          ].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${color}`} />
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className={`${activeTab === "timesheets" ? "block" : "hidden"} overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]`}>
        <div className="flex flex-col gap-1 border-b border-[#EFE8E2] px-5 py-4">
          <h2 className="text-[15px] font-semibold leading-tight text-[#302C28]">Timesheets</h2>
          <p className="text-[12px] font-medium text-[#8C837B]">Every clock-in and clock-out session as a separate entry</p>
        </div>
        <div className="overflow-x-auto p-4">
          {loading ? (
            <div className="py-10 text-center text-[13px] font-medium text-[#8C837B]">Loading timesheets...</div>
          ) : error ? (
            <div className="py-10 text-center text-[13px] font-medium text-red-500">{error}</div>
          ) : timesheets.length === 0 ? (
            <div className="py-10 text-center text-[13px] font-medium text-[#8C837B]">No timesheet entries found for this month.</div>
          ) : (
            <table className="min-w-[1080px] w-full border-collapse">
              <thead>
                <tr className="border-b border-[#EFE8E2] bg-[#F8F5F1]">
                  {["Employee", "Team", "Location", "Shift", "Date", "Clock In", "Clock Out", "Work Time", "Active Time"].map((heading) => (
                    <th key={heading} className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[#8C837B]">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1ECE7]">
                {timesheets.map((entry) => (
                  <tr key={entry.id} className="transition hover:bg-[#FCFAF8]">
                    <td className="whitespace-nowrap px-3 py-3 text-[13px] font-medium text-[#302C28]">{entry.employeeName}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[12px] font-medium text-[#70675F]">{entry.teamName || "No team"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[12px] font-medium text-[#70675F]">{entry.locationStatus || "Unknown"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[12px] font-medium text-[#70675F]">{entry.shiftName}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[12px] font-medium text-[#70675F]">{formatDate(entry.date)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[12px] font-medium text-[#302C28]">{formatClock(entry.clockInAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[12px] font-medium text-[#302C28]">
                      {entry.clockOutAt ? formatClock(entry.clockOutAt) : entry.isCurrentlyWorking ? "Working" : "Open"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[12px] font-medium text-[#302C28]">{formatDuration(entry.workSeconds)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[12px] font-medium text-[#302C28]">{formatDuration(entry.activeSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
