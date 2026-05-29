import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEmployeeLiveScreen } from "./liveScreen";
import "./App.css";

type SessionEntry = {
  dayLabel: string;
  totalLabel: string;
  clockIn: string;
  clockOut: string;
};

type WorkSession = {
  id: string;
  userId: string;
  clockInAt: string;
  clockOutAt?: string;
};



type AgentLoginData = {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: "MANAGER" | "EMPLOYEE";
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

type AnalyticsPayload = {
  workSeconds: number;
  activeSeconds: number;
  productivityPercent: number;
  totalMouseMoves: number;
  totalKeyPresses: number;
  sessions: WorkSession[];
};

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type GlobalInputCounts = {
  mouse_moves: number;
  key_presses: number;
};

type ActiveWindowInfo = {
  app_name: string;
  window_title: string;
  process_path: string;
  browser_url?: string;
};

const getApiBase = (): string => {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  throw new Error("VITE_API_URL is required");
};

const getWebBase = (): string => {
  const configured = import.meta.env.VITE_WEB_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  throw new Error("VITE_WEB_URL is required");
};

const getWsBase = (): string => {
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return "http://localhost:4000";
};

const formatSeconds = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hrs}:${mins}:${secs} h`;
};

const formatTime = (iso?: string): string => {
  if (!iso) {
    return "--:--";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

const formatDayLabel = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Recent";
  }

  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (isToday) {
    return "Today";
  }

  return date.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
};

const getLocalDayRange = (): { start: Date; end: Date } => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const isSameLocalDay = (iso: string): boolean => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
};

const normalizeCoordinate = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const fetchJsonWithTimeout = async <T,>(url: string, timeoutMs: number): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const normalizeTrackedUrl = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed || /\s/.test(trimmed)) return undefined;
  if (/^(https?:\/\/|file:\/\/|chrome:\/\/|edge:\/\/|brave:\/\/|about:)/i.test(trimmed)) return trimmed;
  if (/^(localhost|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:[/?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return undefined;
};

const inferUrlFromTitle = (title: string, browserUrl?: string): string | undefined => {
  const normalizedBrowserUrl = normalizeTrackedUrl(browserUrl);
  if (normalizedBrowserUrl) return normalizedBrowserUrl;
  const match = title.match(/https?:\/\/[^\s|]+/i);
  return normalizeTrackedUrl(match?.[0]);
};

const invalidDomainSuffixes = new Set(["app", "css", "html", "js", "jsx", "json", "md", "py", "rs", "tsx", "ts", "txt", "vue", "xml"]);
const SCREENSHOT_INTERVAL_MIN_MS = 30_000;
const SCREENSHOT_INTERVAL_MAX_MS = 120_000;

const nextScreenshotDelayMs = () =>
  Math.floor(Math.random() * (SCREENSHOT_INTERVAL_MAX_MS - SCREENSHOT_INTERVAL_MIN_MS + 1)) + SCREENSHOT_INTERVAL_MIN_MS;

const cleanInferredDomain = (value?: string): string | undefined => {
  const domain = value?.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0]?.toLowerCase();
  if (!domain) return undefined;
  const parts = domain.split(".");
  const suffix = parts[parts.length - 1] ?? "";
  if (parts.length < 2 || invalidDomainSuffixes.has(suffix) || !/^[a-z0-9.-]+$/.test(domain) || parts.some((part) => !part)) {
    return undefined;
  }
  return domain;
};

const inferDomain = (activeWindow: ActiveWindowInfo): string | undefined => {
  const explicitUrl = inferUrlFromTitle(activeWindow.window_title, activeWindow.browser_url);
  if (explicitUrl) {
    try {
      return cleanInferredDomain(new URL(explicitUrl).hostname);
    } catch {
      return undefined;
    }
  }

  const title = activeWindow.window_title.toLowerCase();
  const domainMatch = title.match(/(?:^|\s|\||-)((?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:\s|$|\/|\||-)/i);
  const inferredDomain = cleanInferredDomain(domainMatch?.[1]);
  if (inferredDomain) return inferredDomain;

  const configuredWebHost = (() => {
    const configured = import.meta.env.VITE_WEB_URL?.trim();
    if (!configured) return undefined;

    try {
      return cleanInferredDomain(new URL(configured).hostname);
    } catch {
      return undefined;
    }
  })();

  const knownDomains = [
    "chatgpt.com",
    "github.com",
    "gitlab.com",
    "stackoverflow.com",
    "youtube.com",
    "reddit.com",
    "figma.com",
    "notion.so",
    "linear.app",
    "atlassian.net",
    configuredWebHost,
  ].filter((domain): domain is string => Boolean(domain));

  return knownDomains.find((domain) => title.includes(domain));
};

const toSessionEntries = (sessions: WorkSession[]): SessionEntry[] => {
  return sessions.map((session, index) => {
    const start = new Date(session.clockInAt);
    const end = session.clockOutAt ? new Date(session.clockOutAt) : new Date();
    const seconds = Number.isNaN(start.getTime()) ? 0 : Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));

    return {
      dayLabel: index === 0 ? formatDayLabel(session.clockInAt) : "",
      totalLabel: formatSeconds(seconds),
      clockIn: formatTime(session.clockInAt),
      clockOut: formatTime(session.clockOutAt),
    };
  });
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authUserName, setAuthUserName] = useState<string>("");
  const [organizationName, setOrganizationName] = useState<string>("");
  const [appVersion, setAppVersion] = useState<string>("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isClockedIn, setIsClockedIn] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastSync, setLastSync] = useState("Never");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isClockActionLoading, setIsClockActionLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<SessionEntry[]>([]);
  const [workSeconds, setWorkSeconds] = useState(0);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [productivity, setProductivity] = useState(0);
  const [totalMouseMoves, setTotalMouseMoves] = useState(0);
  const [totalKeyPresses, setTotalKeyPresses] = useState(0);
  const [lastSentMouseMoves, setLastSentMouseMoves] = useState(0);
  const [lastSentKeyPresses, setLastSentKeyPresses] = useState(0);
  const [lastInputSource, setLastInputSource] = useState<"global" | "fallback">("global");
  const [debugLocation, setDebugLocation] = useState<{ lat?: number; lng?: number; source?: string } | null>(null);
  const [activeWindow, setActiveWindow] = useState<ActiveWindowInfo | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const mouseMovesRef = useRef(0);
  const keyPressesRef = useRef(0);

  const apiBase = useMemo(() => getApiBase(), []);
  const webBase = useMemo(() => getWebBase(), []);
  const wsBase = useMemo(() => getWsBase(), []);
  const {
    isStreaming: isLiveScreenStreaming,
    liveMessage,
    stopLiveScreen,
  } = useEmployeeLiveScreen({
    apiBase,
    wsBase,
    authToken,
    enabled: isAuthenticated,
    captureEnabled: isClockedIn,
  });

  const authHeaders = useMemo(() => {
    if (!authToken) {
      return null;
    }

    return {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    };
  }, [authToken]);

  const applyAuth = (payload: AgentLoginData) => {
    setAuthToken(payload.token);
    setAuthUserId(payload.user.id);
    setAuthUserName(payload.user.fullName);
    setOrganizationName(payload.organization?.name || "");
    setIsAuthenticated(true);
    setAuthError(null);
  };

  const restoreAuthToken = async () => {
    try {
      const stored = await invoke<string | null>("get_auth_token");
      if (!stored) {
        return;
      }

      const response = await fetch(`${apiBase}/api/web/auth/me`, {
        headers: {
          Authorization: `Bearer ${stored}`,
          "Content-Type": "application/json",
        },
      });

      const payload = (await response.json()) as {
        success: boolean;
        data?: {
          id: string;
          fullName: string;
          email: string;
          role: "MANAGER" | "EMPLOYEE";
          organization: AgentLoginData["organization"];
        };
        message?: string;
      };

      if (!response.ok || !payload.success || !payload.data || payload.data.role !== "EMPLOYEE") {
        await invoke("clear_auth_token");
        setAuthToken(null);
        setIsAuthenticated(false);
        return;
      }

      applyAuth({
        token: stored,
        expiresAt: "",
        user: {
          id: payload.data.id,
          fullName: payload.data.fullName,
          email: payload.data.email,
          role: payload.data.role,
        },
        organization: payload.data.organization,
      });
    } catch (error) {
      console.error("Unable to restore auth token", error);
      setAuthToken(null);
      setIsAuthenticated(false);
    }
  };

  const login = async () => {
    setIsLoginLoading(true);
    setAuthError(null);

    try {
      const response = await fetch(`${apiBase}/api/agent/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          deviceLabel: "Desktop Agent",
        }),
      });

      const payload = (await response.json()) as { success: boolean; message?: string; data: AgentLoginData };
      if (!response.ok || !payload.success) {
        setAuthError(payload.message ?? "Login failed");
        return;
      }

      await invoke("set_auth_token", { token: payload.data.token });
      applyAuth(payload.data);
      setPassword("");
    } catch (error) {
      console.error("Agent login failed", error);
      setAuthError(`Error: ${error?.message ?? error ?? "Unknown error"}`);
    } finally {
      setIsLoginLoading(false);
    }
  };

  const logout = async () => {
    try {
      await invoke("clear_auth_token");
    } catch (error) {
      console.error("Unable to clear auth token", error);
    }

    setIsAuthenticated(false);
    setAuthToken(null);
    setAuthUserId(null);
    setAuthUserName("");
    setIsClockedIn(false);
    setStartedAt(null);
    setElapsedSeconds(0);
    setSessionId(null);
    stopLiveScreen("logout");
  };

  const checkForAgentUpdate = async () => {
    try {
      const update = await check();
      if (!update) {
        return;
      }

      setSyncMessage(`Installing TeamLens update ${update.version}...`);
      await update.downloadAndInstall();
      await relaunch();
    } catch (error) {
      console.error("Agent update check failed", error);
    }
  };

  const refreshAnalytics = async () => {
    if (!authUserId || !authHeaders) {
      return;
    }

    try {
      const { start, end } = getLocalDayRange();
      const params = new URLSearchParams({
        userId: authUserId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      const res = await fetch(`${apiBase}/api/web/dashboard/analytics?${params.toString()}`, {
        headers: authHeaders,
      });
      const json = (await res.json()) as ApiSuccess<AnalyticsPayload>;

      if (!res.ok || !json.success) {
        return;
      }

      setWorkSeconds(json.data.workSeconds);
      setActiveSeconds(json.data.activeSeconds);
      setProductivity(json.data.productivityPercent);
      setTotalMouseMoves(json.data.totalMouseMoves);
      setTotalKeyPresses(json.data.totalKeyPresses);
      setHistory(toSessionEntries(json.data.sessions));
    } catch (error) {
      console.error("Failed to refresh analytics", error);
    }
  };

  const sendData = async () => {
    if (!isClockedIn || !authHeaders) {
      return;
    }

    let mouseMoves = 0;
    let keyPresses = 0;

    try {
      const globalCounts = await invoke<GlobalInputCounts>("get_and_reset_input_counts");
      mouseMoves = Number(globalCounts.mouse_moves) || 0;
      keyPresses = Number(globalCounts.key_presses) || 0;
      setLastInputSource("global");
    } catch (error) {
      console.error("Unable to read global input counters", error);
      // Fallback only when native counter is unavailable.
      mouseMoves = mouseMovesRef.current;
      keyPresses = keyPressesRef.current;
      setLastInputSource("fallback");
    }

    setLastSentMouseMoves(mouseMoves);
    setLastSentKeyPresses(keyPresses);

    mouseMovesRef.current = 0;
    keyPressesRef.current = 0;

    try {
      let windowInfo: ActiveWindowInfo = activeWindow ?? {
        app_name: "Unknown",
        window_title: "",
        process_path: "",
      };

      try {
        windowInfo = await invoke<ActiveWindowInfo>("get_active_window_info");
        setActiveWindow(windowInfo);
      } catch (windowError) {
        console.error("Unable to read active window", windowError);
      }

      const res = await fetch(`${apiBase}/api/agent/activity`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          sessionId,
          mouseMoves,
          keyPresses,
          capturedAt: new Date().toISOString(),
        }),
      });

      const data = await res.json();
      console.log("Sent:", data);

      const url = inferUrlFromTitle(windowInfo.window_title, windowInfo.browser_url);
      const domain = inferDomain(windowInfo);
      await fetch(`${apiBase}/api/agent/usage`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          sessionId,
          appName: windowInfo.app_name || "Unknown",
          windowTitle: windowInfo.window_title || undefined,
          domain,
          url,
          durationSeconds: 10,
          idleSeconds: mouseMoves === 0 && keyPresses === 0 ? 10 : 0,
          isIdle: mouseMoves === 0 && keyPresses === 0,
          capturedAt: new Date().toISOString(),
        }),
      }).catch((usageError) => {
        console.error("Usage sync failed", usageError);
      });

      const now = new Date();
      setLastSync(`Today at ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      setSyncMessage(null);
      await refreshAnalytics();
    } catch (err) {
      console.error("Error:", err);
      setSyncMessage("Backend sync failed. Tracking continues locally.");
    }
  };

  const captureAndUploadScreenshot = async (options?: { sessionId?: string; force?: boolean }) => {
    const activeSessionId = options?.sessionId ?? sessionId;

    if ((!isClockedIn && !options?.force) || !authHeaders || !activeSessionId) {
      return;
    }

    try {
      let windowInfo: ActiveWindowInfo = activeWindow ?? {
        app_name: "Unknown",
        window_title: "",
        process_path: "",
      };
      try {
        windowInfo = await invoke<ActiveWindowInfo>("get_active_window_info");
        setActiveWindow(windowInfo);
      } catch (windowError) {
        console.error("Unable to read active window for screenshot", windowError);
      }

      // Capture screenshot using Tauri command
      const screenshotData = await invoke<number[]>("capture_screenshot");
      const screenshotBlob = new Blob([new Uint8Array(screenshotData)], { type: "image/png" });

      // Upload to backend
      const formData = new FormData();
      formData.append("sessionId", activeSessionId);
      formData.append("capturedAt", new Date().toISOString());
      formData.append("activeApplication", windowInfo.app_name || "Unknown");
      formData.append("windowTitle", windowInfo.window_title || "");
      formData.append("projectName", "Default Project");
      const domain = inferDomain(windowInfo);
      const url = inferUrlFromTitle(windowInfo.window_title, windowInfo.browser_url);
      if (domain) formData.append("domain", domain);
      if (url) formData.append("url", url);
      formData.append("screenshot", screenshotBlob, "screenshot.png");

      const response = await fetch(`${apiBase}/api/agent/screenshots`, {
        method: "POST",
        headers: {
          Authorization: authHeaders.Authorization,
        },
        body: formData,
      });

      if (!response.ok) {
        console.error("Failed to upload screenshot:", response.statusText);
        return;
      }

      const result = (await response.json()) as { success: boolean; data: { id: string } };
      if (result.success) {
        console.log("Screenshot uploaded:", result.data.id);
      }
    } catch (error) {
      console.error("Screenshot capture/upload failed:", error);
    }
  };

  useEffect(() => {
    void restoreAuthToken();
    getVersion().then(setAppVersion).catch(() => setAppVersion("0.1.0"));
  }, []);

  useEffect(() => {
    const onMouseMove = () => {
      if (isClockedIn) {
        mouseMovesRef.current += 1;
      }
    };

    const onKeyDown = () => {
      if (isClockedIn) {
        keyPressesRef.current += 1;
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isClockedIn]);

  useEffect(() => {
    if (!isClockedIn || !startedAt) {
      return;
    }

    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      setElapsedSeconds(seconds);
    }, 1000);

    const activityInterval = setInterval(sendData, 10000);

    let screenshotTimeout: number | undefined;
    const scheduleScreenshot = () => {
      screenshotTimeout = window.setTimeout(() => {
        void captureAndUploadScreenshot();
        scheduleScreenshot();
      }, nextScreenshotDelayMs());
    };

    scheduleScreenshot();

    return () => {
      clearInterval(timer);
      clearInterval(activityInterval);
      if (screenshotTimeout !== undefined) {
        clearTimeout(screenshotTimeout);
      }
    };
  }, [isClockedIn, startedAt, sessionId]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void refreshAnalytics();
    const interval = setInterval(() => {
      void refreshAnalytics();
    }, 30000);

    return () => clearInterval(interval);
  }, [isAuthenticated, authUserId, authHeaders]);

  useEffect(() => {
    if (!isAuthenticated || isClockedIn) {
      return;
    }

    void checkForAgentUpdate();
    const interval = setInterval(() => {
      void checkForAgentUpdate();
    }, 6 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, isClockedIn]);

  useEffect(() => {
    if (!isAuthenticated || !authHeaders) {
      return;
    }

    const recoverSession = async () => {
      try {
        const { start } = getLocalDayRange();
        const params = new URLSearchParams({ activeAfter: start.toISOString() });
        const res = await fetch(`${apiBase}/api/agent/active-session?${params.toString()}`, {
          headers: authHeaders,
        });
        if (!res.ok) {
          if (res.status === 401) {
            await logout();
          }
          return;
        }

        const payload = (await res.json()) as {
          success: boolean;
          data: WorkSession | null;
        };

        if (!payload.success || !payload.data) {
          return;
        }

        const active = payload.data;
        if (!isSameLocalDay(active.clockInAt)) {
          setSessionId(null);
          setIsClockedIn(false);
          setStartedAt(null);
          setElapsedSeconds(0);
          return;
        }

        setSessionId(active.id);
        setIsClockedIn(true);

        const started = new Date(active.clockInAt);
        if (!Number.isNaN(started.getTime())) {
          setStartedAt(started);
          setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000)));
        }

        void captureAndUploadScreenshot({ sessionId: active.id, force: true });
      } catch (error) {
        console.error("Session recovery failed", error);
      }
    };

    void recoverSession();
  }, [apiBase, isAuthenticated, authHeaders]);

  const toggleClockStatus = () => {
    if (isClockedIn) {
      void (async () => {
        setIsClockActionLoading(true);
        await sendData();

        try {
          const response = await fetch(`${apiBase}/api/agent/clock-out`, {
            method: "POST",
            headers: authHeaders ?? { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: sessionId ?? undefined,
              timestamp: new Date().toISOString(),
            }),
          });

          if (!response.ok) {
            setSyncMessage("Clock-out saved locally. Backend update pending.");
          }
        } catch (error) {
          console.error("Clock-out failed", error);
          setSyncMessage("Clock-out saved locally. Backend update pending.");
        }

        setSessionId(null);
        setIsClockedIn(false);
        setStartedAt(null);
        await refreshAnalytics();
        setIsClockActionLoading(false);
      })();

      return;
    }

    void (async () => {
      setIsClockActionLoading(true);
      const now = new Date();

      try {
        const optimisticSessionId = crypto.randomUUID();

        // Optimistic mode: instantly start timer so the button always feels responsive.
        setSessionId(optimisticSessionId);
        setStartedAt(now);
        setElapsedSeconds(0);
        setIsClockedIn(true);
        setSyncMessage(null);

        let lat: number | undefined;
        let lng: number | undefined;
        let locationSource: "gps" | "ip" | undefined;

        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          locationSource = "gps";
        } catch (err) {
          console.warn("Could not get native location, falling back to IP:", err);
          try {
            const ipData = await fetchJsonWithTimeout<{ latitude?: unknown; longitude?: unknown }>(
              "https://ipapi.co/json/",
              3000,
            );
            const parsedLat = normalizeCoordinate(ipData?.latitude);
            const parsedLng = normalizeCoordinate(ipData?.longitude);

            if (parsedLat !== undefined && parsedLng !== undefined) {
              lat = parsedLat;
              lng = parsedLng;
              locationSource = "ip";
            }
          } catch (ipErr) {
            console.error("IP fallback also failed:", ipErr);
          }
        }

        setDebugLocation({ lat, lng, source: locationSource });

        try {
          const res = await fetch(`${apiBase}/api/agent/clock-in`, {
            method: "POST",
            headers: authHeaders ?? { "Content-Type": "application/json" },
            body: JSON.stringify({
              timestamp: now.toISOString(),
              activeAfter: getLocalDayRange().start.toISOString(),
              latitude: lat,
              longitude: lng,
              locationSource,
            }),
          });

          if (res.ok) {
            const json = (await res.json()) as ApiSuccess<{ id: string }>;
            setSessionId(json.data.id);
            void captureAndUploadScreenshot({ sessionId: json.data.id, force: true });
          } else {
            setSyncMessage("Clock-in started locally. Backend sync pending.");
          }
        } catch (error) {
          console.error("Clock-in failed", error);
          setSyncMessage("Clock-in started locally. Backend is unreachable.");
        }

        await sendData();
      } catch (error) {
        console.error("Clock-in action failed", error);
        setSyncMessage("Clock-in action failed. Please try again.");
      } finally {
        setIsClockActionLoading(false);
      }
    })();
  };

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [],
  );

  const startedAtLabel = startedAt
    ? startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const appWindow = getCurrentWindow();

  const handleClose = async () => {
    await appWindow.close();
  };

  const handleMinimize = async () => {
    await appWindow.minimize();
  };

  const openDashboard = async () => {
    try {
      await openUrl(webBase);
    } catch {
      window.open(webBase, "_blank");
    }
  };

  const openCreateAccount = async () => {
    const signupUrl = `${webBase}/signup`;

    try {
      await openUrl(signupUrl);
    } catch {
      window.open(signupUrl, "_blank");
    }
  };

  if (!isAuthenticated || !authToken) {
    return (
      <div className="agent-shell">
        <header className="top-bar">
          <div className="window-controls">
            <button className="control-dot red" onClick={() => void handleClose()} aria-label="Close window" />
            <button
              className="control-dot yellow"
              onClick={() => void handleMinimize()}
              aria-label="Minimize window"
            />
            <button
              className="control-dot green"
              disabled
              aria-label="Window size locked"
            />
          </div>
          <div className="brand-name" data-tauri-drag-region>
            <span className="tl-brand-mark" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </span>{" "}
            TeamLens
          </div>
          <div className="bar-spacer" data-tauri-drag-region />
        </header>

        <div className="auth-shell" data-tauri-drag-region>
          <section className="auth-card">
            <h1>TeamLens Agent Login</h1>
            <p>Sign in to start secure desktop activity tracking.</p>

            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
              />
            </label>

            <button className="clock-btn clock-in" onClick={() => void login()} disabled={isLoginLoading}>
              {isLoginLoading ? "Logging in..." : "Login"}
            </button>

            <button className="create-account-btn" onClick={() => void openCreateAccount()}>
              Create Account
            </button>

            {authError ? <p className="sync-message">{authError}</p> : null}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-shell">
      <section className="top-card">
        <header className="top-bar">
          <div className="window-controls">
            <button className="control-dot red" onClick={() => void handleClose()} aria-label="Close window" />
            <button
              className="control-dot yellow"
              onClick={() => void handleMinimize()}
              aria-label="Minimize window"
            />
            <button
              className="control-dot green"
              disabled
              aria-label="Window size locked"
            />
          </div>
          <div className="brand-name" data-tauri-drag-region>
            <span className="tl-brand-mark" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </span>{" "}
            TeamLens
          </div>
          <div className="bar-spacer">
            <div className="profile-icon" onClick={() => setIsSidebarOpen(true)} title="Profile">
              {authUserName.substring(0, 2).toUpperCase() || "PM"}
            </div>
          </div>
        </header>

        {isSidebarOpen && (
          <>
            <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
            <aside className="profile-sidebar">
              <div className="sidebar-header">
                <h2>Account</h2>
                <button className="close-btn" onClick={() => setIsSidebarOpen(false)}>×</button>
              </div>

              <div className="sidebar-tabs">
                <div className="active-tab">Profile</div>
              </div>

              <div className="sidebar-content account-content">
                <div className="profile-info">
                  <div className="profile-avatar-large">
                    {authUserName.substring(0, 2).toUpperCase() || "PM"}
                  </div>
                  <h3>{authUserName || "User"}</h3>
                  <p>{email || ""}</p>
                </div>

                <div className="companies-section">
                  <h4 className="section-title">Companies</h4>
                  <div className="company-item">
                    <span>{organizationName || "Company"}</span>
                    <span className="check-icon">✓</span>
                  </div>
                </div>
              </div>

              <div className="sidebar-footer account-footer">
                <button className="signout-link" onClick={() => { setIsSidebarOpen(false); void logout(); }}>
                  Sign out
                </button>
                <span className="app-version">Version: {appVersion}</span>
              </div>
            </aside>
          </>
        )}

        <div className="timer-panel">
          <p className="date-label">{todayLabel}</p>
          <h1 className="live-timer">{formatSeconds(elapsedSeconds)}</h1>
          <p className="started-at">
            Started at {startedAtLabel}
          </p>

          <div className="clock-actions">
            <button
              className={`clock-btn ${isClockedIn ? "clock-out" : "clock-in"}`}
              onClick={toggleClockStatus}
              disabled={isClockActionLoading}
            >
              {isClockedIn ? "Clock Out" : "Clock In"}
            </button>
          </div>
          {syncMessage ? <p className="sync-message">{syncMessage}</p> : null}
          {isLiveScreenStreaming ? (
            <div className="live-stream-indicator" role="status">
              <span className="live-dot" />
              Live screen streaming active
              <button type="button" onClick={() => stopLiveScreen("ended")}>
                Stop
              </button>
            </div>
          ) : liveMessage ? (
            <p className="sync-message">{liveMessage}</p>
          ) : null}
        </div>
      </section>

      <main className="sessions-panel">
        <section className="day-block">
          <div className="day-header">
            <h2>Today</h2>
            <span>{formatSeconds(workSeconds)}</span>
          </div>
          <article className="session-card">
            <div>
              <p>Active Time</p>
              <strong>{formatSeconds(activeSeconds)}</strong>
            </div>
            <div>
              <p>Productivity</p>
              <strong>{productivity}%</strong>
            </div>
            <div className="session-total">
            </div>
          </article>
          <article className="session-card">
            <div>
              <p>Mouse Activity</p>
              <strong>{totalMouseMoves.toLocaleString()} moves</strong>
            </div>
            <div>
              <p>Keyboard Activity</p>
              <strong>{totalKeyPresses.toLocaleString()} keys</strong>
            </div>
            <div className="session-total">
            </div>
          </article>
        </section>

        {history.map((entry, index) => (
          <section key={`${entry.totalLabel}-${index}`} className="day-block">
            {(entry.dayLabel || index === 0) && (
              <div className="day-header">
                <h2>{entry.dayLabel || "Records"}</h2>
                <span>{entry.totalLabel}</span>
              </div>
            )}

            <article className="session-card">
              <div>
                <p>Clock In</p>
                <strong>{entry.clockIn}</strong>
              </div>
              <div>
                <p>Clock Out</p>
                <strong>{entry.clockOut}</strong>
              </div>
              <div className="session-total">
                {entry.totalLabel}
              </div>
            </article>
          </section>
        ))}
      </main>

      <footer className="bottom-bar">
        <div className="sync-container">
          <button className="sync-btn" onClick={() => void sendData()}>
            ↻
          </button>
          <div className="sync-status">
            <span>Last sync</span>
            <strong>{lastSync}</strong>
            <p className="debug-telemetry">
              Last sent: mouse {lastSentMouseMoves} | keys {lastSentKeyPresses} | source {lastInputSource}
            </p>
            {debugLocation && (
              <p className="debug-telemetry" style={{ marginTop: "2px", color: "#94a3b8" }}>
                Loc: {debugLocation.source?.toUpperCase() || "N/A"} | {debugLocation.lat?.toFixed(4) || "N/A"},{" "}
                {debugLocation.lng?.toFixed(4) || "N/A"}
              </p>
            )}
          </div>
        </div>
        <button className="dashboard-btn" onClick={() => void openDashboard()}>
          Open Dashboard
        </button>
      </footer>
    </div>
  );
}

export default App;
