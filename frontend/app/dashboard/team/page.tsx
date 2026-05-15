"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth, Role } from "../../../contexts/AuthContext";
import DashboardDateFilter from "../../../components/DashboardDateFilter";
import ThemedSelect from "../../../components/ThemedSelect";
import { 
  Check, 
  AlertCircle, 
  Shield, 
  Plus, 
  Trash2, 
  UserPlus,
  Settings2,
  MoreHorizontal,
  X,
  HelpCircle,
  Monitor,
  Laptop,
} from "lucide-react";

type Team = {
  id: string;
  name: string;
  managerId: string;
  createdAt: string;
  memberCount: number;
  members?: TeamUser[];
};

type TeamUser = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: string;
};

type TeamPerformance = {
  teamId: string;
  teamName: string;
  memberCount: number;
  totalActiveSeconds: number;
  totalTrackedSeconds: number;
  productiveSeconds: number;
  neutralSeconds: number;
  unproductiveSeconds: number;
  idleSeconds: number;
};

type UsageCategory = {
  category: "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";
  durationSeconds: number;
};

type InviteRow = {
  id: string;
  email: string;
  fullName: string;
  teamId: string;
};

type InviteResult = {
  email: string;
  fullName: string;
  inviteLink: string;
};

const formatDuration = (seconds: number): string => {
  const total = Math.round(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  return `${hrs}h ${mins}m`;
};

export default function TeamManagement() {
  const { user, authHeaders, apiBase, dateRange } = useAuth();

  const [loadingInvite, setLoadingInvite] = useState(false);
  const [inviteResults, setInviteResults] = useState<InviteResult[]>([]);
  const [inviteError, setInviteError] = useState("");
  const [inviteModalStep, setInviteModalStep] = useState<"closed" | "type" | "personal">("closed");

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamName, setTeamName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamPerformance, setTeamPerformance] = useState<TeamPerformance[]>([]);
  const [loadingTeamPerformance, setLoadingTeamPerformance] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamSuccess, setTeamSuccess] = useState("");
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
  const [actionsTeamId, setActionsTeamId] = useState("");
  const [actionMenuPosition, setActionMenuPosition] = useState({ top: 0, left: 0 });
  const [allUsers, setAllUsers] = useState<TeamUser[]>([]);
  const [manageTeam, setManageTeam] = useState<Team | null>(null);
  const [manageMemberUserId, setManageMemberUserId] = useState("");
  const [loadingManageTeam, setLoadingManageTeam] = useState(false);

  const [inviteRows, setInviteRows] = useState<InviteRow[]>([
    { id: "invite-1", email: "", fullName: "", teamId: "" },
    { id: "invite-2", email: "", fullName: "", teamId: "" },
    { id: "invite-3", email: "", fullName: "", teamId: "" },
  ]);

  const loadTeams = useCallback(async () => {
    if (!authHeaders || user?.role !== "MANAGER") return;

    setLoadingTeams(true);
    try {
      const response = await fetch(`${apiBase}/api/web/teams`, { headers: authHeaders, credentials: "include" });
      const data = await response.json();
      if (data.success) {
        setTeams(data.data);
      }
    } catch {
      setTeamError("Failed to synchronize teams.");
    } finally {
      setLoadingTeams(false);
    }
  }, [authHeaders, apiBase, user?.role]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (!authHeaders || user?.role !== "MANAGER") return;

    const loadUsers = async () => {
      try {
        const response = await fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" });
        const data = await response.json();
        if (data.success) {
          setAllUsers(data.data);
        }
      } catch (error) {
        console.error("Failed to load users", error);
      }
    };

    void loadUsers();
  }, [apiBase, authHeaders, user?.role]);

  useEffect(() => {
    if (!authHeaders || user?.role !== "MANAGER" || teams.length === 0) {
      setTeamPerformance([]);
      return;
    }

    const loadTeamPerformance = async () => {
      setLoadingTeamPerformance(true);
      try {
        const rows = await Promise.all(
          teams.map(async (team) => {
            const rangeParams = {
              startDate: dateRange.startDate.toISOString(),
              endDate: dateRange.endDate.toISOString(),
            };
            const [analyticsResponse, usageResponse] = await Promise.all([
              fetch(
                `${apiBase}/api/web/teams/${team.id}/analytics?` + new URLSearchParams(rangeParams).toString(),
                { headers: authHeaders, credentials: "include" },
              ),
              fetch(
                `${apiBase}/api/web/dashboard/usage-report?` +
                  new URLSearchParams({
                    ...rangeParams,
                    teamId: team.id,
                  }).toString(),
                { headers: authHeaders, credentials: "include" },
              ),
            ]);
            const [analyticsData, usageData] = await Promise.all([analyticsResponse.json(), usageResponse.json()]);
            if (!analyticsData.success) {
              return {
                teamId: team.id,
                teamName: team.name,
                memberCount: team.memberCount,
                totalActiveSeconds: 0,
                totalTrackedSeconds: 0,
                productiveSeconds: 0,
                neutralSeconds: 0,
                unproductiveSeconds: 0,
                idleSeconds: 0,
              };
            }

            const categories = (usageData.success ? usageData.data?.categories ?? [] : []) as UsageCategory[];
            const categorySeconds = (category: UsageCategory["category"]) =>
              categories
                .filter((item) => item.category === category)
                .reduce((sum, item) => sum + Number(item.durationSeconds || 0), 0);
            const productiveSeconds = categorySeconds("PRODUCTIVE");
            const neutralSeconds = categorySeconds("NEUTRAL");
            const unproductiveSeconds = categorySeconds("UNPRODUCTIVE");
            const activeCategorySeconds = productiveSeconds + neutralSeconds + unproductiveSeconds;
            const totalTrackedSeconds = Number(analyticsData.data.totalTrackedSeconds || 0);

            return {
              teamId: team.id,
              teamName: team.name,
              memberCount: analyticsData.data.memberCount,
              totalActiveSeconds: Number(analyticsData.data.totalActiveSeconds || 0),
              totalTrackedSeconds,
              productiveSeconds,
              neutralSeconds,
              unproductiveSeconds,
              idleSeconds: Math.max(0, totalTrackedSeconds - activeCategorySeconds),
            };
          }),
        );

        setTeamPerformance(rows);
      } catch (error) {
        console.error("Failed to load team performance", error);
        setTeamPerformance([]);
      } finally {
        setLoadingTeamPerformance(false);
      }
    };

    void loadTeamPerformance();
  }, [apiBase, authHeaders, dateRange, teams, user?.role]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeaders || !teamName.trim()) return;

    setLoadingTeams(true);
    setTeamError("");
    setTeamSuccess("");

    try {
      const response = await fetch(`${apiBase}/api/web/teams`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({ name: teamName }),
      });
      const data = await response.json();
      if (data.success) {
        setTeamName("");
        setTeamSuccess("Team created successfully");
        setSelectedTeamId(data.data.id);
        setCreateTeamModalOpen(false);
        await loadTeams();
      } else {
        setTeamError(data.message || "Failed to create team");
      }
    } catch {
      setTeamError("Network error occurred.");
    } finally {
      setLoadingTeams(false);
    }
  };

  const handleDeleteTeam = async (teamId = selectedTeamId) => {
    if (!authHeaders || !teamId) return;

    const teamToDelete = teams.find((team) => team.id === teamId);
    if (!teamToDelete || !window.confirm(`Delete ${teamToDelete.name}? This will remove its team assignments.`)) return;

    setLoadingTeams(true);
    setTeamError("");
    setTeamSuccess("");

    try {
      const response = await fetch(`${apiBase}/api/web/teams/${teamId}`, {
        method: "DELETE",
        headers: authHeaders,
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) {
        const remainingTeams = teams.filter((team) => team.id !== teamId);
        setTeams(remainingTeams);
        setSelectedTeamId("");
        setTeamSuccess("Team deleted successfully");
        await loadTeams();
      } else {
        setTeamError(data.message || "Failed to delete team");
      }
    } catch {
      setTeamError("Network error occurred.");
    } finally {
      setLoadingTeams(false);
    }
  };

  const openPersonalInviteModal = () => {
    setInviteError("");
    setInviteResults([]);
    setInviteRows((current) =>
      current.map((row) => ({
        ...row,
        teamId: row.teamId || selectedTeamId || teams[0]?.id || "",
      })),
    );
    setInviteModalStep("personal");
  };

  const refreshManagedTeam = useCallback(
    async (teamId: string) => {
      if (!authHeaders || !teamId) return null;

      const response = await fetch(`${apiBase}/api/web/teams/${teamId}`, { headers: authHeaders, credentials: "include" });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Unable to load team members.");
      }

      const nextTeam = data.data as Team;
      setManageTeam(nextTeam);

      const memberIds = new Set((nextTeam.members ?? []).map((member) => member.id));
      const firstAvailableEmployee = allUsers.find((employee) => employee.role === "EMPLOYEE" && !memberIds.has(employee.id));
      setManageMemberUserId(firstAvailableEmployee?.id ?? "");

      return nextTeam;
    },
    [allUsers, apiBase, authHeaders],
  );

  const openManageTeam = async (teamId: string) => {
    if (!authHeaders || !teamId) return;

    setActionsTeamId("");
    setSelectedTeamId(teamId);
    setTeamError("");
    setTeamSuccess("");
    setLoadingManageTeam(true);

    try {
      await refreshManagedTeam(teamId);
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Unable to load team members.");
      setManageTeam(null);
    } finally {
      setLoadingManageTeam(false);
    }
  };

  const toggleTeamActions = (teamId: string, trigger: HTMLButtonElement) => {
    if (actionsTeamId === teamId) {
      setActionsTeamId("");
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 116;
    const gap = 8;
    const top =
      rect.bottom + menuHeight + gap > window.innerHeight
        ? Math.max(gap, rect.top - menuHeight - gap)
        : rect.bottom + gap;

    setActionMenuPosition({
      top,
      left: Math.min(window.innerWidth - menuWidth - gap, Math.max(gap, rect.right - menuWidth)),
    });
    setActionsTeamId(teamId);
  };

  const availableTeamUsers = useMemo(() => {
    const assignedIds = new Set((manageTeam?.members ?? []).map((member) => member.id));
    return allUsers.filter((employee) => employee.role === "EMPLOYEE" && !assignedIds.has(employee.id));
  }, [allUsers, manageTeam?.members]);

  const handleAddManagedMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeaders || !manageTeam || !manageMemberUserId) return;

    setLoadingManageTeam(true);
    setTeamError("");
    setTeamSuccess("");

    try {
      const response = await fetch(`${apiBase}/api/web/teams/${manageTeam.id}/members`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({ userId: manageMemberUserId }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to add employee to team.");
      }

      await refreshManagedTeam(manageTeam.id);
      await loadTeams();
      setTeamSuccess("Employee added to team");
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Failed to add employee to team.");
    } finally {
      setLoadingManageTeam(false);
    }
  };

  const handleRemoveManagedMember = async (userId: string) => {
    if (!authHeaders || !manageTeam || !userId) return;

    setLoadingManageTeam(true);
    setTeamError("");
    setTeamSuccess("");

    try {
      const response = await fetch(`${apiBase}/api/web/teams/${manageTeam.id}/members/${userId}`, {
        method: "DELETE",
        headers: authHeaders,
        credentials: "include",
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to remove employee from team.");
      }

      await refreshManagedTeam(manageTeam.id);
      await loadTeams();
      setTeamSuccess("Employee removed from team");
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Failed to remove employee from team.");
    } finally {
      setLoadingManageTeam(false);
    }
  };

  const updateInviteRow = (id: string, patch: Partial<InviteRow>) => {
    setInviteRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addInviteRow = () => {
    setInviteRows((current) => [
      ...current,
      {
        id: `invite-${Date.now()}`,
        email: "",
        fullName: "",
        teamId: selectedTeamId || teams[0]?.id || "",
      },
    ]);
  };

  const removeInviteRow = (id: string) => {
    setInviteRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
  };

  const handleSendPersonalInvites = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeaders) return;

    const rowsToInvite = inviteRows.filter((row) => row.email.trim().length > 0);
    if (rowsToInvite.length === 0) {
      setInviteError("Add at least one employee email.");
      return;
    }

    setLoadingInvite(true);
    setInviteResults([]);
    setInviteError("");

    try {
      const results: InviteResult[] = [];

      for (const row of rowsToInvite) {
        const response = await fetch(`${apiBase}/api/web/invites`, {
          method: "POST",
          headers: authHeaders,
          credentials: "include",
          body: JSON.stringify({ email: row.email.trim(), role: "EMPLOYEE" }),
        });
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || `Failed to invite ${row.email}`);
        }

        results.push({
          email: row.email.trim(),
          fullName: row.fullName.trim(),
          inviteLink: data.data.inviteLink,
        });
      }

      setInviteRows([{ id: `invite-${Date.now()}`, email: "", fullName: "", teamId: selectedTeamId || teams[0]?.id || "" }]);
      setInviteResults(results);
      setTeamSuccess(`${results.length} invitation${results.length === 1 ? "" : "s"} generated successfully`);
      await loadTeams();
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Network error occurred.");
    } finally {
      setLoadingInvite(false);
    }
  };

  if (user?.role !== "MANAGER") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-xl border border-border bg-[var(--surface-2)] p-8 shadow-[0_1px_2px_rgba(45,42,38,0.04)]">
        <Shield className="mb-5 h-12 w-12 text-muted-foreground/45" />
        <h2 className="text-[15px] font-semibold text-foreground">Access Restricted</h2>
        <p className="mt-2 max-w-xs text-center text-[12.5px] font-medium text-muted-foreground">Only organization managers can access team settings and employee invites.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="tl-label text-muted-foreground">Organization Infrastructure</p>
          <h2 className="mt-1 text-[18px] font-semibold leading-tight text-foreground">Teams & Workforce</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
           <button
             type="button"
             onClick={() => {
               setTeamName("");
               setCreateTeamModalOpen(true);
             }}
             className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
           >
             <Plus className="h-3.5 w-3.5" />
             Create Team
           </button>
           <button type="button" onClick={() => setInviteModalStep("type")} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              <UserPlus className="h-4 w-4" /> Invite Member
           </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DashboardDateFilter />
      </div>

      <section className="rounded-xl border border-border bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(45,42,38,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-[13.5px] font-semibold text-foreground">Team Performance</h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Combined work time, active time, and productivity for the selected date range.
            </p>
          </div>
          <span className="rounded-full bg-[var(--brand-tint)] px-2 py-0.5 text-[11px] font-medium text-primary">
            {teamPerformance.length} teams
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-[12.5px]">
            <thead className="bg-muted/30 text-left text-muted-foreground">
              <tr>
                {["Team", "Members", "Work Time", "Productive Time", "Neutral Time", "Unproductive Time", "Idle Time", ""].map((heading) => (
                  <th key={heading} className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingTeamPerformance ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                    Loading team performance...
                  </td>
                </tr>
              ) : teamPerformance.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">
                    Create teams and assign employees to see team performance.
                  </td>
                </tr>
              ) : (
                teamPerformance.map((team) => (
                  <tr
                    key={team.teamId}
                    className={`border-t border-border transition hover:bg-accent/30 ${
                      selectedTeamId === team.teamId ? "bg-[var(--brand-tint)]/45" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTeamId(team.teamId)}
                          className="text-left font-medium text-foreground transition hover:text-primary"
                        >
                          {team.teamName}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{team.memberCount}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">{formatDuration(team.totalTrackedSeconds)}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-emerald-700">{formatDuration(team.productiveSeconds)}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-[#7E6F65]">{formatDuration(team.neutralSeconds)}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-rose-600">{formatDuration(team.unproductiveSeconds)}</td>
                    <td className="px-4 py-3 font-medium tabular-nums text-amber-700">{formatDuration(team.idleSeconds)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => toggleTeamActions(team.teamId, e.currentTarget)}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${
                          actionsTeamId === team.teamId
                            ? "border-primary/20 bg-[var(--brand-tint)] text-primary"
                            : "border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground"
                        }`}
                        aria-label={`Open actions for ${team.teamName}`}
                        aria-expanded={actionsTeamId === team.teamId}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {actionsTeamId ? (
        <div
          className="fixed z-[80] w-44 overflow-hidden rounded-lg border border-border bg-[var(--surface-2)] p-1.5 text-left shadow-[0_18px_44px_rgba(45,42,38,0.16)]"
          style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
        >
          <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Team actions
          </div>
          <button
            type="button"
            onClick={() => void openManageTeam(actionsTeamId)}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-[12.5px] font-medium text-foreground transition hover:bg-[var(--brand-tint)] hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Manage
          </button>
          <button
            type="button"
            onClick={() => {
              const teamId = actionsTeamId;
              setActionsTeamId("");
              void handleDeleteTeam(teamId);
            }}
            className="mt-1 flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12.5px] font-medium text-rose-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      ) : null}

      {createTeamModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-[var(--surface-2)] shadow-[0_18px_48px_rgba(45,42,38,0.16)] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-[14px] font-semibold text-foreground">Create New Team</h3>
                <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">Add a team workspace for members and analytics.</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateTeamModalOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
                aria-label="Close create team dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTeam} className="space-y-5 px-5 py-5">
              <label className="block">
                <span className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Team Name</span>
                <input
                  type="text"
                  required
                  autoFocus
                  className="tl-input h-10 w-full bg-background px-3 text-[13px]"
                  placeholder="e.g. Sales Operations"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </label>

              <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setCreateTeamModalOpen(false)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-[var(--surface-2)] px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent/50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loadingTeams || !teamName.trim()}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {loadingTeams ? "Creating..." : "Create Team"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {manageTeam ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-[var(--surface-2)] shadow-[0_18px_48px_rgba(45,42,38,0.16)] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-[14px] font-semibold text-foreground">Manage Team</h3>
                <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
                  Assign employees to <span className="text-foreground">{manageTeam.name}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManageTeam(null)}
                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
                aria-label="Close manage team dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5">
              <form onSubmit={handleAddManagedMember} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <label className="min-w-0 flex-1">
                    <span className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Add Employee
                    </span>
                    <ThemedSelect
                      label="Employees"
                      value={manageMemberUserId}
                      onChange={setManageMemberUserId}
                      disabled={loadingManageTeam || availableTeamUsers.length === 0}
                      minWidth={260}
                      options={[
                        {
                          label: availableTeamUsers.length === 0 ? "No unassigned employees available" : "Select employee",
                          value: "",
                          disabled: availableTeamUsers.length === 0,
                        },
                        ...availableTeamUsers.map((employee) => ({
                          label: `${employee.fullName} - ${employee.email}`,
                          value: employee.id,
                        })),
                      ]}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={loadingManageTeam || !manageMemberUserId}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add
                  </button>
                </div>
              </form>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-[12.5px] font-semibold text-foreground">Current Members</h4>
                  <span className="rounded-full bg-[var(--brand-tint)] px-2 py-0.5 text-[11px] font-medium text-primary">
                    {manageTeam.members?.length ?? 0} members
                  </span>
                </div>

                <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {(manageTeam.members ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center text-[12.5px] text-muted-foreground">
                      No employees are assigned to this team yet.
                    </div>
                  ) : (
                    (manageTeam.members ?? []).map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-[var(--surface-2)] text-[12px] font-semibold text-primary">
                            {member.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-semibold text-foreground">{member.fullName}</p>
                            <p className="truncate text-[11.5px] text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRemoveManagedMember(member.id)}
                          disabled={loadingManageTeam}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-rose-100 bg-rose-50 px-2 text-[12px] font-medium text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setManageTeam(null)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-[var(--surface-2)] px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent/50"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {inviteModalStep !== "closed" ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm">
          {inviteModalStep === "type" ? (
            <div className="w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-[var(--surface-2)] shadow-[0_18px_48px_rgba(45,42,38,0.16)] animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="text-[14px] font-semibold text-foreground">Add New Employees & Download</h3>
                <button
                  type="button"
                  onClick={() => setInviteModalStep("closed")}
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
                  aria-label="Close invite dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-6 py-6">
                <div className="text-center">
                  <h4 className="text-[13px] font-semibold text-foreground">Choose Your Employee&apos;s Computer Type</h4>
                  <button type="button" className="mt-3 inline-flex h-8 items-center justify-center gap-2 rounded-md px-2 text-[12.5px] font-medium text-primary transition-colors hover:bg-accent/50">
                    <HelpCircle className="h-4 w-4" /> Not sure which to choose? Learn here.
                  </button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    disabled
                    title="Company laptop flow will be added later"
                    className="min-h-[230px] rounded-xl border border-border bg-background p-6 text-center opacity-60"
                  >
                    <Monitor className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mx-auto mt-6 max-w-[230px] text-[13px] font-medium leading-5 text-muted-foreground">
                      Employees work on company-owned computers, and only admins will be able to modify tracking settings.
                    </p>
                    <span className="mt-5 block text-[13px] font-semibold text-primary">Company Computers</span>
                    <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Coming soon</span>
                  </button>

                  <button
                    type="button"
                    onClick={openPersonalInviteModal}
                    className="min-h-[230px] rounded-xl border border-border bg-background p-6 text-center transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-accent/20 hover:shadow-[0_10px_24px_rgba(45,42,38,0.08)]"
                  >
                    <Laptop className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mx-auto mt-6 max-w-[250px] text-[13px] font-medium leading-5 text-muted-foreground">
                      Employees work on their personal computers and should have the ability to control when TeamLens tracks their activities.
                    </p>
                    <span className="mt-5 block text-[13px] font-semibold text-primary">Personal Computers</span>
                  </button>
                </div>

                <div className="mt-6 rounded-md border border-border bg-background px-4 py-3 text-[12.5px] font-medium text-muted-foreground">
                  Adding computers will impact your billing. Learn More here.
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-[var(--surface-2)] shadow-[0_18px_48px_rgba(45,42,38,0.16)] animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="text-[14px] font-semibold text-foreground">Add New Employees - Personal Computers</h3>
                <button
                  type="button"
                  onClick={() => setInviteModalStep("closed")}
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
                  aria-label="Close personal invite dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSendPersonalInvites} className="space-y-5 px-5 py-5">
                <div className="hidden grid-cols-[1.6fr_1fr_1fr_36px] gap-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
                  <span>Employee Email</span>
                  <span>Full Name</span>
                  <span>Team</span>
                  <span />
                </div>

                <div className="space-y-4">
                  {inviteRows.map((row) => (
                    <div key={row.id} className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr_36px] md:gap-4">
                      <input
                        type="email"
                        value={row.email}
                        onChange={(e) => updateInviteRow(row.id, { email: e.target.value })}
                        className="tl-input h-10 w-full bg-background px-3 text-[12.5px]"
                        placeholder="Enter email"
                      />
                      <input
                        type="text"
                        value={row.fullName}
                        onChange={(e) => updateInviteRow(row.id, { fullName: e.target.value })}
                        className="tl-input h-10 w-full bg-background px-3 text-[12.5px]"
                        placeholder="Enter full name"
                      />
                      <ThemedSelect
                        label="Team"
                        value={row.teamId}
                        onChange={(nextValue) => updateInviteRow(row.id, { teamId: nextValue })}
                        minWidth={170}
                        options={[{ label: "No team", value: "" }, ...teams.map((team) => ({ label: team.name, value: team.id }))]}
                      />
                      <button
                        type="button"
                        onClick={() => removeInviteRow(row.id)}
                        className="flex h-10 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Remove employee row"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addInviteRow}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md px-2 text-[12.5px] font-medium text-primary transition-colors hover:bg-accent/50"
                >
                  <Plus className="h-4 w-4" /> Add Another Employee
                </button>

                {inviteError ? (
                  <div className="rounded-md border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] font-medium text-rose-600">
                    {inviteError}
                  </div>
                ) : null}

                {inviteResults.length > 0 ? (
                  <div className="rounded-xl border border-primary/10 bg-[var(--brand-tint)]/45 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-primary">
                        <Check className="h-3.5 w-3.5" /> Invite Links Ready
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard.writeText(
                            inviteResults
                              .map((result) => `${result.fullName || result.email}: ${result.inviteLink}`)
                              .join("\n"),
                          )
                        }
                        className="text-[11px] font-medium uppercase tracking-wider text-primary transition hover:text-primary/85"
                      >
                        Copy All
                      </button>
                    </div>
                    <div className="space-y-2">
                      {inviteResults.map((result) => (
                        <div key={result.email} className="rounded-md border border-primary/10 bg-[var(--surface-2)] p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="truncate text-[12px] font-medium text-foreground">
                              {result.fullName || "Employee"} ({result.email})
                            </span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard.writeText(result.inviteLink)}
                              className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-primary transition hover:text-primary/85"
                            >
                              Copy
                            </button>
                          </div>
                          <div className="break-all rounded-md bg-background px-3 py-2 font-mono text-[11px] font-medium text-primary">
                            {result.inviteLink}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between pt-6">
                  <button
                    type="button"
                    onClick={() => setInviteModalStep("type")}
                    className="inline-flex items-center justify-center rounded-md border border-border bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent/50"
                  >
                    Back
                  </button>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setInviteModalStep("closed")}
                      className="inline-flex items-center justify-center rounded-md border border-border bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent/50"
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={loadingInvite} className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
                      {loadingInvite ? "Sending..." : "Send Invitations"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : null}
      
      {/* Toast notifications */}
      {(teamError || teamSuccess) && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-8">
          <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-[0_12px_32px_rgba(45,42,38,0.14)] ${
            teamError ? "border-rose-100 bg-rose-50 text-rose-600" : "border-border bg-[var(--surface-2)] text-foreground"
          }`}>
            {teamError ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4 text-emerald-500" />}
            <span className="text-[12.5px] font-medium">{teamError || teamSuccess}</span>
            <button onClick={() => { setTeamError(""); setTeamSuccess(""); }} className="ml-2 rounded-md p-1 transition-colors hover:bg-accent/50">
              <Trash2 className="h-3.5 w-3.5 opacity-40 hover:opacity-100" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
