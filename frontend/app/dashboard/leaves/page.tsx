"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { 
  Calendar, 
  Check, 
  X, 
  Plus, 
  Clock, 
  ShieldAlert, 
  Settings as SettingsIcon, 
  CalendarDays, 
  FileText, 
  UserCheck 
} from "lucide-react";

type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

type LeaveType = {
  id: string;
  organizationId: string;
  name: string;
  maxDays: number;
};

type LeaveBalance = {
  id: string;
  userId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  allocatedDays: number;
  usedDays: number;
};

type LeaveRequest = {
  id: string;
  userId: string;
  employeeName: string;
  email: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  approvedBy?: string;
  managerComment?: string;
  createdAt: string;
};

type Holiday = {
  id: string;
  organizationId: string;
  name: string;
  date: string;
};

export default function LeavesPage() {
  const { authHeaders, apiBase, user } = useAuth();
  const isManager = user?.role === "MANAGER" || user?.role === "SUPERADMIN";

  const [activeTab, setActiveTab] = useState<"my-requests" | "approvals" | "config">("my-requests");
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // Modals / Form states
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  // Approval process state
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [managerComment, setManagerComment] = useState("");
  const [approvalDecision, setApprovalDecision] = useState<boolean | null>(null);

  // Policy creation states
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeMaxDays, setNewTypeMaxDays] = useState(10);
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");

  // Common UI states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchData = async () => {
    if (!authHeaders) return;
    setLoading(true);
    setError("");
    try {
      // Leave types
      const typesRes = await fetch(`${apiBase}/api/web/leaves/types`, { headers: authHeaders });
      const typesData = await typesRes.json();
      if (typesRes.ok) setLeaveTypes(typesData.data || []);

      // Leave balances
      const balRes = await fetch(`${apiBase}/api/web/leaves/balances`, { headers: authHeaders });
      const balData = await balRes.json();
      if (balRes.ok) setLeaveBalances(balData.data || []);

      // Leave requests
      const reqRes = await fetch(`${apiBase}/api/web/leaves`, { headers: authHeaders });
      const reqData = await reqRes.json();
      if (reqRes.ok) setLeaveRequests(reqData.data || []);

      // Holidays
      const holRes = await fetch(`${apiBase}/api/web/holidays`, { headers: authHeaders });
      const holData = await holRes.json();
      if (holRes.ok) setHolidays(holData.data || []);

    } catch (e) {
      setError("Failed to fetch HRMS data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [apiBase, authHeaders]);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeaders) return;
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`${apiBase}/api/web/leaves`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ leaveTypeId: selectedLeaveTypeId, startDate, endDate, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to submit leave request.");
        return;
      }
      setSuccessMsg("Leave request submitted successfully!");
      setRequestModalOpen(false);
      setSelectedLeaveTypeId("");
      setStartDate("");
      setEndDate("");
      setReason("");
      void fetchData();
    } catch {
      setError("Connection error. Please try again.");
    }
  };

  const handleProcessApproval = async (requestId: string, approve: boolean) => {
    if (!authHeaders) return;
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`${apiBase}/api/web/leaves/${requestId}/approve`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ approved: approve, comment: managerComment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to process leave request.");
        return;
      }
      setSuccessMsg(approve ? "Request approved successfully!" : "Request rejected.");
      setProcessingRequestId(null);
      setManagerComment("");
      void fetchData();
    } catch {
      setError("Failed to communicate approval choice.");
    }
  };

  const handleCreateLeaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeaders) return;
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`${apiBase}/api/web/leaves/types`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTypeName, maxDays: newTypeMaxDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to create leave type.");
        return;
      }
      setSuccessMsg("Leave type added!");
      setNewTypeName("");
      void fetchData();
    } catch {
      setError("Failed to create leave type.");
    }
  };

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeaders) return;
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch(`${apiBase}/api/web/holidays`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newHolidayName, date: newHolidayDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to add holiday.");
        return;
      }
      setSuccessMsg("Public holiday added!");
      setNewHolidayName("");
      setNewHolidayDate("");
      void fetchData();
    } catch {
      setError("Failed to create holiday.");
    }
  };

  const getStatusColor = (status: LeaveStatus) => {
    switch (status) {
      case "APPROVED": return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "REJECTED": return "bg-rose-50 text-rose-700 border-rose-100";
      default: return "bg-amber-50 text-amber-700 border-amber-100";
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 text-[#312D29]">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#171717]">Leaves & HRMS</h1>
          <p className="text-sm font-medium text-[#70675F]">
            Track leave balances, submit leave applications, and manage organization calendar.
          </p>
        </div>
        <button
          onClick={() => {
            setError("");
            setSuccessMsg("");
            setRequestModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#312D29] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black/90 focus:outline-none"
        >
          <Plus className="h-4 w-4" />
          Request Leave
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-3 border border-rose-100 bg-rose-50 p-4 text-sm font-medium text-rose-700">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-3 border border-emerald-100 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          <Check className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-4">
        {leaveBalances.length === 0 ? (
          <div className="col-span-full border border-dashed border-[#E7E0DA] bg-[#FDFBF7] p-8 text-center text-sm text-[#70675F]">
            No leave policies configured yet. Setup leave types in settings to start tracking balances.
          </div>
        ) : (
          leaveBalances.map((bal) => (
            <div key={bal.id} className="border border-[#E7E0DA] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#9A9088]">{bal.leaveTypeName}</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-3xl font-semibold tracking-tight text-[#171717]">{bal.allocatedDays - bal.usedDays}</span>
                <span className="text-sm font-medium text-[#70675F]">days left</span>
              </div>
              <div className="mt-4 h-1.5 w-full bg-[#F3EFE9]">
                <div 
                  className="h-full bg-[#312D29] transition-all" 
                  style={{ width: `${Math.min(100, (bal.usedDays / bal.allocatedDays) * 100)}%` }} 
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-medium text-[#8C837B]">
                <span>{bal.usedDays} used</span>
                <span>{bal.allocatedDays} total</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-[#E7E0DA]">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("my-requests")}
            className={`pb-4 text-sm font-semibold tracking-wide transition-all ${
              activeTab === "my-requests"
                ? "border-b-2 border-[#312D29] text-[#171717]"
                : "text-[#8C837B] hover:text-[#4A423C]"
            }`}
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              My Requests
            </span>
          </button>
          {isManager && (
            <>
              <button
                onClick={() => setActiveTab("approvals")}
                className={`pb-4 text-sm font-semibold tracking-wide transition-all ${
                  activeTab === "approvals"
                    ? "border-b-2 border-[#312D29] text-[#171717]"
                    : "text-[#8C837B] hover:text-[#4A423C]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Team Requests
                </span>
              </button>
              <button
                onClick={() => setActiveTab("config")}
                className={`pb-4 text-sm font-semibold tracking-wide transition-all ${
                  activeTab === "config"
                    ? "border-b-2 border-[#312D29] text-[#171717]"
                    : "text-[#8C837B] hover:text-[#4A423C]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <SettingsIcon className="h-4 w-4" />
                  Settings & Policies
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm font-medium text-[#70675F]">
          Loading leave and HRMS details...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tab 1: My Requests */}
          {activeTab === "my-requests" && (
            <div className="overflow-hidden border border-[#E7E0DA] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E7E0DA] bg-[#FAF8F5] text-xs font-semibold uppercase tracking-wider text-[#70675F]">
                    <th className="p-4">Type</th>
                    <th className="p-4">Dates</th>
                    <th className="p-4">Duration</th>
                    <th className="p-4">Reason</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E0DA] text-sm">
                  {leaveRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[#9A9088]">
                        You haven't requested any leaves yet.
                      </td>
                    </tr>
                  ) : (
                    leaveRequests
                      .filter((req) => req.userId === user?.id)
                      .map((req) => (
                        <tr key={req.id} className="hover:bg-[#FCFAF8] transition-colors">
                          <td className="p-4 font-semibold text-[#171717]">{req.leaveTypeName}</td>
                          <td className="p-4 font-medium text-[#4A423C]">{req.startDate} to {req.endDate}</td>
                          <td className="p-4 font-medium text-[#4A423C]">{req.totalDays} days</td>
                          <td className="p-4 max-w-xs truncate text-[#70675F]">{req.reason || "—"}</td>
                          <td className="p-4">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusColor(req.status)}`}>
                              {req.status}
                            </span>
                          </td>
                          <td className="p-4 text-xs font-medium text-[#8C837B] max-w-xs truncate">
                            {req.managerComment || "—"}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 2: Approvals (Manager view) */}
          {activeTab === "approvals" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-[#171717]">Pending Leave Requests</h2>
              <div className="overflow-hidden border border-[#E7E0DA] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E7E0DA] bg-[#FAF8F5] text-xs font-semibold uppercase tracking-wider text-[#70675F]">
                      <th className="p-4">Employee</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Duration</th>
                      <th className="p-4">Dates</th>
                      <th className="p-4">Reason</th>
                      <th className="p-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E0DA] text-sm">
                    {leaveRequests.filter((req) => req.status === "PENDING").length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[#9A9088]">
                          No pending leave requests.
                        </td>
                      </tr>
                    ) : (
                      leaveRequests
                        .filter((req) => req.status === "PENDING")
                        .map((req) => (
                          <tr key={req.id} className="hover:bg-[#FCFAF8] transition-colors">
                            <td className="p-4">
                              <p className="font-semibold text-[#171717]">{req.employeeName}</p>
                              <p className="text-xs text-[#8C837B]">{req.email}</p>
                            </td>
                            <td className="p-4 font-semibold text-[#171717]">{req.leaveTypeName}</td>
                            <td className="p-4 font-medium text-[#4A423C]">{req.totalDays} days</td>
                            <td className="p-4 font-medium text-[#4A423C]">{req.startDate} to {req.endDate}</td>
                            <td className="p-4 max-w-xs truncate text-[#70675F]">{req.reason || "—"}</td>
                            <td className="p-4">
                              {processingRequestId === req.id ? (
                                <div className="flex flex-col gap-2 min-w-[200px]">
                                  <textarea
                                    value={managerComment}
                                    onChange={(e) => setManagerComment(e.target.value)}
                                    placeholder="Add optional comment..."
                                    className="w-full border border-[#D9CEC6] p-1.5 text-xs focus:border-[#312D29] focus:outline-none"
                                    rows={2}
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleProcessApproval(req.id, true)}
                                      className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleProcessApproval(req.id, false)}
                                      className="rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                                    >
                                      Reject
                                    </button>
                                    <button
                                      onClick={() => setProcessingRequestId(null)}
                                      className="rounded border border-[#E7E0DA] bg-white px-2 py-1 text-xs font-semibold hover:bg-[#F3EFE9]"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setProcessingRequestId(req.id);
                                    setManagerComment("");
                                  }}
                                  className="rounded border border-[#312D29] bg-white px-3 py-1 text-xs font-semibold text-[#312D29] hover:bg-[#F3EFE9] transition-all"
                                >
                                  Process Request
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Configuration & Holidays */}
          {activeTab === "config" && (
            <div className="grid gap-8 md:grid-cols-2">
              {/* Leave Types Config */}
              <div className="space-y-4 border border-[#E7E0DA] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                <h2 className="text-lg font-semibold text-[#171717] flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#70675F]" />
                  Leave Policies
                </h2>
                <form onSubmit={handleCreateLeaveType} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#70675F]">Leave Type Name</label>
                    <input
                      type="text"
                      required
                      value={newTypeName}
                      onChange={(e) => setNewTypeName(e.target.value)}
                      placeholder="e.g. Annual Leave, Sick Leave"
                      className="mt-1 w-full border border-[#D9CEC6] bg-[#FCFAF8] p-2.5 text-sm focus:border-[#312D29] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#70675F]">Max Days Per Year</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={newTypeMaxDays}
                      onChange={(e) => setNewTypeMaxDays(parseInt(e.target.value))}
                      className="mt-1 w-full border border-[#D9CEC6] bg-[#FCFAF8] p-2.5 text-sm focus:border-[#312D29] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-[#312D29] py-2 text-sm font-semibold text-white hover:bg-black/90"
                  >
                    Add Leave Type
                  </button>
                </form>

                <div className="mt-6 space-y-2 border-t border-[#EFE8E2] pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8C837B]">Configured Leave Types</h3>
                  {leaveTypes.length === 0 ? (
                    <p className="text-sm text-[#9A9088]">No leave types set.</p>
                  ) : (
                    <div className="divide-y divide-[#EFE8E2]">
                      {leaveTypes.map((lt) => (
                        <div key={lt.id} className="flex justify-between py-2 text-sm">
                          <span className="font-medium text-[#312D29]">{lt.name}</span>
                          <span className="font-semibold text-[#70675F]">{lt.maxDays} days/year</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Holidays Config */}
              <div className="space-y-4 border border-[#E7E0DA] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                <h2 className="text-lg font-semibold text-[#171717] flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-[#70675F]" />
                  Public Holiday Calendar
                </h2>
                <form onSubmit={handleCreateHoliday} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#70675F]">Holiday Name</label>
                    <input
                      type="text"
                      required
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      placeholder="e.g. Christmas Day, New Year"
                      className="mt-1 w-full border border-[#D9CEC6] bg-[#FCFAF8] p-2.5 text-sm focus:border-[#312D29] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#70675F]">Date</label>
                    <input
                      type="date"
                      required
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      className="mt-1 w-full border border-[#D9CEC6] bg-[#FCFAF8] p-2.5 text-sm focus:border-[#312D29] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-[#312D29] py-2 text-sm font-semibold text-white hover:bg-black/90"
                  >
                    Add Holiday
                  </button>
                </form>

                <div className="mt-6 space-y-2 border-t border-[#EFE8E2] pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8C837B]">Holiday List</h3>
                  {holidays.length === 0 ? (
                    <p className="text-sm text-[#9A9088]">No holidays added yet.</p>
                  ) : (
                    <div className="max-h-[160px] overflow-y-auto divide-y divide-[#EFE8E2]">
                      {holidays.map((h) => (
                        <div key={h.id} className="flex justify-between py-2 text-sm">
                          <span className="font-medium text-[#312D29]">{h.name}</span>
                          <span className="font-semibold text-[#70675F]">{h.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Leave Application Request Form */}
      {requestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md border border-[#E7E0DA] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#EFE8E2] pb-3 mb-4">
              <h2 className="text-xl font-semibold text-[#171717] flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#312D29]" />
                Apply for Leave
              </h2>
              <button 
                onClick={() => setRequestModalOpen(false)}
                className="text-[#8C837B] hover:text-[#4A423C] focus:outline-none"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#70675F]">Leave Type</label>
                <select
                  required
                  value={selectedLeaveTypeId}
                  onChange={(e) => setSelectedLeaveTypeId(e.target.value)}
                  className="mt-1 w-full border border-[#D9CEC6] bg-[#FCFAF8] p-2.5 text-sm focus:border-[#312D29] focus:bg-white focus:outline-none"
                >
                  <option value="">Select a Leave Type</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>{lt.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#70675F]">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1 w-full border border-[#D9CEC6] bg-[#FCFAF8] p-2.5 text-sm focus:border-[#312D29] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#70675F]">End Date</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 w-full border border-[#D9CEC6] bg-[#FCFAF8] p-2.5 text-sm focus:border-[#312D29] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#70675F]">Reason</label>
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why you need this leave..."
                  className="mt-1 w-full border border-[#D9CEC6] bg-[#FCFAF8] p-2.5 text-sm focus:border-[#312D29] focus:bg-white focus:outline-none"
                  rows={3}
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#312D29] py-2.5 text-sm font-semibold text-white hover:bg-black/90 transition-colors"
              >
                Submit Application
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
