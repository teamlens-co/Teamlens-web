"use client";

import { useEffect, useState } from "react";
import { Users, Loader2, Search, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";

type SuperAdminUserItem = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  organizationId: string;
  organization: string;
  createdAt: string;
};

export default function SuperAdminUsersPage() {
  const { apiBase, authHeaders } = useAuth();
  const [users, setUsers] = useState<SuperAdminUserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"" | "MANAGER" | "EMPLOYEE">("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchUsers = async () => {
    if (!authHeaders) return;
    setLoadingUsers(true);
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (userRoleFilter) params.set("role", userRoleFilter);
      if (userSearch.trim()) params.set("search", userSearch.trim());
      const res = await fetch(`${apiBase}/api/web/superadmin/users?${params.toString()}`, {
        headers: authHeaders as any,
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setUsers(json.data || []);
      } else {
        setErrorMsg(json.message || "Failed to load users");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error loading users.");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (authHeaders) fetchUsers();
  }, [apiBase, authHeaders]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (authHeaders) fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, userRoleFilter, apiBase, authHeaders]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-brand" />
            Global Users Monitor
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search and filter every manager and employee across all tenant companies.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          disabled={loadingUsers}
          className="inline-flex items-center gap-2 bg-card hover:bg-accent/40 text-foreground border border-border rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-wider transition active:scale-[0.98] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="text-xs font-semibold">{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="text-xs font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">All Users</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {users.length} user{users.length !== 1 ? "s" : ""} found
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl p-1">
              {(["", "MANAGER", "EMPLOYEE"] as const).map((role) => (
                <button
                  key={role || "all"}
                  onClick={() => setUserRoleFilter(role)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                    userRoleFilter === role
                      ? "bg-brand text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  }`}
                >
                  {role === "" ? "All" : role === "MANAGER" ? "Managers" : "Employees"}
                </button>
              ))}
            </div>

            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-2 px-10 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:border-brand outline-none transition"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-4 px-6">User</th>
                <th className="py-4 px-6">Role</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Organization</th>
                <th className="py-4 px-6">Created</th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center">
                    <Loader2 className="h-6 w-6 text-brand animate-spin mx-auto" />
                    <span className="text-xs text-muted-foreground mt-2 block">Loading users...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                    No users found matching your filters.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20 transition"
                  >
                    <td className="py-4 px-6">
                      <div className="font-semibold text-foreground text-xs">{u.fullName}</div>
                      <div className="text-[10px] text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          u.role === "MANAGER"
                            ? "bg-blue-50 text-blue-700 border border-blue-100"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          u.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-rose-50 text-rose-700 border border-rose-100"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-xs text-foreground">{u.organization}</td>
                    <td className="py-4 px-6 text-[10px] text-muted-foreground">{u.createdAt}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
