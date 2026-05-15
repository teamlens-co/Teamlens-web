"use client";

import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Clock, Plus, Send, X } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import ThemedSelect from "../../../components/ThemedSelect";

type ManualTimeStatus = "PENDING" | "APPROVED" | "REJECTED";

type ManualTimeRequest = {
  id: string;
  userId: string;
  employeeName: string;
  employeeEmail: string;
  requestedByName: string;
  reviewedByName: string | null;
  startAt: string;
  endAt: string;
  durationSeconds: number;
  reason: string;
  status: ManualTimeStatus;
  reviewNote: string | null;
  createdAt: string;
};

type TeamUser = {
  id: string;
  fullName: string;
  email: string;
};

const statusTone: Record<ManualTimeStatus, string> = {
  APPROVED: "bg-[oklch(0.95_0.04_155)] text-[oklch(0.45_0.16_155)]",
  PENDING: "bg-[oklch(0.96_0.04_75)] text-[oklch(0.5_0.16_75)]",
  REJECTED: "bg-[oklch(0.96_0.04_27)] text-[oklch(0.5_0.22_27)]",
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

function StatCard({
  label,
  value,
  tone = "primary",
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: "primary" | "success" | "warning" | "danger";
  icon: ComponentType<{ className?: string }>;
}) {
  const toneClass = {
    primary: "bg-[var(--brand-tint)] text-primary",
    success: "bg-[oklch(0.95_0.04_155)] text-[oklch(0.45_0.16_155)]",
    warning: "bg-[oklch(0.96_0.04_75)] text-[oklch(0.5_0.16_75)]",
    danger: "bg-[oklch(0.96_0.04_27)] text-[oklch(0.5_0.22_27)]",
  }[tone];

  return (
    <div className="rounded-xl border border-border bg-[var(--surface-2)] p-4 shadow-[0_1px_2px_rgba(45,42,38,0.04)]">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11.5px] text-muted-foreground">{label}</div>
          <div className="mt-1 text-[22px] font-semibold">{value}</div>
        </div>
        <div className={`grid size-8 place-items-center rounded-lg ${toneClass}`}>
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

export default function ManualTimePage() {
  const { authHeaders, apiBase, user } = useAuth();
  const isManager = user?.role === "MANAGER";
  const [requests, setRequests] = useState<ManualTimeRequest[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    userId: "",
    date: todayKey(),
    startTime: "09:00",
    endTime: "10:00",
    reason: "",
  });

  const loadRequests = useCallback(async () => {
    if (!authHeaders) return;
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/web/dashboard/manual-time-requests`, {
        headers: authHeaders,
        credentials: "include",
        cache: "no-store",
      });
      const json = await response.json();
      setRequests(json.success ? json.data : []);
    } catch (error) {
      console.error("Failed to load manual time requests", error);
      setMessage("Unable to load manual time requests.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (!authHeaders || !isManager) return;
    fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setTeamUsers(json.data);
          setForm((current) => ({ ...current, userId: current.userId || json.data?.[0]?.id || "" }));
        }
      })
      .catch((error) => console.error("Failed to load employees", error));
  }, [apiBase, authHeaders, isManager]);

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      if (statusFilter !== "ALL" && request.status !== statusFilter) return false;
      if (employeeFilter !== "ALL" && request.userId !== employeeFilter) return false;
      return true;
    });
  }, [employeeFilter, requests, statusFilter]);

  const stats = useMemo(() => {
    const total = requests.reduce((sum, request) => sum + request.durationSeconds, 0);
    const approved = requests.filter((request) => request.status === "APPROVED").reduce((sum, request) => sum + request.durationSeconds, 0);
    const pending = requests.filter((request) => request.status === "PENDING").reduce((sum, request) => sum + request.durationSeconds, 0);
    const rejected = requests.filter((request) => request.status === "REJECTED").reduce((sum, request) => sum + request.durationSeconds, 0);
    return { total, approved, pending, rejected };
  }, [requests]);

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authHeaders) return;

    setSubmitting(true);
    setMessage("");
    try {
      const startAt = new Date(`${form.date}T${form.startTime}:00`);
      const endAt = new Date(`${form.date}T${form.endTime}:00`);
      const response = await fetch(`${apiBase}/api/web/dashboard/manual-time-requests`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({
          ...(isManager && form.userId ? { userId: form.userId } : {}),
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          reason: form.reason,
        }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.message || "Unable to submit request");

      setForm((current) => ({ ...current, reason: "" }));
      setMessage(isManager ? "Manual time request created." : "Manual time request sent to your manager.");
      setModalOpen(false);
      await loadRequests();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  const reviewRequest = async (id: string, status: "APPROVED" | "REJECTED") => {
    if (!authHeaders) return;
    setMessage("");
    try {
      const response = await fetch(`${apiBase}/api/web/dashboard/manual-time-requests/${id}/review`, {
        method: "PATCH",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.message || "Unable to review request");
      setMessage(status === "APPROVED" ? "Request approved and added to manual hours." : "Request rejected.");
      await loadRequests();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to review request.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Manual Time</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {isManager ? "Review and approve manually-logged work" : "Request missing or off-platform work hours"}
          </p>
        </div>
        <button
          onClick={() => void loadRequests()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12.5px] hover:bg-accent/50"
        >
          <Clock className="size-3.5" /> Refresh
        </button>
      </div>

      <button
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90"
      >
        {isManager ? <Plus className="size-3.5" /> : <Plus className="size-3.5" />}
        {isManager ? "Create request" : "Request time"}
      </button>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="This week" value={formatDuration(stats.total)} icon={Clock} />
        <StatCard label="Approved" value={formatDuration(stats.approved)} tone="success" icon={CheckCircle2} />
        <StatCard label="Pending" value={formatDuration(stats.pending)} tone="warning" icon={AlertCircle} />
        <StatCard label="Rejected" value={formatDuration(stats.rejected)} tone="danger" icon={AlertCircle} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <section className="overflow-hidden rounded-xl border border-border bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(45,42,38,0.04)]">
          <div className="flex flex-wrap gap-2 border-b border-border p-3">
            <ThemedSelect
              label="Statuses"
              value={statusFilter}
              onChange={setStatusFilter}
              minWidth={160}
              options={[
                { label: "All statuses", value: "ALL" },
                { label: "Pending", value: "PENDING" },
                { label: "Approved", value: "APPROVED" },
                { label: "Rejected", value: "REJECTED" },
              ]}
            />
            {isManager && (
              <ThemedSelect
                label="Employees"
                value={employeeFilter}
                onChange={setEmployeeFilter}
                minWidth={180}
                options={[
                  { label: "All employees", value: "ALL" },
                  ...teamUsers.map((teamUser) => ({ label: teamUser.fullName, value: teamUser.id })),
                ]}
              />
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-[12.5px]">
              <thead className="bg-muted/30 text-left text-muted-foreground">
                <tr>
                  {["Employee", "Date", "Start", "End", "Duration", "Reason", "Status", ""].map((heading) => (
                    <th key={heading} className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                      Loading requests...
                    </td>
                  </tr>
                ) : filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-[12.5px] text-muted-foreground">
                      No manual time requests found.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => (
                    <tr key={request.id} className="border-t border-border hover:bg-accent/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{request.employeeName}</div>
                        <div className="text-[11px] text-muted-foreground">{request.employeeEmail}</div>
                      </td>
                      <td className="px-4 py-3">{formatDate(request.startAt)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatTime(request.startAt)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatTime(request.endAt)}</td>
                      <td className="px-4 py-3 font-medium text-primary">{formatDuration(request.durationSeconds)}</td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-muted-foreground">{request.reason}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone[request.status]}`}>
                          {request.status[0] + request.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isManager && request.status === "PENDING" ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => void reviewRequest(request.id, "APPROVED")}
                              className="grid size-7 place-items-center rounded-md bg-[oklch(0.95_0.04_155)] text-[oklch(0.45_0.16_155)] hover:bg-[oklch(0.92_0.06_155)]"
                              aria-label="Approve request"
                            >
                              <Check className="size-3.5" />
                            </button>
                            <button
                              onClick={() => void reviewRequest(request.id, "REJECTED")}
                              className="grid size-7 place-items-center rounded-md bg-[oklch(0.96_0.04_27)] text-[oklch(0.5_0.22_27)] hover:bg-[oklch(0.93_0.06_27)]"
                              aria-label="Reject request"
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {request.reviewedByName ? `by ${request.reviewedByName}` : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Manual Time Request Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-[14px] font-semibold">{isManager ? "Create manual request" : "Request manual time"}</h2>
              <button
                onClick={() => setModalOpen(false)}
                className="grid size-6 place-items-center rounded-md hover:bg-accent/50"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-4">
              <form className="space-y-2.5" onSubmit={(e) => {
                submitRequest(e);
              }}>
                {isManager && (
                  <label className="block">
                    <div className="mb-1 text-[11.5px] text-muted-foreground">Employee</div>
                    <ThemedSelect
                      label="Employee"
                      value={form.userId}
                      onChange={(nextValue) => setForm((current) => ({ ...current, userId: nextValue }))}
                      minWidth={260}
                      options={teamUsers.map((teamUser) => ({ label: teamUser.fullName, value: teamUser.id }))}
                    />
                  </label>
                )}
                <label className="block">
                  <div className="mb-1 text-[11.5px] text-muted-foreground">Date</div>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px]"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <div className="mb-1 text-[11.5px] text-muted-foreground">Start time</div>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                      className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px]"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-1 text-[11.5px] text-muted-foreground">End time</div>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                      className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px]"
                    />
                  </label>
                </div>
                <label className="block">
                  <div className="mb-1 text-[11.5px] text-muted-foreground">Reason / notes</div>
                  <textarea
                    rows={3}
                    value={form.reason}
                    onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                    placeholder="Client meeting, workshop, off-platform task..."
                    className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] outline-none placeholder:text-muted-foreground focus:border-primary"
                  />
                </label>
                <button
                  type="submit"
                  disabled={submitting || !form.reason.trim()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isManager ? <Plus className="size-3.5" /> : <Send className="size-3.5" />}
                  {submitting ? "Submitting..." : isManager ? "Create request" : "Submit for approval"}
                </button>
              </form>
              {message && <p className="mt-3 rounded-md bg-background px-3 py-2 text-[12px] text-muted-foreground">{message}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
