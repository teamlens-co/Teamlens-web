"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart2,
  Bell,
  Briefcase,
  CalendarDays,
  Camera,
  Clock3,
  Eye,
  FileText,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Sparkles,
  Timer,
  Users,
  Video,
  Wallet,
  Globe,
} from "lucide-react";
import { AuthProvider, useAuth } from "../../contexts/AuthContext";
import TeamLensLogo from "../../components/TeamLensLogo";

const isDev = process.env.NODE_ENV === "development";

const sidebarGroups = [
  {
    label: "Overview",
    links: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Real-time insights", href: "/dashboard/real-time-insights", icon: Activity },
      { name: "Employees", href: "/dashboard/employees", icon: Users },
      { name: "Live View", href: "/dashboard/live", icon: Eye },
      { name: "Screenshots", href: "/dashboard/screenshots", icon: Camera },
      { name: "Activities", href: "/dashboard/activities", icon: BarChart2 },
      { name: "Time & Attendance", href: "/dashboard/attendance", icon: Clock3 },
      { name: "Manual Time", href: "/dashboard/manual-time", icon: Timer },
    ],
  },
  {
    label: "Work",
    links: [
      { name: "Team & Invite", href: "/dashboard/team", icon: Users },
      ...(isDev
        ? [
            { name: "Schedules", href: "/dashboard/schedules", icon: CalendarDays },
            { name: "Projects", href: "/dashboard/projects", icon: Briefcase },
            { name: "Payroll", href: "/dashboard/payroll", icon: Wallet },
          ]
        : []),
    ],
  },
  {
    label: "Intelligence",
    links: [
      { name: "Workforce Intelligence", href: "/dashboard/ai-center", icon: Sparkles },
      { name: "Daily Reports", href: "/dashboard/daily-reports", icon: FileText },
      { name: "Reports", href: "/dashboard/reports", icon: BarChart2 },
      { name: "Screen Recordings", href: "/dashboard/recordings", icon: Video },
    ],
  },
  {
    label: "System",
    links: [
      { name: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mockNotifications = [
    {
      id: 1,
      title: "Productivity Alert",
      description: "John Doe's productivity has dropped below 50% today.",
      time: "10 mins ago",
      unread: true,
    },
    {
      id: 2,
      title: "New Team Member",
      description: "Jane Smith has joined the Engineering team.",
      time: "2 hours ago",
      unread: true,
    },
    {
      id: 3,
      title: "System Update",
      description: "TeamLens will be undergoing maintenance tonight at 12 AM IST.",
      time: "5 hours ago",
      unread: false,
    },
  ];

  const {
    user,
    organization,
    isLoading,
    logout,
  } = useAuth();

  useEffect(() => {
    if (!isLoading && (!user || !organization)) {
      router.replace("/manager/sign-in");
    }
  }, [isLoading, organization, router, user]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8F5F1]">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <div className="text-[10px] font-medium text-[#B4AAA2] uppercase tracking-widest">TeamLens</div>
        </div>
      </div>
    );
  }

  if (!user || !organization) return null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans selection:bg-brand/10">
      <aside className="hidden h-full w-[224px] shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-[52px] shrink-0 items-center border-b border-border px-4">
          <TeamLensLogo
            href="/dashboard"
            className="gap-2"
            markClassName="h-[22px] w-[22px]"
            textClassName="text-[15.5px] font-semibold text-foreground"
          />
        </div>

        <nav className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {sidebarGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</div>
              <div className="space-y-0.5">
                {group.links.map((link) => {
                  const isActive = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));
                  const Icon = link.icon;
                  return (
                    <Link
                      key={`${group.label}-${link.name}`}
                      href={link.href}
                      className={`group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                        isActive
                          ? "bg-[var(--brand-tint)] text-primary font-medium"
                          : "text-foreground/80 hover:bg-accent/60"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{link.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <button
            onClick={logout}
            className="flex w-full items-center rounded-md px-2.5 py-1.5 text-[13px] text-foreground/80 transition-colors hover:bg-accent/60 hover:text-primary"
          >
            <LogOut className="mr-2.5 h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-[var(--surface-2)] px-4 font-sans">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden grid h-8 w-8 place-items-center rounded-md text-foreground/80 hover:bg-accent/60 transition-colors"
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="hidden md:flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{organization?.name || "Acme Inc."}</span>
            <span className="text-[11px] text-muted-foreground">
              <Globe className="mr-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2} />
              IST
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={`relative grid h-8 w-8 place-items-center rounded-md transition-colors ${showNotifications ? "bg-accent text-primary" : "text-foreground/80 hover:bg-accent/60"}`}
              >
                <Bell className="h-4 w-4" strokeWidth={2} />
                <span className="absolute right-[7px] top-[5px] h-2 w-2 rounded-full border-[1.5px] border-[var(--surface-2)] bg-[#DC3030]" />
              </button>

              {showNotifications && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowNotifications(false)}
                  />
                  <div className="absolute right-0 mt-2 w-80 origin-top-right rounded-xl border border-border bg-[var(--surface-2)] p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border mb-1">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-foreground">Notifications</span>
                      <span className="text-[10px] font-medium text-primary hover:underline cursor-pointer">Mark all as read</span>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                      {mockNotifications.map((notif) => (
                        <div 
                          key={notif.id}
                          className={`flex flex-col gap-1 p-3 rounded-lg transition-colors cursor-pointer hover:bg-accent/40 ${notif.unread ? "bg-accent/20" : ""}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-foreground">{notif.title}</span>
                            {notif.unread && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                          </div>
                          <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2">{notif.description}</p>
                          <span className="text-[10px] font-medium text-[#B4AAA2] mt-1">{notif.time}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1 border-t border-border pt-2 text-center">
                      <button className="w-full py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors">
                        View all activity
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-[11px] font-semibold uppercase text-[var(--surface-2)]">
                {user.fullName
                  .split(" ")
                  .map((name) => name[0])
                  .join("")
                  .slice(0, 2)}
            </div>
          </div>
        </header>

        <div className="custom-scrollbar flex-1 overflow-y-auto bg-background p-6">{children}</div>
      </main>

      {/* ── Mobile sidebar overlay ───────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Sliding sidebar */}
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-surface shadow-xl animate-in slide-in-from-left-300 duration-300">
            <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border px-4">
              <TeamLensLogo
                href="/dashboard"
                className="gap-2"
                markClassName="h-[22px] w-[22px]"
                textClassName="text-[15.5px] font-semibold text-foreground"
              />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-md text-foreground/80 hover:bg-accent/60 transition-colors"
                aria-label="Close menu"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-2 py-3">
              {sidebarGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</div>
                  <div className="space-y-0.5">
                    {group.links.map((link) => {
                      const isActive = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));
                      const Icon = link.icon;
                      return (
                        <Link
                          key={`${group.label}-${link.name}`}
                          href={link.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                            isActive
                              ? "bg-[var(--brand-tint)] text-primary font-medium"
                              : "text-foreground/80 hover:bg-accent/60"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{link.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="border-t border-border p-3">
              <button
                onClick={() => { logout(); setMobileMenuOpen(false); }}
                className="flex w-full items-center rounded-md px-2.5 py-1.5 text-[13px] text-foreground/80 transition-colors hover:bg-accent/60 hover:text-primary"
              >
                <LogOut className="mr-2.5 h-4 w-4" /> Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SidebarLayout>{children}</SidebarLayout>
    </AuthProvider>
  );
}
