"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

import type { DateRange } from "../components/DateFilter";
import { getPresetRange } from "../components/DateFilter";

export type Role = "MANAGER" | "EMPLOYEE";

export type UserProfile = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  organizationId: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
};

type AuthContextType = {
  user: UserProfile | null;
  organization: Organization | null;
  apiBase: string;
  authHeaders: { "Content-Type": string; Authorization?: string } | null;
  selectedUserId: string;
  setSelectedUserId: (id: string) => void;
  selectedTeamId: string;
  setSelectedTeamId: (id: string) => void;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  logout: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const DATE_RANGE_STORAGE_KEY = "teamlens_date_range";
const TEAM_SELECTION_STORAGE_KEY = "teamlens_selected_team";
const ACCESS_TOKEN_STORAGE_KEY = "teamlens_access_token";

const getInitialDateRange = (): DateRange => {
  const fallback = getPresetRange("Today");
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.localStorage.getItem(DATE_RANGE_STORAGE_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as {
      label?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!parsed.startDate || !parsed.endDate) {
      return fallback;
    }

    const startDate = new Date(parsed.startDate);
    const endDate = new Date(parsed.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return fallback;
    }

    return {
      label: parsed.label?.trim() || fallback.label,
      startDate,
      endDate,
    };
  } catch {
    return fallback;
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [accessToken, setAccessToken] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedTeamId, setSelectedTeamIdState] = useState<string>("");
  const [dateRange, setDateRangeState] = useState<DateRange>(() => getInitialDateRange());
  const [isLoading, setIsLoading] = useState(true);

  // Load date range and team selection from localStorage after mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const rawDate = window.localStorage.getItem(DATE_RANGE_STORAGE_KEY);
      if (rawDate) {
        try {
          const parsed = JSON.parse(rawDate);
          if (parsed.startDate && parsed.endDate) {
            const startDate = new Date(parsed.startDate);
            const endDate = new Date(parsed.endDate);
            if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
              setDateRangeState({
                label: parsed.label?.trim() || getPresetRange("Today").label,
                startDate,
                endDate,
              });
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      const rawTeam = window.localStorage.getItem(TEAM_SELECTION_STORAGE_KEY);
      if (rawTeam) {
        setSelectedTeamIdState(rawTeam);
      }
    }
  }, []);

  const setSelectedTeamId = (id: string) => {
    setSelectedTeamIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        window.localStorage.setItem(TEAM_SELECTION_STORAGE_KEY, id);
      } else {
        window.localStorage.removeItem(TEAM_SELECTION_STORAGE_KEY);
      }
    }
  };

  const apiBase = useMemo(() => {
    const envBase = process.env.NEXT_PUBLIC_API_URL?.trim();
    return envBase && envBase.length > 0 ? envBase.replace(/\/$/, "") : "";
  }, []);

  const authHeaders = useMemo(() => {
    if (!user) return null;
    return {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };
  }, [accessToken, user]);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = typeof window !== "undefined" ? window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? "" : "";
        const response = await fetch(`${apiBase}/api/web/auth/me`, {
          method: "GET",
          headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : undefined,
          credentials: "include",
          cache: "no-store",
        });

        const payload = await response.json();

        if (response.ok && payload.success) {
          setUser({
            id: payload.data.id,
            fullName: payload.data.fullName,
            email: payload.data.email,
            role: payload.data.role,
            organizationId: payload.data.organization.id,
          });
          setOrganization(payload.data.organization);
          setAccessToken(storedToken);
          
          if (!selectedUserId) {
            setSelectedUserId(payload.data.id);
          }
        } else {
          setUser(null);
          setOrganization(null);
          setAccessToken("");
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error("Session restore error", error);
      } finally {
        setIsLoading(false);
      }
    };

    void restoreSession();
  }, [apiBase, selectedUserId]);

  const setDateRange = (range: DateRange) => {
    setDateRangeState(range);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        DATE_RANGE_STORAGE_KEY,
        JSON.stringify({
          label: range.label,
          startDate: range.startDate.toISOString(),
          endDate: range.endDate.toISOString(),
        }),
      );
    }
  };

  const logout = () => {
    void fetch(`${apiBase}/api/web/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch((error) => {
      console.error("Logout request failed", error);
    });
    setUser(null);
    setOrganization(null);
    setAccessToken("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
    setSelectedUserId("");
    setSelectedTeamId("");
    router.push("/manager/sign-in");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        apiBase,
        authHeaders,
        selectedUserId,
        setSelectedUserId,
        selectedTeamId,
        setSelectedTeamId,
        dateRange,
        setDateRange,
        logout,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
