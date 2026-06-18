"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  LogOut,
  Layers,
} from "lucide-react";
import { AuthProvider, useAuth } from "../../contexts/AuthContext";
import TeamLensLogo from "../../components/TeamLensLogo";

function SuperAdminSidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace("/manager/sign-in");
      } else if (user.role !== "SUPERADMIN") {
        router.replace("/dashboard");
      }
    }
  }, [isLoading, router, user]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8F5F1] text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <div className="text-[10px] font-semibold tracking-[0.2em] text-[#B4AAA2] uppercase">
            Loading Admin Control Panel
          </div>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "SUPERADMIN") return null;

  const sidebarLinks = [
    { name: "Workspace Stats", href: "/superadmin/dashboard", icon: Activity },
    { name: "Leads Pipeline", href: "/superadmin/leads", icon: Layers },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans selection:bg-brand/10">
      {/* Sidebar Desktop */}
      <aside className="hidden h-full w-[224px] shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-[52px] shrink-0 items-center border-b border-border px-4 gap-2.5">
          <TeamLensLogo
            href="/superadmin/dashboard"
            className="gap-2"
            markClassName="h-[22px] w-[22px]"
            textClassName="text-[15.5px] font-semibold text-foreground"
          />
          <span className="text-[8px] font-extrabold uppercase bg-brand/10 border border-brand/20 text-brand px-1.5 py-0.5 rounded">
            Admin
          </span>
        </div>

        <nav className="flex-1 space-y-4 px-2 py-3">
          <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Platform Administration
          </div>
          <div className="space-y-0.5">
            {sidebarLinks.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                    isActive
                      ? "bg-[var(--brand-tint)] text-primary font-semibold"
                      : "text-foreground/80 hover:bg-accent/60"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{link.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-border p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-foreground/80 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center justify-between border-b border-border bg-[var(--surface-2)] px-6">
          <div className="hidden md:flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Platform Administration</span>
            <span className="text-[10px] text-[#B4AAA2] font-semibold uppercase tracking-wider ml-1">Control Panel</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-foreground">{user.fullName}</div>
              <div className="text-[11px] text-muted-foreground">{user.email}</div>
            </div>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-brand text-[11px] font-bold uppercase text-white shadow-lg shadow-brand/20">
              SA
            </div>
          </div>
        </header>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SuperAdminSidebarLayout>{children}</SuperAdminSidebarLayout>
    </AuthProvider>
  );
}
