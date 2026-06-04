"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { Image as ImageIcon, AlertCircle, Clock, MoreVertical, ChevronLeft, ChevronRight, X, Play, Pause, Globe2, Monitor } from "lucide-react";
import DashboardDateFilter from "../../../components/DashboardDateFilter";
import ThemedSelect from "../../../components/ThemedSelect";

type Screenshot = {
  id: string;
  userId: string;
  sessionId?: string;
  activeApplication?: string;
  windowTitle?: string;
  domain?: string;
  url?: string;
  employeeName?: string;
  projectName?: string;
  capturedAt: string;
  createdAt: string;
};

type ApiUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status?: string;
};

type ApiTeam = {
  id: string;
  name: string;
  members?: Array<{ id: string }>;
};

type EmployeeOption = ApiUser & {
  teamId: string | null;
  teamName: string;
};

const appNameMap: Record<string, string> = {
  code: "Visual Studio Code",
  "code.exe": "Visual Studio Code",
  "visual studio code": "Visual Studio Code",
  brave: "Brave Browser",
  "brave.exe": "Brave Browser",
  chrome: "Google Chrome",
  "chrome.exe": "Google Chrome",
  msedge: "Microsoft Edge",
  "msedge.exe": "Microsoft Edge",
  firefox: "Mozilla Firefox",
  "firefox.exe": "Mozilla Firefox",
  discord: "Discord",
  "discord.exe": "Discord",
};

const browserApps = new Set(["brave", "brave.exe", "chrome", "chrome.exe", "msedge", "msedge.exe", "firefox", "firefox.exe"]);
const invalidDomainSuffixes = new Set(["app", "css", "html", "js", "jsx", "json", "md", "py", "rs", "tsx", "ts", "txt", "vue", "xml"]);

const normalize = (value?: string | null) => (value ?? "").trim();
const normalizeKey = (value?: string | null) => normalize(value).toLowerCase();

const cleanDomain = (value?: string | null) => {
  const raw = normalize(value).replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0]?.toLowerCase();
  if (!raw) return "";
  const parts = raw.split(".");
  const suffix = parts[parts.length - 1] ?? "";
  if (
    parts.length < 2 ||
    invalidDomainSuffixes.has(suffix) ||
    !/^[a-z0-9.-]+$/.test(raw) ||
    raw.includes("..") ||
    parts.some((part) => !part)
  ) {
    return "";
  }
  return raw;
};

const titleCase = (value: string) =>
  value
    .replace(/\.exe$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase());

const friendlyAppName = (value?: string | null) => {
  const key = normalizeKey(value);
  if (!key) return "Unknown application";
  return appNameMap[key] ?? titleCase(key);
};

const inferDomainFromText = (value?: string | null) => {
  const match = normalize(value).match(/(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?/i);
  return cleanDomain(match?.[1]);
};

const cleanBrowserTitle = (title?: string | null) => {
  const cleaned = normalize(title).replace(/\s+[-|]\s+(Brave|Google Chrome|Microsoft Edge|Mozilla Firefox|Firefox)$/i, "");
  if (!cleaned) return "";
  return cleaned.length > 70 ? `${cleaned.slice(0, 67)}...` : cleaned;
};

const screenshotDisplayName = (screenshot: Screenshot) => {
  const appKey = normalizeKey(screenshot.activeApplication);
  const isBrowser = browserApps.has(appKey);
  const domain = cleanDomain(screenshot.domain) || inferDomainFromText(screenshot.url);
  if (domain) return domain;

  if (isBrowser) {
    const title = cleanBrowserTitle(screenshot.windowTitle);
    if (title && normalizeKey(title) !== appKey) return title;
  }

  return friendlyAppName(screenshot.activeApplication);
};

const trackedUrlLabel = (screenshot: Screenshot) => {
  const url = normalize(screenshot.url);
  if (!url) return "";
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
};

const trackedWindowLabel = (screenshot: Screenshot) => cleanBrowserTitle(screenshot.windowTitle) || normalize(screenshot.windowTitle);

function ScreenshotCard({
  screenshot,
  onExpand,
}: {
  screenshot: Screenshot;
  onExpand: (screenshot: Screenshot) => void;
}) {
  const { authHeaders, apiBase } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);
  const displayName = screenshotDisplayName(screenshot);
  const appName = friendlyAppName(screenshot.activeApplication);
  const urlLabel = trackedUrlLabel(screenshot);
  const windowLabel = trackedWindowLabel(screenshot);

  useEffect(() => {
    if (!authHeaders) {
      setImageError("Missing auth token.");
      setIsLoadingImage(false);
      return;
    }

    let objectUrl: string | null = null;
    let isMounted = true;

    const loadImage = async () => {
      setIsLoadingImage(true);
      setImageError(null);

      try {
        const response = await fetch(`${apiBase}/api/agent/screenshots/${screenshot.id}`, {
          headers: authHeaders,
          credentials: "include",
        });

        if (!response.ok) {
          setImageError(`Failed to load screenshot (${response.status})`);
          setIsLoadingImage(false);
          return;
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (isMounted) {
          setImageUrl(objectUrl);
        }
      } catch (error) {
        console.error("Failed to load screenshot image", error);
        if (isMounted) {
          setImageError("Unable to load screenshot image.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingImage(false);
        }
      }
    };

    void loadImage();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [authHeaders, apiBase, screenshot.id]);

  return (
    <button
      onClick={() => imageUrl && onExpand(screenshot)}
      className="group block w-full overflow-hidden rounded-md border border-slate-200 bg-white text-left shadow-sm transition-all duration-200 hover:border-emerald-500 hover:shadow-md"
    >
      <div className="flex h-12 items-center justify-between px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500">
            <ImageIcon className="h-3.5 w-3.5" />
          </span>
          <p className="truncate text-[12px] font-medium text-slate-600" title={displayName}>
            {displayName}
          </p>
        </div>
        <MoreVertical className="h-4 w-4 text-slate-400" />
      </div>
      <div className="aspect-[16/11] w-full overflow-hidden bg-slate-900 flex items-center justify-center">
        {isLoadingImage ? (
          <p className="text-[11px] text-slate-300">Loading...</p>
        ) : imageError ? (
          <p className="px-3 text-center text-[11px] text-red-200">{imageError}</p>
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Screenshot"
            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <p className="text-[11px] text-slate-300">No preview available</p>
        )}
      </div>
      <div className="space-y-1.5 bg-white p-3">
        <p className="flex items-center gap-2 text-[12px] font-medium text-slate-600">
          <Clock className="h-3.5 w-3.5" />
          {new Date(screenshot.capturedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </p>
        <p className="truncate text-[12px] font-medium text-slate-600">{screenshot.employeeName || "Employee"}</p>
        <p className="flex items-center gap-2 truncate text-[11px] font-medium text-slate-500" title={appName}>
          <Monitor className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{appName}</span>
        </p>
        {urlLabel ? (
          <p className="flex items-center gap-2 truncate text-[11px] font-medium text-emerald-700" title={screenshot.url}>
            <Globe2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{urlLabel}</span>
          </p>
        ) : windowLabel ? (
          <p className="truncate text-[11px] font-medium text-slate-500" title={windowLabel}>
            {windowLabel}
          </p>
        ) : (
          <p className="truncate text-[11px] font-medium text-slate-500">{screenshot.projectName || "Default Project"}</p>
        )}
      </div>
    </button>
  );
}

export default function ScreenshotsView() {
  const { authHeaders, apiBase, selectedUserId, dateRange, user } = useAuth();
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedScreenshotId, setExpandedScreenshotId] = useState<string | null>(null);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandedError, setExpandedError] = useState("");
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const perPage = 24;

  useEffect(() => {
    if (!authHeaders) return;

    const fetchFilters = async () => {
      if (user?.role !== "MANAGER") {
        setEmployees([
          {
            id: selectedUserId || user?.id || "",
            fullName: user?.fullName || "Me",
            email: user?.email || "",
            role: user?.role || "EMPLOYEE",
            status: "ACTIVE",
            teamId: null,
            teamName: "My Screenshots",
          },
        ]);
        setEmployeeFilter(selectedUserId || user?.id || "all");
        return;
      }

      try {
        const [usersRes, teamsRes] = await Promise.all([
          fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" }),
          fetch(`${apiBase}/api/web/teams`, { headers: authHeaders, credentials: "include" }),
        ]);
        const [usersData, teamsData] = await Promise.all([usersRes.json(), teamsRes.json()]);
        const teamList = (teamsData.success ? teamsData.data : []) as ApiTeam[];
        const userList = (usersData.success ? usersData.data : []) as ApiUser[];

        setTeams(teamList);
        setEmployees(
          userList.map((item) => {
            const team = teamList.find((candidate) => candidate.members?.some((member) => member.id === item.id));
            return {
              ...item,
              teamId: team?.id ?? null,
              teamName: team?.name ?? "Unassigned",
            };
          }),
        );
      } catch (err) {
        console.error("Failed to load screenshot filters", err);
      }
    };

    void fetchFilters();
  }, [authHeaders, apiBase, selectedUserId, user]);

  const scopedEmployees = useMemo(() => {
    let result = employees.filter((employee) => employee.id);
    if (teamFilter !== "all") result = result.filter((employee) => employee.teamId === teamFilter);
    if (employeeFilter !== "all") result = result.filter((employee) => employee.id === employeeFilter);

    return result;
  }, [employees, employeeFilter, teamFilter]);

  useEffect(() => {
    if (!authHeaders || scopedEmployees.length === 0) {
      setScreenshots([]);
      setLoading(false);
      return;
    }

    const fetchScreenshots = async () => {
      setLoading(true);
      setError("");
      try {
        const userIds = scopedEmployees.map((e) => e.id).join(",");
        const queryParams = new URLSearchParams({
          userIds,
          limit: String(perPage),
          page: String(page),
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString(),
        });
        const response = await fetch(`${apiBase}/api/agent/screenshots?${queryParams.toString()}`, {
          headers: authHeaders,
          credentials: "include",
        });
        const result = await response.json();
        if (!result.success) {
          setScreenshots([]);
          return;
        }
        const data = result.data as Screenshot[];
        // Build employee name map
        const empMap = new Map(scopedEmployees.map((e) => [e.id, e.fullName]));
        const mapped: Screenshot[] = data.map((s) => ({
          ...s,
          employeeName: s.employeeName || empMap.get(s.userId) || "Unknown",
        }));
        setScreenshots(mapped);
        setHasMore(mapped.length >= perPage);
      } catch (err) {
        console.error("Failed to fetch screenshots", err);
        setError("An error occurred while fetching screenshots.");
      } finally {
        setLoading(false);
      }
    };

    void fetchScreenshots();
  }, [authHeaders, apiBase, dateRange, employeeFilter, scopedEmployees, teamFilter, page]);

  const selectedTeamEmployees = teamFilter === "all" ? employees : employees.filter((employee) => employee.teamId === teamFilter);
  const expandedIndex = expandedScreenshotId ? screenshots.findIndex((screenshot) => screenshot.id === expandedScreenshotId) : -1;
  const expandedScreenshot = expandedIndex >= 0 ? screenshots[expandedIndex] : null;
  const hasPreviousScreenshot = expandedIndex > 0;
  const hasNextScreenshot = expandedIndex >= 0 && expandedIndex < screenshots.length - 1;

  const openScreenshot = useCallback(async (screenshot: Screenshot | null) => {
    if (!screenshot || !authHeaders) return;

    setExpandedScreenshotId(screenshot.id);
    setExpandedUrl(null);
    setExpandedError("");
    setExpandedLoading(true);

    try {
      const response = await fetch(`${apiBase}/api/agent/screenshots/${screenshot.id}`, {
        headers: authHeaders,
        credentials: "include",
      });

      if (!response.ok) {
        setExpandedError(`Failed to load screenshot (${response.status})`);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setExpandedUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return url;
      });
    } catch (err) {
      console.error("Failed to load expanded screenshot", err);
      setExpandedError("Unable to load screenshot.");
    } finally {
      setExpandedLoading(false);
    }
  }, [authHeaders, apiBase]);

  const closeExpanded = useCallback(() => {
    setIsAutoPlaying(false);
    setExpandedScreenshotId(null);
    setExpandedError("");
    setExpandedLoading(false);
    setExpandedUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return null;
    });
  }, []);

  const showPreviousScreenshot = useCallback(() => {
    if (!hasPreviousScreenshot) return;
    void openScreenshot(screenshots[expandedIndex - 1]);
  }, [expandedIndex, hasPreviousScreenshot, openScreenshot, screenshots]);

  const showNextScreenshot = useCallback(() => {
    if (!hasNextScreenshot) return;
    void openScreenshot(screenshots[expandedIndex + 1]);
  }, [expandedIndex, hasNextScreenshot, openScreenshot, screenshots]);

  const showNextAutoScreenshot = useCallback(() => {
    if (expandedIndex < 0 || screenshots.length < 2) return;
    const nextIndex = expandedIndex === screenshots.length - 1 ? 0 : expandedIndex + 1;
    void openScreenshot(screenshots[nextIndex]);
  }, [expandedIndex, openScreenshot, screenshots]);

  useEffect(() => {
    if (!expandedScreenshotId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeExpanded();
      if (event.key === "ArrowLeft") showPreviousScreenshot();
      if (event.key === "ArrowRight") showNextScreenshot();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeExpanded, expandedScreenshotId, showNextScreenshot, showPreviousScreenshot]);

  useEffect(() => {
    if (!isAutoPlaying || !expandedScreenshotId || expandedLoading || screenshots.length < 2) return;

    const timer = window.setInterval(showNextAutoScreenshot, 1600);
    return () => window.clearInterval(timer);
  }, [expandedLoading, expandedScreenshotId, isAutoPlaying, screenshots.length, showNextAutoScreenshot]);

  useEffect(() => {
    if (screenshots.length < 2 || !expandedScreenshotId) {
      setIsAutoPlaying(false);
    }
  }, [expandedScreenshotId, screenshots.length]);

  useEffect(() => {
    return () => {
      setExpandedUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return null;
      });
    };
  }, []);

  return (
    <div className="space-y-5">
      <header>
        <div>
          <h1 className="text-[18px] font-semibold leading-tight text-[#171717]">Screenshots</h1>
          <p className="mt-1 text-[13px] text-[#7E6F65]">{screenshots.length} captured in selected range</p>
        </div>
      </header>

      <section className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="shrink-0">
          <DashboardDateFilter />
        </div>

        <ThemedSelect
          label="Teams"
          value={teamFilter}
          minWidth={180}
          onChange={(nextValue) => {
            setTeamFilter(nextValue);
            setEmployeeFilter("all");
            setPage(1);
          }}
          options={[{ label: "All Teams", value: "all" }, ...teams.map((team) => ({ label: team.name, value: team.id }))]}
        />

        <ThemedSelect
          label="Employees"
          value={employeeFilter}
          minWidth={200}
          onChange={(nextValue) => {
            setEmployeeFilter(nextValue);
            setPage(1);
          }}
          options={[
            { label: "All Employees", value: "all" },
            ...selectedTeamEmployees.map((employee) => ({ label: employee.fullName, value: employee.id })),
          ]}
        />
      </section>

      <div className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EFE8E2] px-5 py-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-brand" />
            <h3 className="text-[13px] font-medium text-[#171717]">Recent Screenshots</h3>
          </div>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-6 rounded-xl bg-red-50 p-4 text-[13px] text-red-800 flex items-center shadow-sm">
              <AlertCircle className="w-4 h-4 mr-3 text-red-500" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-[11px] font-medium uppercase tracking-widest text-[#B4AAA2]">Loading screenshots...</div>
          ) : screenshots.length === 0 && !error ? (
            <div className="text-center py-16 flex flex-col items-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1ECE7]">
                <ImageIcon className="h-6 w-6 text-[#B4AAA2]" />
              </div>
              <p className="text-[13px] text-[#7E6F65]">No screenshots match these filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {screenshots.map((screenshot) => (
                <ScreenshotCard key={screenshot.id} screenshot={screenshot} onExpand={(item) => void openScreenshot(item)} />
              ))}
            </div>
          )}

          {!loading && screenshots.length > 0 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-[#DDD2C9] px-4 py-2 text-[13px] font-medium text-[#171717] transition hover:bg-[#F1ECE7] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="rounded-lg bg-[#F1ECE7] px-4 py-2 text-[13px] font-medium text-[#7E6F65]">
                Page {page}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="flex items-center gap-1 rounded-lg border border-[#DDD2C9] px-4 py-2 text-[13px] font-medium text-[#171717] transition hover:bg-[#F1ECE7] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {expandedScreenshotId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-6"
          onClick={closeExpanded}
        >
          <button
            onClick={(event) => {
              event.stopPropagation();
              showPreviousScreenshot();
            }}
            disabled={!hasPreviousScreenshot}
            className="absolute left-4 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-white/90 text-[#302C28] shadow-lg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Previous screenshot"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              showNextScreenshot();
            }}
            disabled={!hasNextScreenshot}
            className="absolute right-4 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-white/90 text-[#302C28] shadow-lg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Next screenshot"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              setIsAutoPlaying((current) => !current);
            }}
            disabled={screenshots.length < 2}
            className={`absolute right-4 top-[calc(50%+3.25rem)] z-10 grid h-11 w-11 place-items-center rounded-full border shadow-lg transition disabled:cursor-not-allowed disabled:opacity-35 ${
              isAutoPlaying
                ? "border-emerald-300/50 bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                : "border-white/10 bg-slate-950/85 text-emerald-300 hover:bg-slate-900"
            }`}
            aria-label={isAutoPlaying ? "Pause automatic screenshot navigation" : "Play automatic screenshot navigation"}
            title={isAutoPlaying ? "Pause auto navigation" : "Play auto navigation"}
          >
            {isAutoPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              closeExpanded();
            }}
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-[#302C28] shadow-lg transition hover:bg-white"
            aria-label="Close screenshot viewer"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[12px] font-medium text-[#302C28] shadow-lg">
            {expandedIndex + 1} / {screenshots.length}
          </div>

          <div className="max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
            {expandedLoading ? (
              <div className="grid h-[60vh] w-[70vw] place-items-center rounded-md bg-slate-900 text-[12px] font-medium uppercase tracking-widest text-slate-300">
                Loading screenshot...
              </div>
            ) : expandedError ? (
              <div className="grid h-[60vh] w-[70vw] place-items-center rounded-md bg-slate-900 px-6 text-center text-[13px] text-red-200">
                {expandedError}
              </div>
            ) : expandedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={expandedUrl} alt="Expanded screenshot" className="max-h-[calc(100vh-3rem)] max-w-[calc(100vw-7rem)] rounded-md bg-slate-900 object-contain" />
            ) : null}
          </div>

          {expandedScreenshot && (
            <div className="absolute bottom-4 left-1/2 z-10 w-[min(780px,calc(100vw-8rem))] -translate-x-1/2 rounded-lg bg-white/95 px-4 py-3 text-[12px] font-medium text-[#302C28] shadow-lg">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>{expandedScreenshot.employeeName || "Employee"}</span>
                <span>{new Date(expandedScreenshot.capturedAt).toLocaleString()}</span>
                <span>{friendlyAppName(expandedScreenshot.activeApplication)}</span>
              </div>
              <div className="mt-2 space-y-1 text-[#6F625A]">
                {trackedUrlLabel(expandedScreenshot) ? (
                  <p className="truncate" title={expandedScreenshot.url}>
                    URL: {trackedUrlLabel(expandedScreenshot)}
                  </p>
                ) : cleanDomain(expandedScreenshot.domain) ? (
                  <p className="truncate" title={expandedScreenshot.domain}>
                    Domain: {cleanDomain(expandedScreenshot.domain)}
                  </p>
                ) : null}
                {trackedWindowLabel(expandedScreenshot) ? (
                  <p className="truncate" title={trackedWindowLabel(expandedScreenshot)}>
                    Window: {trackedWindowLabel(expandedScreenshot)}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
