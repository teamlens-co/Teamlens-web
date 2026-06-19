"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import {
  Building2,
  Users,
  ShieldCheck,
  ShieldAlert,
  Server,
  Zap,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  Mail,
  Network,
  UserCheck,
  UserX,
  CreditCard,
  Calendar,
  X,
} from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";

type ManagerItem = {
  id: string;
  fullName: string;
  email: string;
  employeeCount: number;
};

type OrgDetails = {
  managers: ManagerItem[];
  unassignedEmployeesCount: number;
};


type Stats = {
  totalCompanies: number;
  activeCompanies: number;
  suspendedCompanies: number;
  totalEmployees: number;
  activeSessions: number;
  databaseSizeBytes: number;
  databaseSizePretty: string;
};

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

type Organization = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  isActive: boolean;
  managerCount: number;
  employeeCount: number;
  subscriptionPlan: string;
  subscriptionPrice: number;
  employeeLimit: number;
  billingCycle: string;
  renewalDate: string | null;
};

export default function SuperAdminDashboard() {
  const { apiBase, authHeaders } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Global users monitor
  const [users, setUsers] = useState<SuperAdminUserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"" | "MANAGER" | "EMPLOYEE">("");

  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [orgDetails, setOrgDetails] = useState<Record<string, OrgDetails>>({});
  const [loadingOrgsDetails, setLoadingOrgsDetails] = useState<Record<string, boolean>>({});

  // Subscription states
  const [selectedOrgForSub, setSelectedOrgForSub] = useState<Organization | null>(null);
  const [subForm, setSubForm] = useState({
    subscriptionPlan: "",
    subscriptionPrice: 0,
    employeeLimit: 10,
    billingCycle: "MONTHLY",
    renewalDate: "",
  });
  const [savingSub, setSavingSub] = useState(false);

  const openSubModal = (org: Organization) => {
    setSelectedOrgForSub(org);
    setSubForm({
      subscriptionPlan: org.subscriptionPlan || "BASIC",
      subscriptionPrice: org.subscriptionPrice || 0,
      employeeLimit: org.employeeLimit || 10,
      billingCycle: org.billingCycle || "MONTHLY",
      renewalDate: org.renewalDate || "",
    });
  };

  const handleSaveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeaders || !selectedOrgForSub) return;

    setSavingSub(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${apiBase}/api/web/superadmin/organizations/${selectedOrgForSub.id}/subscription`, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        } as any,
        body: JSON.stringify({
          subscriptionPlan: subForm.subscriptionPlan,
          subscriptionPrice: Number(subForm.subscriptionPrice),
          employeeLimit: Number(subForm.employeeLimit),
          billingCycle: subForm.billingCycle,
          renewalDate: subForm.renewalDate || null,
        }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setOrgs((prev) =>
          prev.map((o) =>
            o.id === selectedOrgForSub.id
              ? {
                  ...o,
                  subscriptionPlan: subForm.subscriptionPlan,
                  subscriptionPrice: Number(subForm.subscriptionPrice),
                  employeeLimit: Number(subForm.employeeLimit),
                  billingCycle: subForm.billingCycle,
                  renewalDate: subForm.renewalDate || null,
                }
              : o
          )
        );
        setSuccessMsg(`Subscription configured successfully for ${selectedOrgForSub.name}.`);
        setSelectedOrgForSub(null);
      } else {
        setErrorMsg(json.message || "Failed to update subscription details");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error updating subscription details.");
    } finally {
      setSavingSub(false);
    }
  };

  const toggleExpandRow = async (orgId: string) => {
    const next = new Set(expandedOrgs);
    if (next.has(orgId)) {
      next.delete(orgId);
      setExpandedOrgs(next);
    } else {
      next.add(orgId);
      setExpandedOrgs(next);

      if (!orgDetails[orgId] && !loadingOrgsDetails[orgId]) {
        setLoadingOrgsDetails((prev) => ({ ...prev, [orgId]: true }));
        try {
          const res = await fetch(`${apiBase}/api/web/superadmin/organizations/${orgId}/details`, {
            headers: authHeaders as any,
          });
          const json = await res.json();
          if (res.ok && json.success) {
            setOrgDetails((prev) => ({ ...prev, [orgId]: json.data }));
          } else {
            console.error("Failed to load organization details:", json.message);
          }
        } catch (err) {
          console.error("Error fetching org details:", err);
        } finally {
          setLoadingOrgsDetails((prev) => ({ ...prev, [orgId]: false }));
        }
      }
    }
  };

  const fetchData = async () => {
    if (!authHeaders) return;
    setLoading(true);
    setErrorMsg("");
    try {
      // 1. Fetch Stats
      const statsRes = await fetch(`${apiBase}/api/web/superadmin/stats`, {
        headers: authHeaders as any,
      });
      const statsJson = await statsRes.json();

      // 2. Fetch Orgs
      const orgsRes = await fetch(`${apiBase}/api/web/superadmin/organizations`, {
        headers: authHeaders as any,
      });
      const orgsJson = await orgsRes.json();

      if (statsRes.ok && statsJson.success) {
        setStats(statsJson.data);
      } else {
        setErrorMsg(statsJson.message || "Failed to load platform stats");
      }

      if (orgsRes.ok && orgsJson.success) {
        setOrgs(orgsJson.data || []);
      } else {
        setErrorMsg(orgsJson.message || "Failed to load organizations");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error connecting to platform api.");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (!authHeaders) return;
    setLoadingUsers(true);
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
    if (authHeaders) {
      fetchData();
      fetchUsers();
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (authHeaders) fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, userRoleFilter, apiBase, authHeaders]);

  const toggleOrgStatus = async (orgId: string, currentStatus: boolean) => {
    if (!authHeaders) return;
    setTogglingId(orgId);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${apiBase}/api/web/superadmin/organizations/${orgId}/status`, {
        method: "PUT",
        headers: authHeaders as any,
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setOrgs((prev) =>
          prev.map((org) => (org.id === orgId ? { ...org, isActive: !currentStatus } : org))
        );
        setSuccessMsg(`Organization access updated successfully.`);
        // Refresh stats dynamically
        fetchData();
      } else {
        setErrorMsg(json.message || "Failed to toggle organization status");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error updating organization status.");
    } finally {
      setTogglingId(null);
    }
  };

  const filteredOrgs = useMemo(() => {
    return orgs.filter((org) => {
      const nameMatch = org.name.toLowerCase().includes(searchTerm.toLowerCase());
      const slugMatch = org.slug.toLowerCase().includes(searchTerm.toLowerCase());
      return nameMatch || slugMatch;
    });
  }, [orgs, searchTerm]);

  if (loading && !stats) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-brand animate-spin" />
          <span className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Loading Dashboard Data...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Workspace Stats
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor registered tenant companies, system stats, and access status.
          </p>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-card hover:bg-accent/40 text-foreground border border-border rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-wider transition active:scale-[0.98] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Stats
        </button>
      </div>

      {/* Stats Cards Grid */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Companies */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Tenant Companies
              </span>
              <div className="rounded-xl bg-[var(--brand-tint)] p-2 text-primary">
                <Building2 className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground tracking-tight">
                {stats.totalCompanies}
              </span>
              <span className="text-xs text-muted-foreground">companies</span>
            </div>
            <div className="mt-2.5 flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <ShieldCheck className="h-3.5 w-3.5" />
                {stats.activeCompanies} Active
              </span>
              {stats.suspendedCompanies > 0 && (
                <span className="flex items-center gap-1 text-rose-600 font-medium">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {stats.suspendedCompanies} Suspended
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Employees */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Active Employees
              </span>
              <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                <Users className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground tracking-tight">
                {stats.totalEmployees}
              </span>
              <span className="text-xs text-muted-foreground">registered employees</span>
            </div>
            <div className="mt-2.5 text-xs text-muted-foreground">
              Across all tenant organizations.
            </div>
          </div>

          {/* Card 3: Active Sessions */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Active Sessions
              </span>
              <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
                <Zap className="h-4.5 w-4.5 text-amber-500 fill-amber-500" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground tracking-tight">
                {stats.activeSessions}
              </span>
              <span className="text-xs text-amber-600 font-semibold">Active Now</span>
            </div>
            <div className="mt-2.5 text-xs text-muted-foreground">
              Workers currently clocked in.
            </div>
          </div>

          {/* Card 4: Database Storage */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Storage Allocation
              </span>
              <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                <Server className="h-4.5 w-4.5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground tracking-tight">
                {stats.databaseSizePretty}
              </span>
              <span className="text-xs text-muted-foreground">disk space</span>
            </div>
            <div className="mt-2.5 text-xs text-muted-foreground">
              Postgres database payload size.
            </div>
          </div>
        </div>
      )}

      {/* Alert Notices */}
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

      {/* Company Access Controller Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Tenant Companies</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage company accounts and control system access status.
            </p>
          </div>

          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search companies by name or slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-background border border-border rounded-xl py-2 px-10 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:border-brand outline-none transition"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-4 px-6 w-12 text-center"></th>
                <th className="py-4 px-6">Company Profile</th>
                <th className="py-4 px-6">Created On</th>
                <th className="py-4 px-6 text-center">Managers</th>
                <th className="py-4 px-6 text-center">Employees</th>
                <th className="py-4 px-6">Plan & Subscription</th>
                <th className="py-4 px-6">System Access</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[13px]">
              {filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground font-medium">
                    No matching client tenants found.
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org) => (
                  <Fragment key={org.id}>
                    <tr
                      className={`hover:bg-muted/10 transition border-b border-border ${
                        !org.isActive ? "bg-rose-50/20" : ""
                      }`}
                    >
                      <td className="py-4.5 px-6 text-center">
                        <button
                          onClick={() => toggleExpandRow(org.id)}
                          className="p-1.5 hover:bg-accent/40 rounded-xl transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground mx-auto active:scale-95"
                          title="View Organization Breakdown"
                        >
                          {expandedOrgs.has(org.id) ? (
                            <ChevronDown className="h-4 w-4 text-brand" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-4.5 px-6">
                        <div className="font-semibold text-foreground">{org.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">{org.slug}</div>
                      </td>
                      <td className="py-4.5 px-6 text-foreground">
                        {org.createdAt ? org.createdAt.split("T")[0] : "N/A"}
                      </td>
                      <td className="py-4.5 px-6 text-center font-bold text-foreground">
                        {org.managerCount}
                      </td>
                      <td className="py-4.5 px-6 text-center font-bold text-foreground">
                        {org.employeeCount}
                      </td>
                      <td className="py-4.5 px-6">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                              org.subscriptionPlan === "BASIC" 
                                ? "bg-slate-100 border border-slate-200 text-slate-700" 
                                : org.subscriptionPlan === "GROWTH"
                                ? "bg-blue-50 border border-blue-200 text-blue-700"
                                : org.subscriptionPlan === "ENTERPRISE"
                                ? "bg-[var(--brand-tint)] border border-brand/20 text-brand"
                                : "bg-purple-50 border border-purple-200 text-purple-700"
                            }`}>
                              {org.subscriptionPlan}
                            </span>
                            <span className="text-xs font-semibold text-foreground">
                              ${org.subscriptionPrice.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1 mt-0.5">
                            <CreditCard className="h-3 w-3 text-muted-foreground" />
                            {org.billingCycle.toLowerCase()} cycle • {org.employeeCount} / {org.employeeLimit} seats
                          </div>
                          {org.renewalDate && (
                            <div className="text-[9px] text-muted-foreground font-mono flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5" />
                              Renew: {org.renewalDate}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-4.5 px-6">
                        {org.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[10px] font-bold uppercase text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Authorized
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-[10px] font-bold uppercase text-rose-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Suspended
                          </span>
                        )}
                      </td>
                      <td className="py-4.5 px-6 text-right space-x-2">
                        {org.id === "system-admin" ? (
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-3.5">
                            Protected System Org
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => openSubModal(org)}
                              className="inline-flex items-center justify-center rounded-xl bg-card hover:bg-accent/40 text-foreground border border-border px-3.5 py-2 text-xs font-semibold tracking-wide transition active:scale-[0.97]"
                              title="Configure negotiated subscription settings"
                            >
                              Configure Plan
                            </button>
                            <button
                              onClick={() => toggleOrgStatus(org.id, org.isActive)}
                              disabled={togglingId !== null}
                              className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-200 active:scale-[0.97] min-w-[110px] ${
                                org.isActive
                                  ? "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200"
                                  : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200"
                              } disabled:opacity-50`}
                            >
                              {togglingId === org.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : org.isActive ? (
                                "Suspend Access"
                              ) : (
                                "Authorize Access"
                              )}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {expandedOrgs.has(org.id) && (
                      <tr className="bg-muted/5 border-b border-border">
                        <td colSpan={8} className="px-8 py-5">
                          {loadingOrgsDetails[org.id] ? (
                            <div className="flex items-center gap-2 py-4 justify-center">
                              <Loader2 className="h-4 w-4 animate-spin text-brand" />
                              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                                Loading staff breakdown...
                              </span>
                            </div>
                          ) : orgDetails[org.id] ? (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-3 gap-2">
                                <div>
                                  <h4 className="text-[12px] font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                                    <Network className="h-3.5 w-3.5 text-brand" />
                                    Organization Structure & Staff Breakdown
                                  </h4>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Distribution of managers and their direct reports.
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 text-xs">
                                  <span className="bg-card px-2.5 py-1 border border-border rounded-lg font-medium text-foreground">
                                    Total Staff: <strong className="text-brand">{org.employeeCount + org.managerCount}</strong>
                                  </span>
                                  <span className="bg-card px-2.5 py-1 border border-border rounded-lg font-medium text-foreground">
                                    Unassigned Staff: <strong className="text-brand">{orgDetails[org.id].unassignedEmployeesCount}</strong>
                                  </span>
                                </div>
                              </div>

                              {orgDetails[org.id].managers.length === 0 && orgDetails[org.id].unassignedEmployeesCount === 0 ? (
                                <div className="py-6 text-center text-muted-foreground text-xs font-medium bg-card border border-border border-dashed rounded-xl">
                                  No staff members registered in this tenant organization.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {orgDetails[org.id].managers.map((mgr) => (
                                    <div
                                      key={mgr.id}
                                      className="bg-card border border-border rounded-xl p-4 shadow-sm hover:border-brand/40 transition flex flex-col justify-between min-h-[110px]"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                          <div className="h-8 w-8 rounded-lg bg-[var(--brand-tint)] flex items-center justify-center text-brand font-bold text-xs shrink-0">
                                            {mgr.fullName.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="min-w-0">
                                            <div className="font-semibold text-foreground text-xs leading-tight truncate">
                                              {mgr.fullName}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 font-mono truncate">
                                              <Mail className="h-3 w-3 shrink-0" />
                                              {mgr.email}
                                            </div>
                                          </div>
                                        </div>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 shrink-0">
                                          <UserCheck className="h-3 w-3 text-brand" />
                                          {mgr.employeeCount} Direct Reports
                                        </span>
                                      </div>

                                      <div className="mt-4">
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                                          <span>Team Coverage</span>
                                          <span className="font-bold text-foreground">
                                            {org.employeeCount > 0
                                              ? Math.round((mgr.employeeCount / org.employeeCount) * 100)
                                              : 0}
                                            % of staff
                                          </span>
                                        </div>
                                        <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                                          <div
                                            className="bg-brand h-full rounded-full transition-all"
                                            style={{
                                              width: `${
                                                org.employeeCount > 0
                                                  ? (mgr.employeeCount / org.employeeCount) * 100
                                                  : 0
                                              }%`,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}

                                  {orgDetails[org.id].unassignedEmployeesCount > 0 && (
                                    <div className="bg-orange-50/20 border border-orange-200/50 rounded-xl p-4 shadow-sm flex flex-col justify-between min-h-[110px]">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                          <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs shrink-0">
                                            <UserX className="h-4 w-4" />
                                          </div>
                                          <div>
                                            <div className="font-semibold text-foreground text-xs leading-tight">
                                              Unassigned Staff
                                            </div>
                                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                              Not assigned to any manager
                                            </div>
                                          </div>
                                        </div>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800 shrink-0">
                                          {orgDetails[org.id].unassignedEmployeesCount} Staff
                                        </span>
                                      </div>

                                      <div className="mt-4">
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                                          <span>Unassigned Ratio</span>
                                          <span className="font-bold text-foreground">
                                            {org.employeeCount > 0
                                              ? Math.round((orgDetails[org.id].unassignedEmployeesCount / org.employeeCount) * 100)
                                              : 0}
                                            % of staff
                                          </span>
                                        </div>
                                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                          <div
                                            className="bg-orange-400 h-full rounded-full transition-all"
                                            style={{
                                              width: `${
                                                org.employeeCount > 0
                                                  ? (orgDetails[org.id].unassignedEmployeesCount / org.employeeCount) * 100
                                                  : 0
                                              }%`,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 py-4 justify-center text-rose-600 text-xs font-semibold">
                              <AlertTriangle className="h-4 w-4" />
                              Failed to load staff breakdown.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Users Monitor */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Global Users Monitor</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Search and filter every manager and employee across all companies.
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

      {/* Subscription Editor Modal */}
      {selectedOrgForSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 relative animate-in fade-in zoom-in-95 duration-200 font-sans">
            <button
              onClick={() => setSelectedOrgForSub(null)}
              className="absolute right-4 top-4 p-1.5 hover:bg-accent/40 rounded-xl text-muted-foreground hover:text-foreground transition duration-150"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <h3 className="text-base font-bold text-foreground flex items-center gap-2 mb-4">
              <CreditCard className="h-4.5 w-4.5 text-brand" />
              Configure Plan: {selectedOrgForSub.name}
            </h3>

            <form onSubmit={handleSaveSub} className="space-y-4 text-xs font-medium text-foreground">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Subscription Plan Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BASIC, GROWTH, ENTERPRISE or Custom"
                  value={subForm.subscriptionPlan}
                  onChange={(e) => setSubForm({ ...subForm, subscriptionPlan: e.target.value.toUpperCase() })}
                  className="w-full bg-background border border-border rounded-xl py-2 px-3 text-foreground focus:border-brand outline-none transition uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    Negotiated Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={subForm.subscriptionPrice}
                    onChange={(e) => setSubForm({ ...subForm, subscriptionPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-background border border-border rounded-xl py-2 px-3 text-foreground focus:border-brand outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    Employee Seat Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={subForm.employeeLimit}
                    onChange={(e) => setSubForm({ ...subForm, employeeLimit: parseInt(e.target.value) || 1 })}
                    className="w-full bg-background border border-border rounded-xl py-2 px-3 text-foreground focus:border-brand outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    Billing Cycle
                  </label>
                  <select
                    value={subForm.billingCycle}
                    onChange={(e) => setSubForm({ ...subForm, billingCycle: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl py-2 px-3 text-foreground focus:border-brand outline-none transition cursor-pointer"
                  >
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="YEARLY">YEARLY</option>
                    <option value="CUSTOM">CUSTOM</option>
                    <option value="ONE-TIME">ONE-TIME</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    Next Renewal Date
                  </label>
                  <input
                    type="date"
                    value={subForm.renewalDate}
                    onChange={(e) => setSubForm({ ...subForm, renewalDate: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl py-2 px-3 text-foreground focus:border-brand outline-none transition"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrgForSub(null)}
                  className="bg-card border border-border hover:bg-accent/40 text-foreground px-4 py-2 rounded-xl font-semibold uppercase tracking-wider text-[10px] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSub}
                  className="bg-brand hover:bg-brand-dark text-white px-5 py-2 rounded-xl font-semibold uppercase tracking-wider text-[10px] shadow-sm transition active:scale-95 disabled:opacity-50"
                >
                  {savingSub ? "Saving Plan..." : "Save Configuration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
