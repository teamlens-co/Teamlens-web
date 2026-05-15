"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ThemedSelect from "../../../components/ThemedSelect";

type AdminTab = "users" | "managers" | "teams" | "employees" | "invite";

type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "employee";
  status: "active" | "disabled" | "invited";
};

const users: User[] = [
  { id: "1", name: "Aarav Sharma", email: "aarav@company.com", role: "admin", status: "active" },
  { id: "2", name: "Meera Kapoor", email: "meera@company.com", role: "manager", status: "active" },
  { id: "3", name: "Rohan Mehta", email: "rohan@company.com", role: "employee", status: "active" },
  { id: "4", name: "Nisha Verma", email: "nisha@company.com", role: "employee", status: "invited" },
  { id: "5", name: "Karan Malhotra", email: "karan@company.com", role: "manager", status: "disabled" },
];

const employees = [
  { name: "Aarav Sharma", agentId: "agent-win-001", status: "active", lastSeen: "Today, 10:42", productivity: 92 },
  { name: "Meera Kapoor", agentId: "agent-mac-014", status: "idle", lastSeen: "Today, 10:35", productivity: 78 },
  { name: "Rohan Mehta", agentId: "agent-win-021", status: "offline", lastSeen: "Yesterday, 18:20", productivity: 64 },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");

  const stats = useMemo(
    () => [
      { key: "admin", label: "Admins", value: users.filter((user) => user.role === "admin").length },
      { key: "manager", label: "Managers", value: users.filter((user) => user.role === "manager").length },
      { key: "employee", label: "Employees", value: users.filter((user) => user.role === "employee").length },
      { key: "disabled", label: "Disabled", value: users.filter((user) => user.status === "disabled").length },
    ],
    [],
  );

  return (
    <div className="tl-admin-surface">
      <div className="tl-admin-topbar">
        <h1 className="text-[20px] font-medium">
          <span className="text-[var(--admin-accent)]">TeamLens</span> Admin Panel
        </h1>
        <Link href="/dashboard" className="text-[14px] text-[var(--admin-muted)] transition hover:text-[var(--admin-text)]">
          Back to Dashboard
        </Link>
      </div>

      <div className="tl-admin-container">
        <div className="tl-admin-stat-row">
          {stats.map((stat) => (
            <div key={stat.key} className={`tl-admin-stat ${stat.key}`}>
              <strong
                className={
                  stat.key === "admin"
                    ? "text-[var(--admin-warning)]"
                    : stat.key === "manager"
                      ? "text-[var(--admin-manager)]"
                      : stat.key === "disabled"
                        ? "text-[var(--admin-danger)]"
                        : "text-[var(--admin-employee)]"
                }
              >
                {stat.value}
              </strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="tl-admin-tabs custom-scrollbar">
          {[
            ["users", "Users"],
            ["managers", "Manager Assignments"],
            ["teams", "Team Managers"],
            ["employees", "Employees"],
            ["invite", "Invite User"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id as AdminTab)}
              className={`tl-admin-tab ${activeTab === id ? "active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "users" && (
          <div className="tl-admin-card overflow-x-auto">
            <h2>User Accounts</h2>
            <table className="tl-admin-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                    </td>
                    <td className="text-[var(--admin-muted)]">{user.email}</td>
                    <td>
                      <span className={`tl-admin-badge ${user.role}`}>{user.role}</span>
                    </td>
                    <td>
                      <span className={`tl-admin-badge ${user.status}`}>{user.status}</span>
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <button className="tl-admin-button outline px-3 py-1 text-[12px]">Change Role</button>
                        <button className={`tl-admin-button ${user.status === "disabled" ? "success" : "danger"} px-3 py-1 text-[12px]`}>
                          {user.status === "disabled" ? "Enable" : "Disable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "managers" && (
          <div className="tl-admin-grid">
            <div className="tl-admin-card">
              <h2>Assign Employees to Manager</h2>
              <div className="space-y-3">
                <div className="tl-admin-field">
                  <label>Select Manager</label>
                  <ThemedSelect
                    label="Manager"
                    value=""
                    onChange={() => undefined}
                    minWidth={240}
                    options={[
                      { label: "Choose a user...", value: "" },
                      { label: "Meera Kapoor (manager)", value: "meera" },
                      { label: "Karan Malhotra (manager)", value: "karan" },
                    ]}
                  />
                </div>
                <div className="tl-admin-field">
                  <label>Select Employees</label>
                  <div className="max-h-[240px] overflow-y-auto rounded-lg border border-[var(--admin-border)] p-2 custom-scrollbar">
                    {employees.map((employee) => (
                      <label key={employee.agentId} className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-[var(--admin-bg)]">
                        <input type="checkbox" className="h-4 w-4 accent-[var(--admin-accent)]" />
                        <span className="text-sm">{employee.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <button className="tl-admin-button primary">Assign Employees</button>
              </div>
            </div>
            <div className="tl-admin-card">
              <h2>Current Assignments</h2>
              <div className="mb-4 font-medium">
                Meera Kapoor <span className="text-xs text-[var(--admin-muted)]">(meera@company.com)</span>
              </div>
              {["Aarav Sharma", "Rohan Mehta"].map((name) => (
                <div key={name} className="tl-admin-assignment">
                  <span>{name}</span>
                  <button className="tl-admin-button danger px-3 py-1 text-[12px]">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "teams" && (
          <div className="tl-admin-grid">
            <div className="tl-admin-card">
              <h2>Assign Manager to Team</h2>
              <div className="space-y-3">
                <div className="tl-admin-field">
                  <label>Select Team</label>
                  <ThemedSelect
                    label="Team"
                    value=""
                    onChange={() => undefined}
                    minWidth={240}
                    options={[
                      { label: "Choose a team...", value: "" },
                      { label: "Engineering", value: "engineering" },
                      { label: "Operations", value: "operations" },
                    ]}
                  />
                </div>
                <div className="tl-admin-field">
                  <label>Select Manager</label>
                  <ThemedSelect
                    label="Manager"
                    value=""
                    onChange={() => undefined}
                    minWidth={240}
                    options={[
                      { label: "Choose a user...", value: "" },
                      { label: "Meera Kapoor", value: "meera" },
                      { label: "Karan Malhotra", value: "karan" },
                    ]}
                  />
                </div>
                <button className="tl-admin-button primary">Assign Team Manager</button>
              </div>
            </div>
            <div className="tl-admin-card">
              <h2>Team Manager Assignments</h2>
              {[
                ["Meera Kapoor", "Engineering", "meera@company.com"],
                ["Karan Malhotra", "Operations", "karan@company.com"],
              ].map(([manager, team, email]) => (
                <div key={team} className="tl-admin-assignment">
                  <span>
                    {manager} <span className="tl-admin-badge manager ml-2">{team}</span>
                    <span className="block text-xs text-[var(--admin-muted)]">{email}</span>
                  </span>
                  <button className="tl-admin-button danger px-3 py-1 text-[12px]">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "employees" && (
          <div className="tl-admin-card overflow-x-auto">
            <h2>Tracked Employees (Agents)</h2>
            <h3>These are the devices/agents sending activity data</h3>
            <table className="tl-admin-table min-w-[680px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Agent ID</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th>Productivity</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.agentId}>
                    <td>
                      <strong>{employee.name}</strong>
                    </td>
                    <td className="text-xs text-[var(--admin-muted)]">{employee.agentId}</td>
                    <td>
                      <span className={`tl-admin-badge ${employee.status === "active" ? "active" : employee.status === "idle" ? "invited" : "disabled"}`}>
                        {employee.status}
                      </span>
                    </td>
                    <td className="text-[var(--admin-muted)]">{employee.lastSeen}</td>
                    <td>{employee.productivity}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "invite" && (
          <div className="tl-admin-card max-w-[500px]">
            <h2>Invite New User</h2>
            <div className="space-y-3">
              <div className="tl-admin-field">
                <label>Full Name</label>
                <input className="tl-admin-input" placeholder="e.g. Pratik Dey" />
              </div>
              <div className="tl-admin-field">
                <label>Email</label>
                <input className="tl-admin-input" type="email" placeholder="e.g. pratik@company.com" />
              </div>
              <div className="tl-admin-field">
                <label>Role</label>
                <ThemedSelect
                  label="Role"
                  value="employee"
                  onChange={() => undefined}
                  minWidth={240}
                  options={[
                    { label: "Employee", value: "employee" },
                    { label: "Manager", value: "manager" },
                    { label: "Admin", value: "admin" },
                  ]}
                />
              </div>
              <div className="tl-admin-field">
                <label>Temporary Password</label>
                <input className="tl-admin-input" placeholder="Set initial password" />
              </div>
              <button className="tl-admin-button primary">Create User Account</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
