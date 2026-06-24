"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Calendar, Clock, Download, HardDrive, Pause, Play, Search,
  Trash2, User, Video, PlayIcon, ChevronDown, X,
} from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import DashboardDateFilter from "../../../components/DashboardDateFilter";
import ThemedSelect, { type ThemedSelectOption } from "../../../components/ThemedSelect";

// ── Types ──────────────────────────────────────────────────────────────────

type ManualRecording = {
  id: string;
  employeeId: string;
  fileSize: number;
  durationMs: number;
  recordedAt: string;
};

type RecordingSession = {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeEmail?: string;
  startedAt: string;
  stoppedAt?: string;
  fps: number;
  width: number;
  height: number;
  codec: string;
  status: "recording" | "uploading" | "complete" | "failed" | "expired";
  totalSize: number;
  durationMs: number;
  chunkCount?: number;
};

type RecordingChunk = {
  id: string;
  chunkIndex: number;
  fileSize?: number;
  durationMs: number;
  playbackUrl: string;
  uploadedAt?: string;
};

type Playlist = {
  session: RecordingSession;
  chunks: RecordingChunk[];
};

// Merge-playlist for "Play Full Day" — flatten chunks across all sessions
type FullDayPlaylist = {
  chunks: (RecordingChunk & { sessionId: string; employeeName?: string; startedAt: string })[];
  employeeName: string;
  dateLabel: string;
  startFromMs?: number;
};

type Employee = {
  id: string;
  fullName: string;
  email: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const formatDuration = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const getSessionHealth = (session: RecordingSession): {
  label: string;
  className: string;
  message?: string;
} => {
  const chunkCount = session.chunkCount || 0;
  if (chunkCount === 0) return { label: "No data", className: "bg-rose-50 text-rose-700", message: "" };
  const avgChunkSize = Number(session.totalSize || 0) / chunkCount;
  if (avgChunkSize < 25 * 1024) return { label: "Empty / black", className: "bg-rose-50 text-rose-700", message: "" };
  if (avgChunkSize < 120 * 1024) return { label: "Low quality", className: "bg-amber-50 text-amber-700", message: "" };
  return { label: "Healthy", className: "bg-[#EEF9F3] text-[#21845D]" };
};

const formatDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const formatTime = (dateStr: string): string =>
  new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

const formatHour = (dateStr: string): string =>
  new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });

// ── Player ─────────────────────────────────────────────────────────────────

function FullDayPlayer({
  playlist,
  apiBase,
  authHeaders,
  employeeId,
  onClose,
}: {
  playlist: FullDayPlaylist;
  apiBase: string;
  authHeaders: Record<string, string> | null;
  employeeId?: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const chunks = playlist.chunks;

  const { totalMs, cumulMs } = useMemo(() => {
    let total = 0;
    const acc: number[] = [];
    chunks.forEach((c, i) => {
      acc[i] = total;
      total += c.durationMs || 0;
    });
    return { totalMs: total, cumulMs: acc };
  }, [chunks]);

  const [chunkIndex, setChunkIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [chunkUrl, setChunkUrl] = useState("");
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [playerMessage, setPlayerMessage] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [globalMs, setGlobalMs] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [activitySegments, setActivitySegments] = useState<{ start: Date; end: Date; kind: "active" | "idle" }[]>([]);

  const current = chunks[chunkIndex];

  // Reset on playlist change
  useEffect(() => {
    let idx = 0;
    const startFromMs = playlist.startFromMs ?? 0;
    for (let i = 0; i < chunks.length; i++) {
      idx = i;
      if (cumulMs[i] + (chunks[i].durationMs || 0) > startFromMs) break;
    }
    setChunkIndex(idx);
    setChunkUrl("");
    setLoadState("idle");
    setPlayerMessage("");
    setGlobalMs(startFromMs);
  }, [playlist, chunks, cumulMs]);

  // Load current chunk blob
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    const loadChunk = async () => {
      if (!current || !authHeaders) {
        setChunkUrl("");
        setLoadState("idle");
        return;
      }
      setLoadState("loading");
      setPlayerMessage("");

      try {
        const response = await fetch(`${apiBase}${current.playbackUrl}`, {
          headers: authHeaders,
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Chunk ${chunkIndex + 1} failed (${response.status})`);
        const blob = await response.blob();
        if (!blob.size) throw new Error(`Chunk ${chunkIndex + 1} is empty`);
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) { URL.revokeObjectURL(objectUrl); return; }
        setChunkUrl(objectUrl);
        setLoadState("ready");
      } catch (err) {
        if (cancelled) return;
        setChunkUrl("");
        setLoadState("error");
        setPlayerMessage(err instanceof Error ? err.message : "Unable to load chunk");
      }
    };

    void loadChunk();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiBase, authHeaders, current, chunkIndex, reloadNonce]);

  // Apply playback speed whenever it changes
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || loadState !== "ready" || chunkIndex < 0 || chunkIndex >= chunks.length) return;
    const ms = cumulMs[chunkIndex] + video.currentTime * 1000;
    setGlobalMs(Math.min(ms, totalMs));
  }, [chunkIndex, chunks.length, cumulMs, loadState, totalMs]);

  const handleEnded = useCallback(() => {
    if (chunkIndex < chunks.length - 1) {
      const nextIdx = chunkIndex + 1;
      setChunkIndex(nextIdx);
      setGlobalMs(cumulMs[nextIdx]);
    }
  }, [chunkIndex, chunks.length, cumulMs]);

  const handleVideoError = () => {
    // Ignore errors while a new chunk is loading; they usually come from the previous revoked blob URL.
    if (loadState !== "ready") return;
    setLoadState("error");
    setPlayerMessage(`Can't play chunk ${chunkIndex + 1}. Press Retry or skip.`);
  };

  const seekToPercent = useCallback(
    (percent: number) => {
      if (!totalMs) return;
      const targetMs = Math.max(0, Math.min(totalMs, (percent / 100) * totalMs));
      let idx = 0;
      for (let i = 0; i < chunks.length; i++) {
        idx = i;
        if (cumulMs[i] + (chunks[i].durationMs || 0) > targetMs) break;
      }
      setChunkIndex(idx);
      setGlobalMs(targetMs);
      const video = videoRef.current;
      if (video && loadState === "ready" && idx === chunkIndex) {
        video.currentTime = Math.max(0, targetMs - cumulMs[idx]) / 1000;
        void video.play().catch(() => {});
      }
    },
    [chunks, cumulMs, totalMs, loadState, chunkIndex],
  );

  const goToChunk = useCallback(
    (index: number) => {
      const idx = Math.max(0, Math.min(index, chunks.length - 1));
      setChunkIndex(idx);
      setGlobalMs(cumulMs[idx]);
    },
    [chunks.length, cumulMs],
  );

  // Fetch activity segments for timeline overlay
  useEffect(() => {
    if (!employeeId || !authHeaders || !chunks.length || !chunks[0]?.startedAt) return;
    const date = chunks[0].startedAt.slice(0, 10);
    const start = `${date}T00:00:00Z`;
    const end = `${date}T23:59:59Z`;

    fetch(`${apiBase}/api/web/dashboard/activity-timeline?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`, {
      headers: authHeaders,
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return;
        const emp = data.data?.employees?.find((e: any) => e.userId === employeeId);
        if (emp?.segments) {
          setActivitySegments(
            emp.segments.map((s: any) => ({
              start: new Date(s.start),
              end: new Date(s.end),
              kind: s.kind as "active" | "idle",
            })),
          );
        }
      })
      .catch(() => {});
  }, [employeeId, authHeaders, apiBase, chunks]);

  const progress = totalMs ? (globalMs / totalMs) * 100 : 0;
  const startTime = chunks[0]?.startedAt;
  const endTime = chunks[chunks.length - 1]?.startedAt;

  const timelineCtx = useMemo(() => {
    if (!chunks.length || !chunks[0]?.startedAt) return null;
    const dayStart = new Date(chunks[0].startedAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    return chunks.map((chunk) => {
      const t = new Date(chunk.startedAt).getTime();
      const left = ((t - dayStart.getTime()) / dayMs) * 100;
      const w = Math.max(0.3, ((chunk.durationMs || 0) / dayMs) * 100);
      return { left, width: w };
    });
  }, [chunks]);

  const playheadLeft = useMemo(() => {
    if (!chunks.length || !chunks[0]?.startedAt || !totalMs) return 0;
    const dayStart = new Date(chunks[0].startedAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const currentTime = new Date(chunks[chunkIndex].startedAt).getTime() + (globalMs - cumulMs[chunkIndex]);
    return ((currentTime - dayStart.getTime()) / dayMs) * 100;
  }, [chunks, chunkIndex, cumulMs, globalMs, totalMs]);

  const timeRangeText = `${formatDuration(globalMs)} / ${formatDuration(totalMs)}`;

  return (
    <div className="rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFE8E2] px-5 py-3">
        <div>
          <h3 className="text-[13px] font-semibold text-[#302C28]">{playlist.employeeName}</h3>
          <p className="mt-0.5 text-[11px] font-medium text-[#8C837B]">
            {playlist.dateLabel} · {startTime ? formatTime(startTime) : ""} → {endTime ? formatTime(endTime) : ""} · {formatDuration(totalMs)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[12px] font-semibold text-[#7E6F65] transition-colors hover:text-brand"
        >
          Close Player
        </button>
      </div>

      {/* Timeline Bar */}
      {timelineCtx && (
        <div className="relative h-10 border-b border-[#EFE8E2] bg-[#F9F6F3] px-5">
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
            <span
              key={h}
              className="absolute top-1 text-[9px] font-medium text-[#BDB6AE]"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {h === 0 ? "12A" : h === 12 ? "12P" : h > 12 ? `${h - 12}P` : `${h}A`}
            </span>
          ))}
          <div className="absolute bottom-0 left-0 right-0 top-5">
            {/* Activity layer */}
            {activitySegments.length > 0 && (() => {
              const dayMs = 24 * 60 * 60 * 1000;
              return activitySegments.map((act, i) => {
                const dayStart = new Date(chunks[0].startedAt);
                dayStart.setHours(0, 0, 0, 0);
                const dayStartMs = dayStart.getTime();
                const left = ((act.start.getTime() - dayStartMs) / dayMs) * 100;
                const width = Math.max(0.3, ((act.end.getTime() - act.start.getTime()) / dayMs) * 100);
                return (
                  <div
                    key={i}
                    className={`absolute bottom-0 top-0 rounded-sm ${act.kind === "active" ? "bg-brand/20" : "bg-[#F8B84E]/20"}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={act.kind === "active" ? "Active" : "Idle"}
                  />
                );
              });
            })()}
            {/* Continuous recording bar */}
            {timelineCtx && (() => {
              const start = timelineCtx[0].left;
              const endSeg = timelineCtx[timelineCtx.length - 1];
              const width = Math.max(0.3, endSeg.left + endSeg.width - start);
              return (
                <div
                  className="absolute bottom-0 top-0 cursor-pointer rounded-sm bg-brand/40 hover:bg-brand/60"
                  style={{ left: `${start}%`, width: `${width}%` }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    seekToPercent((start + pct * width) / 100 * 100);
                  }}
                  title={`Recording ${formatHour(startTime || "")} → ${formatHour(endTime || "")}`}
                />
              );
            })()}
            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-0 h-full w-0.5 bg-white shadow-[0_0_0_1px_#FD815C]"
              style={{ left: `${playheadLeft}%` }}
            />
          </div>
          <div className="absolute -bottom-4 left-5 flex items-center gap-3 text-[9px] font-medium text-[#BDB6AE]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand/20" /> Active</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#F8B84E]/20" /> Idle</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand/60" /> Recording</span>
          </div>
        </div>
      )}

      {/* Video Area */}
      <div className="relative aspect-video w-full bg-[#171717]">
        {current && chunkUrl ? (
          <video
            ref={videoRef}
            src={chunkUrl}
            autoPlay
            muted
            playsInline
            preload="auto"
            className="h-full w-full object-contain"
            onLoadedMetadata={() => {
              setLoadState("ready");
              const video = videoRef.current;
              if (video) {
                video.playbackRate = speed;
                const offsetMs = Math.max(0, globalMs - cumulMs[chunkIndex]);
                if (offsetMs > 0) video.currentTime = offsetMs / 1000;
                void video.play().catch(() => {});
              }
            }}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onError={handleVideoError}
            onPlay={() => setIsPaused(false)}
            onPause={() => setIsPaused(true)}
            onWaiting={() => setIsPaused(false)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] font-medium text-white/70">
            {current ? (loadState === "error" ? playerMessage || "Can't play this chunk" : "Loading...") : "No chunks yet"}
          </div>
        )}
        {current ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
            {formatHour(new Date(new Date(current.startedAt).getTime() + (globalMs - cumulMs[chunkIndex])).toISOString())}
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div className="space-y-3 border-t border-[#EFE8E2] px-5 py-3">
        {/* Continuous scrubber with hover preview */}
        <Scrubber progress={progress} totalMs={totalMs} onSeek={seekToPercent} timeRangeText={timeRangeText} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) { void video.play().catch(() => {}); } else { video.pause(); }
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white shadow-sm"
            >
              {isPaused ? <PlayIcon className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            {loadState === "error" ? (
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                className="rounded-lg border border-[#E1D7CE] px-3 py-1.5 text-[12px] font-semibold text-[#302C28]"
              >
                Retry
              </button>
            ) : null}
            <span className="text-[11px] font-medium text-[#8C837B]">
              {formatDuration(totalMs)} playback
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-[#E1D7CE] bg-[#F9F6F3] p-1">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSpeed(v)}
                className={`rounded-md px-3 py-1 text-[12px] font-bold ${
                  speed === v ? "bg-brand text-white shadow-sm" : "bg-transparent text-[#5E564E] hover:bg-[#F1ECE7]"
                }`}
              >
                {v}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Scrubber({
  progress,
  totalMs,
  onSeek,
  timeRangeText,
}: {
  progress: number;
  totalMs: number;
  onSeek: (percent: number) => void;
  timeRangeText: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ percent: number; x: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const percentFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  }, []);

  const handleMove = useCallback((e: React.MouseEvent) => {
    setHover({ percent: percentFromEvent(e), x: e.clientX });
    if (dragging) onSeek(percentFromEvent(e));
  }, [dragging, onSeek, percentFromEvent]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    onSeek(percentFromEvent(e));
  }, [onSeek, percentFromEvent]);

  const stopDrag = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => onSeek(percentFromEvent(e));
    const up = () => setDragging(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging, onSeek, percentFromEvent]);

  const hoverTime = hover && totalMs ? formatDuration((hover.percent / 100) * totalMs) : "";

  return (
    <div className="flex items-center gap-3">
      <div
        ref={trackRef}
        className="group relative h-3 flex-1 cursor-pointer rounded-full bg-[#E7E0DA]"
        onMouseMove={handleMove}
        onMouseLeave={() => { setHover(null); if (dragging) setDragging(false); }}
        onMouseDown={startDrag}
        onMouseUp={stopDrag}
      >
        {/* Progress fill */}
        <div
          className="pointer-events-none absolute left-0 top-0 h-full rounded-full bg-brand"
          style={{ width: `${progress}%` }}
        />
        {/* Hover line */}
        {hover && !dragging ? (
          <div
            className="pointer-events-none absolute top-0 h-full w-0.5 bg-[#302C28]"
            style={{ left: `${hover.percent}%` }}
          />
        ) : null}
        {/* Hover time tooltip */}
        {hover ? (
          <div
            className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 rounded-md bg-[#302C28] px-2 py-1 text-[11px] font-semibold text-white shadow-sm"
            style={{ left: `${hover.percent}%` }}
          >
            {hoverTime}
          </div>
        ) : null}
        {/* Thumb */}
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-md"
          style={{ left: `${progress}%`, transform: "translate(-50%, -50%)" }}
        />
      </div>
      <span className="min-w-[110px] text-right text-[11px] font-semibold text-[#302C28]">{timeRangeText}</span>
    </div>
  );
}

export default function RecordingsPage() {
  const { authHeaders, apiBase, user, dateRange, setDateRange } = useAuth();
  const [tab, setTab] = useState<"auto" | "manual">("auto");
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [manualRecordings, setManualRecordings] = useState<ManualRecording[]>([]);
  const [teamUsers, setTeamUsers] = useState<Employee[]>([]);
  const [playlist, setPlaylist] = useState<FullDayPlaylist | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [playingDay, setPlayingDay] = useState(false);
  const [startHour, setStartHour] = useState<number>(0);
  const [endHour, setEndHour] = useState<number>(24);

  const isManager = user?.role === "MANAGER";

  // Fetch team users for employee dropdown
  useEffect(() => {
    if (!authHeaders || !isManager) return;
    fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (d.success) setTeamUsers(d.data); })
      .catch(() => {});
  }, [authHeaders, apiBase, isManager]);

  // Build employee options for ThemedSelect
  const employeeOptions: ThemedSelectOption[] = useMemo(
    () => [{ label: "All Employees", value: "" }, ...teamUsers.map((u) => ({ label: u.fullName || u.email, value: u.id }))],
    [teamUsers],
  );

  // Hour options for time range filter
  const hourOptions: ThemedSelectOption[] = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => ({
      label: i === 0 ? "12 AM" : i === 12 ? "12 PM" : i > 12 ? `${i - 12} PM` : `${i} AM`,
      value: String(i),
    })),
    [],
  );

  // Fetch recordings data
  const fetchData = useCallback(async () => {
    if (!authHeaders) return;
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams();
      if (user?.role !== "MANAGER" && user?.id) params.set("employeeId", user.id);
      if (selectedEmployeeId) params.set("employeeId", selectedEmployeeId);
      const q = params.toString();
      const [sr, mr] = await Promise.all([
        fetch(`${apiBase}/api/web/recording-sessions${q ? `?${q}` : ""}`, { headers: authHeaders, credentials: "include" }),
        fetch(`${apiBase}/api/web/recordings${q ? `?${q}` : ""}`, { headers: authHeaders, credentials: "include" }),
      ]);
      const [sp, mp] = await Promise.all([sr.json(), mr.json()]);
      if (!sr.ok || !sp.success) throw new Error(sp.message || "Failed to load sessions");
      if (!mr.ok || !mp.success) throw new Error(mp.message || "Failed to load recordings");
      setSessions(sp.data || []);
      setManualRecordings(mp.data || []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "API error");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, apiBase, user?.id, user?.role, selectedEmployeeId]);

  // Refresh when employee or auth changes
  useEffect(() => { void fetchData(); }, [fetchData]);

  // Read URL params for cross-navigation from activities tab
  const searchParams = useSearchParams();
  const urlEmployeeId = searchParams.get("employeeId");
  const urlDate = searchParams.get("date");
  const urlStartTime = searchParams.get("startTime");
  const urlEndTime = searchParams.get("endTime");

  // Apply URL params when teamUsers are loaded
  const [urlApplied, setUrlApplied] = useState(false);
  useEffect(() => {
    if (!urlEmployeeId || urlApplied || teamUsers.length === 0) return;
    setSelectedEmployeeId(urlEmployeeId);
    setUrlApplied(true);

    // Parse and set time range from URL
    if (urlStartTime) {
      const sh = new Date(urlStartTime).getHours();
      setStartHour(sh);
    }
    if (urlEndTime) {
      const eh = new Date(urlEndTime).getHours();
      const em = new Date(urlEndTime).getMinutes();
      setEndHour(em > 0 ? eh + 1 : eh); // round up if past the hour
    }

    // Set date filter
    if (urlDate) {
      const d = new Date(urlDate);
      setDateRange({ startDate: d, endDate: d, label: "custom" });
    }
  }, [urlEmployeeId, urlApplied, teamUsers, urlStartTime, urlEndTime, urlDate, setDateRange]);

  // Auto-play after sessions load when URL params are applied
  useEffect(() => {
    if (!urlApplied || !urlEmployeeId || sessions.length === 0) return;
    // Wait a tick for filteredSessions to compute, then play
    const timer = setTimeout(() => playFullDay(), 500);
    return () => clearTimeout(timer);
  }, [urlApplied, urlEmployeeId, sessions.length]);

  const getEmployeeName = useCallback(
    (employeeId: string): string => {
      const u = teamUsers.find((t) => t.id === employeeId);
      return u?.fullName || u?.email || employeeId.slice(0, 8);
    },
    [teamUsers],
  );

  const isWithinDateRange = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr);
      const from = dateRange?.startDate ? new Date(dateRange.startDate) : null;
      const to = dateRange?.endDate ? new Date(dateRange.endDate) : null;
      if (from) { from.setHours(0, 0, 0, 0); if (date < from) return false; }
      if (to) { to.setHours(23, 59, 59, 999); if (date > to) return false; }
      return true;
    },
    [dateRange?.startDate, dateRange?.endDate],
  );

  // Filter sessions: exclude "No data" + date range + employee filter + search
  const filteredSessions = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = sessions.filter((s) => getSessionHealth(s).label !== "No data");
    return filtered.filter((session) => {
      const name = (session.employeeName || session.employeeEmail || getEmployeeName(session.employeeId)).toLowerCase();
      const matchesSearch = !query || name.includes(query) || formatDate(session.startedAt).toLowerCase().includes(query);
      return matchesSearch && isWithinDateRange(session.startedAt);
    });
  }, [getEmployeeName, isWithinDateRange, searchQuery, sessions]);

  const filteredManual = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return manualRecordings.filter((r) => {
      const name = getEmployeeName(r.employeeId).toLowerCase();
      const matchesSearch = !query || name.includes(query) || formatDate(r.recordedAt).toLowerCase().includes(query);
      return matchesSearch && isWithinDateRange(r.recordedAt);
    });
  }, [getEmployeeName, isWithinDateRange, manualRecordings, searchQuery]);

  // Build employee cards grouped by employee for "Play Full Day"
  const employeeCards = useMemo(() => {
    if (!selectedEmployeeId) return []; // only show cards when a specific employee is selected
    const empSessions = filteredSessions.filter((s) => s.employeeId === selectedEmployeeId);
    if (!empSessions.length) return [];

    const totalDuration = empSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
    const totalChunks = empSessions.reduce((sum, s) => sum + (s.chunkCount || 0), 0);
    const start = empSessions.reduce((earliest, s) =>
      s.startedAt < earliest ? s.startedAt : earliest, empSessions[0]?.startedAt || "");
    const end = empSessions.reduce((latest, s) =>
      s.startedAt > latest ? s.startedAt : latest, empSessions[0]?.startedAt || "");

    return [{
      employeeId: selectedEmployeeId,
      employeeName: getEmployeeName(selectedEmployeeId),
      sessionCount: empSessions.length,
      totalDuration,
      totalChunks,
      timeStart: start,
      timeEnd: end,
    }];
  }, [filteredSessions, selectedEmployeeId, getEmployeeName]);

  // Play Full Day: fetch all chunks for all sessions of selected employee + date
  const playFullDay = useCallback(async () => {
    if (!authHeaders || !selectedEmployeeId) return;
    setPlayingDay(true);
    try {
      const empSessions = filteredSessions.filter((s) => s.employeeId === selectedEmployeeId);
      const allChunks: FullDayPlaylist["chunks"] = [];

      for (const s of empSessions) {
        const res = await fetch(`${apiBase}/api/web/recording-sessions/${s.id}/playlist`, {
          headers: authHeaders,
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok && data.success && data.data?.chunks) {
          for (const c of data.data.chunks) {
            allChunks.push({
              ...c,
              sessionId: s.id,
              employeeName: s.employeeName || getEmployeeName(s.employeeId),
              startedAt: c.uploadedAt || s.startedAt,
            });
          }
        }
      }

      allChunks.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

      // Filter by selected time range (startHour to endHour)
      const filteredChunks = allChunks.filter((c) => {
        const h = new Date(c.startedAt).getHours();
        return h >= startHour && h < endHour;
      });

      const dateLabel = empSessions.length
        ? `${formatDate(empSessions[0]?.startedAt || "")}`
        : "Today";

      setPlaylist({
        chunks: filteredChunks,
        employeeName: getEmployeeName(selectedEmployeeId),
        dateLabel,
      });
      setTab("auto");
    } catch (err) {
      console.error("Failed to build full day playlist", err);
    } finally {
      setPlayingDay(false);
    }
  }, [authHeaders, apiBase, filteredSessions, selectedEmployeeId, getEmployeeName]);

  // Play single session (keep existing behavior but convert to FullDayPlaylist for same player)
  const playSession = async (session: RecordingSession, startPercent?: number) => {
    if (!authHeaders) return;
    try {
      const res = await fetch(`${apiBase}/api/web/recording-sessions/${session.id}/playlist`, {
        headers: authHeaders,
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const chunks = (data.data?.chunks || []).map((c: RecordingChunk) => ({
          ...c,
          sessionId: session.id,
          employeeName: session.employeeName || getEmployeeName(session.employeeId),
          startedAt: c.uploadedAt || session.startedAt,
        }));
        chunks.sort((a: any, b: any) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
        const startFromMs = startPercent && session.durationMs ? Math.max(0, Math.min(session.durationMs, startPercent * session.durationMs)) : undefined;
        setPlaylist({
          chunks,
          employeeName: session.employeeName || getEmployeeName(session.employeeId),
          dateLabel: formatDate(session.startedAt),
          startFromMs,
        });
        setTab("auto");
      }
    } catch (err) {
      console.error("Failed to play session", err);
    }
  };

  const handleManualDelete = async (id: string) => {
    if (!authHeaders) return;
    const r = await fetch(`${apiBase}/api/web/recordings/${id}`, {
      method: "DELETE",
      headers: authHeaders,
      credentials: "include",
    });
    if (r.ok) {
      setManualRecordings((prev) => prev.filter((rec) => rec.id !== id));
      setDeleteConfirmId(null);
    }
  };

  const totalAutoSize = sessions.reduce((sum, s) => sum + Number(s.totalSize || 0), 0);
  const totalAutoDuration = sessions.reduce((sum, s) => sum + Number(s.durationMs || 0), 0);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#FDEBE5] border-t-brand" />
          <p className="text-[12px] font-medium uppercase tracking-widest text-[#B4AAA2]">Loading recordings...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-[18px] font-semibold leading-tight text-[#302C28]">Screen Recordings</h1>
          <DashboardDateFilter />
        </div>
        <div className="flex items-center gap-3">
          {isManager && (
            <ThemedSelect
              label="Select Employee"
              value={selectedEmployeeId}
              options={employeeOptions}
              onChange={setSelectedEmployeeId}
              minWidth={190}
            />
          )}
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#8C837B]">
            <span>From</span>
            <ThemedSelect
              label="Start"
              value={String(startHour)}
              options={hourOptions}
              onChange={(v) => setStartHour(Number(v))}
              minWidth={100}
              icon={false}
            />
            <span>to</span>
            <ThemedSelect
              label="End"
              value={String(endHour)}
              options={hourOptions}
              onChange={(v) => setEndHour(Number(v))}
              minWidth={100}
              icon={false}
            />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C837B]" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-56 rounded-xl border border-[#E1D7CE] bg-white pl-10 pr-4 text-[13px] font-medium text-[#302C28] outline-none transition placeholder:text-[#8C837B] focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
          {loadError}
        </div>
      ) : null}

      {/* Tab Switch */}
      <div className="flex w-fit rounded-xl border border-[#DDD2C9] bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("auto")}
          className={`rounded-lg px-4 py-2 text-[12px] font-semibold ${
            tab === "auto" ? "bg-[#302C28] text-white" : "text-[#7E6F65]"
          }`}
        >
          Screen Recordings
        </button>
        <button
          type="button"
          onClick={() => setTab("manual")}
          className={`rounded-lg px-4 py-2 text-[12px] font-semibold ${
            tab === "manual" ? "bg-[#302C28] text-white" : "text-[#7E6F65]"
          }`}
        >
          Live View
        </button>
      </div>

      {tab === "auto" ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat icon={Video} label="Recordings" value={String(filteredSessions.length)} />
            <Stat icon={Clock} label="Total Duration" value={formatDuration(totalAutoDuration)} />
            <Stat icon={HardDrive} label="Total Size" value={formatFileSize(totalAutoSize)} />
          </div>

          {/* Employee Cards for selected employee */}
          {selectedEmployeeId && !playlist && employeeCards.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
              {employeeCards.map((card) => {
                // Build timeline segments for this employee
                const empSessions = filteredSessions.filter((s) => s.employeeId === selectedEmployeeId);
                const timelineSegments = empSessions.map((s) => ({
                  start: new Date(s.startedAt).getHours() + new Date(s.startedAt).getMinutes() / 60,
                  duration: (s.durationMs || 0) / 3600000, // hours
                  chunks: s.chunkCount || 0,
                }));

                return (
                  <div key={card.employeeId}>
                    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FDEBE5]">
                          <User className="h-5 w-5 text-brand" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-[#302C28]">{card.employeeName}</p>
                          <p className="text-[11px] font-medium text-[#8C837B]">
                            {card.sessionCount} sessions · {card.totalChunks} clips · {formatDuration(card.totalDuration)}
                          </p>
                          <p className="text-[11px] font-medium text-[#B4AAA2]">
                            {card.timeStart ? `${formatTime(card.timeStart)} → ${formatTime(card.timeEnd)}` : ""}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={playFullDay}
                        disabled={playingDay}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-60"
                      >
                        <Play className="h-4 w-4" />
                        {playingDay ? "Loading..." : "Play Full Day"}
                      </button>
                    </div>

                    {/* Activity Timeline Bar */}
                    <div className="border-t border-[#EFE8E2] px-5 pb-4 pt-3">
                      <div className="relative h-8">
                        {/* Hour markers background */}
                        <div className="absolute inset-0 rounded-md bg-[#F9F6F3]" />
                        {/* Hour grid lines */}
                        {Array.from({ length: 25 }, (_, h) => (
                          <div
                            key={h}
                            className="absolute top-0 h-full border-l border-[#E7DED6] last:border-r"
                            style={{ left: `${(h / 24) * 100}%` }}
                          />
                        ))}
                        {/* Recording activity segments */}
                        {timelineSegments.map((seg, i) => (
                          <div
                            key={i}
                            className="absolute bottom-1 top-1 rounded-sm bg-brand/50 transition-colors hover:bg-brand/70"
                            style={{
                              left: `${(seg.start / 24) * 100}%`,
                              width: `${Math.max((seg.duration / 24) * 100, 0.5)}%`,
                            }}
                            title={`${Math.round(seg.start)}:00 — ${seg.chunks} clips`}
                          />
                        ))}
                        {/* Selected time range overlay */}
                        <div
                          className="absolute bottom-1 top-1 rounded-sm border-2 border-brand/80 bg-brand/10"
                          style={{
                            left: `${(startHour / 24) * 100}%`,
                            width: `${((endHour - startHour) / 24) * 100}%`,
                          }}
                        />
                        {/* Time labels */}
                        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
                          <span
                            key={h}
                            className="absolute -bottom-5 text-[9px] font-medium text-[#BDB6AE]"
                            style={{ left: `${(h / 24) * 100}%`, transform: 'translateX(-50%)' }}
                          >
                            {h === 0 ? "12A" : h === 12 ? "12P" : h > 12 ? `${h - 12}P` : `${h}A`}
                          </span>
                        ))}
                      </div>
                      <div className="mt-6 flex items-center justify-between text-[11px] text-[#8C837B]">
                        <span>Selected: {hourOptions.find((o) => o.value === String(startHour))?.label} — {hourOptions.find((o) => o.value === String(endHour))?.label}</span>
                        <span className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-sm bg-brand/50" /> Activity
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-sm border-2 border-brand/80 bg-brand/10" /> Selected
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sessions Timeline */}
          {filteredSessions.length === 0 ? (
            <EmptyState text="No screen recordings yet" detail="Agent uploads appear here once chunks are captured." />
          ) : (
            <RecordingTimeline
              sessions={filteredSessions}
              employees={
                teamUsers.length > 0
                  ? teamUsers
                  : user
                    ? [{ id: user.id, fullName: user.fullName || user.email, email: user.email }]
                    : []
              }
              apiBase={apiBase}
              authHeaders={authHeaders}
              getEmployeeName={getEmployeeName}
              onPlay={playSession}
            />
          )}
        </>
      ) : (
        <ManualRecordings
          recordings={filteredManual}
          apiBase={apiBase}
          isManager={isManager}
          getEmployeeName={getEmployeeName}
          deleteConfirmId={deleteConfirmId}
          setDeleteConfirmId={setDeleteConfirmId}
          onDelete={handleManualDelete}
        />
      )}
    </div>

    {playlist ? (
      <RecordingSessionModal
        playlist={playlist}
        sessions={filteredSessions}
        apiBase={apiBase}
        authHeaders={authHeaders}
        onClose={() => setPlaylist(null)}
      />
    ) : null}
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#DDD2C9] bg-white p-4 shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FDEBE5]">
          <Icon className="h-5 w-5 text-brand" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-[#9A9088]">{label}</p>
          <p className="text-[22px] font-semibold leading-none text-[#302C28]">{value}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#DDD2C9] bg-white p-12 text-center shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1ECE7]">
        <Video className="h-6 w-6 text-[#B4AAA2]" />
      </div>
      <h3 className="text-[14px] font-medium text-[#302C28]">{text}</h3>
      <p className="mx-auto mt-2 max-w-sm text-[13px] font-medium text-[#8C837B]">{detail}</p>
    </div>
  );
}

function ManualRecordings({
  recordings,
  apiBase,
  isManager,
  getEmployeeName,
  deleteConfirmId,
  setDeleteConfirmId,
  onDelete,
}: {
  recordings: ManualRecording[];
  apiBase: string;
  isManager: boolean;
  getEmployeeName: (id: string) => string;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  if (recordings.length === 0) {
    return (
      <EmptyState
        text="No live recordings yet"
        detail="Manual live-view recordings appear here after a manager records a live session."
      />
    );
  }

  return (
    <div className="space-y-4">
      {playingId ? (
        <div className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
          <div className="flex items-center justify-between border-b border-[#EFE8E2] px-5 py-3">
            <h3 className="text-[13px] font-medium text-[#302C28]">Now Playing</h3>
            <button
              type="button"
              onClick={() => setPlayingId(null)}
              className="text-[12px] font-medium text-[#7E6F65] transition-colors hover:text-brand"
            >
              Close Player
            </button>
          </div>
          <div className="aspect-video bg-[#171717]">
            <video
              src={`${apiBase}/api/web/recordings/${playingId}/file`}
              controls
              autoPlay
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
        <div className="divide-y divide-[#EFE8E2]">
          {recordings.map((recording) => (
            <div
              key={recording.id}
              className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-[#FCFAF8]"
            >
              <button
                type="button"
                onClick={() => setPlayingId(playingId === recording.id ? null : recording.id)}
                className="group flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#171717] transition-colors hover:bg-[#302C28]"
              >
                <Play className="h-5 w-5 text-white/80 transition-all group-hover:scale-110 group-hover:text-white" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-[#8C837B]" />
                  <span className="truncate text-[13px] font-semibold text-[#302C28]">
                    {getEmployeeName(recording.employeeId)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-[#8C837B]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(recording.recordedAt)}
                  </span>
                  <span>{formatTime(recording.recordedAt)}</span>
                  <span>{formatDuration(recording.durationMs)}</span>
                  <span>{formatFileSize(recording.fileSize)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`${apiBase}/api/web/recordings/${recording.id}/file`}
                  download={`recording-${recording.id}.webm`}
                  className="inline-flex items-center rounded-lg border border-[#E1D7CE] bg-white px-3 py-1.5 text-[12px] font-medium text-[#302C28] shadow-sm transition-colors hover:bg-[#FCFAF8]"
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download
                </a>
                {isManager ? (
                  deleteConfirmId === recording.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onDelete(recording.id)}
                        className="rounded-lg bg-[#DC2626] px-3 py-1.5 text-[12px] font-medium text-white"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded-lg border border-[#E1D7CE] px-3 py-1.5 text-[12px] font-medium text-[#302C28]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(recording.id)}
                      className="rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[#DC2626] transition-colors hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Timeline Recording Feed ────────────────────────────────────────────────

function sessionStatusMeta(session: RecordingSession) {
  const health = getSessionHealth(session);
  if (health.label === "Healthy") return { className: "bg-brand", label: "Healthy", score: 100 };
  if (health.label === "Low quality" || health.label === "Low chunks") return { className: "bg-[#F8B84E]", label: health.label, score: 60 };
  if (health.label === "No data" || health.label === "Empty / black") return { className: "bg-[#DDD2C9]", label: health.label, score: 10 };
  if (session.status === "recording") return { className: "bg-brand", label: "Recording", score: 90 };
  if (session.status === "uploading") return { className: "bg-brand/70", label: "Uploading", score: 80 };
  return { className: "bg-[#A8A29E]", label: health.label, score: 50 };
}

function RecordingTimeline({
  sessions,
  employees,
  apiBase,
  authHeaders,
  getEmployeeName,
  onPlay,
}: {
  sessions: RecordingSession[];
  employees: Employee[];
  apiBase: string;
  authHeaders: Record<string, string> | null;
  getEmployeeName: (id: string) => string;
  onPlay: (session: RecordingSession) => void;
}) {
  const rows = useMemo(() => {
    const map = new Map<string, { employee: Employee; sessions: RecordingSession[] }>();
    employees.forEach((e) => map.set(e.id, { employee: e, sessions: [] }));
    sessions.forEach((s) => {
      let row = map.get(s.employeeId);
      if (!row) {
        const emp: Employee = {
          id: s.employeeId,
          fullName: s.employeeName || s.employeeEmail || getEmployeeName(s.employeeId),
          email: s.employeeEmail || "",
        };
        row = { employee: emp, sessions: [] };
        map.set(s.employeeId, row);
      }
      row.sessions.push(s);
    });
    return Array.from(map.values())
      .filter((r) => r.sessions.length > 0)
      .sort((a, b) => (a.employee.fullName || "").localeCompare(b.employee.fullName || ""));
  }, [sessions, employees, getEmployeeName]);

  return (
    <div className="space-y-6">
      {rows.map((row) => (
        <RecordingTimelineRow
          key={row.employee.id}
          employee={row.employee}
          sessions={row.sessions}
          apiBase={apiBase}
          authHeaders={authHeaders}
          onPlay={onPlay}
        />
      ))}
    </div>
  );
}

function RecordingTimelineRow({
  employee,
  sessions,
  apiBase,
  authHeaders,
  onPlay,
}: {
  employee: Employee;
  sessions: RecordingSession[];
  apiBase: string;
  authHeaders: Record<string, string> | null;
  onPlay: (session: RecordingSession) => void;
}) {
  const initials = employee.fullName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="rounded-2xl border border-[#E1D7CE] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
      <div className="flex items-center gap-3 rounded-t-2xl border-b border-[#EFE8E2] bg-[#FAF8F6] px-5 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FDEBE5] text-sm font-bold text-brand">
          {initials}
        </span>
        <div>
          <p className="text-[14px] font-semibold text-[#302C28]">{employee.fullName}</p>
          <p className="text-[11px] font-medium text-[#8C837B]">
            {sessions.length} session{sessions.length === 1 ? "" : "s"} ·{" "}
            {formatDuration(sessions.reduce((sum, s) => sum + s.durationMs, 0))}
          </p>
        </div>
      </div>
      <div className="px-5 pb-7 pt-5">
        <div className="relative h-12">
          <div className="absolute inset-0 rounded-xl bg-[#F9F6F3]" />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].map((h) => (
            <div
              key={h}
              className="absolute top-0 h-full border-l border-[#E7DED6] last:border-r"
              style={{ left: `${(h / 24) * 100}%` }}
            />
          ))}
          {[...sessions].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()).map((session, idx, arr) => {
            const start = new Date(session.startedAt);
            const startHour = start.getHours() + start.getMinutes() / 60;
            const widthHours = (session.durationMs || 0) / 3600000;
            const meta = sessionStatusMeta(session);
            return (
              <SessionBlock
                key={session.id}
                session={session}
                apiBase={apiBase}
                authHeaders={authHeaders}
                meta={meta}
                startHour={startHour}
                widthHours={Math.max(0.25, widthHours)}
                isFirst={idx === 0}
                isLast={idx === arr.length - 1}
                onPlay={onPlay}
              />
            );
          })}
          {/* Hour labels */}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
            <span
              key={`label-${h}`}
              className="absolute -bottom-6 text-[9px] font-medium text-[#BDB6AE]"
              style={{ left: `${(h / 24) * 100}%`, transform: "translateX(-50%)" }}
            >
              {h === 0 ? "12A" : h === 12 ? "12P" : h > 12 ? `${h - 12}P` : `${h}A`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionBlock({
  session,
  apiBase,
  authHeaders,
  meta,
  startHour,
  widthHours,
  isFirst,
  isLast,
  onPlay,
}: {
  session: RecordingSession;
  apiBase: string;
  authHeaders: Record<string, string> | null;
  meta: { className: string; label: string; score: number };
  startHour: number;
  widthHours: number;
  isFirst: boolean;
  isLast: boolean;
  onPlay: (session: RecordingSession, startPercent?: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [hoverPercent, setHoverPercent] = useState(0);
  const [preview, setPreview] = useState<{ url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hovered || preview || !authHeaders) return;
    let cancelled = false;
    setPreviewLoading(true);

    const load = async () => {
      try {
        const playlistRes = await fetch(`${apiBase}/api/web/recording-sessions/${session.id}/playlist`, {
          headers: authHeaders,
          credentials: "include",
        });
        const playlist = await playlistRes.json();
        if (!playlist.success || !playlist.data?.chunks?.length) return;
        const firstChunk: RecordingChunk = playlist.data.chunks[0];
        const blobRes = await fetch(`${apiBase}${firstChunk.playbackUrl}`, {
          headers: authHeaders,
          credentials: "include",
          cache: "no-store",
        });
        if (!blobRes.ok) return;
        const blob = await blobRes.blob();
        if (cancelled || !blob.size) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setPreview({ url });
      } catch {
        // best-effort preview
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      setPreviewLoading(false);
    };
  }, [hovered, preview, apiBase, authHeaders, session.id]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const left = (startHour / 24) * 100;
  const width = (widthHours / 24) * 100;
  const employeeName = session.employeeName || session.employeeEmail || "";

  const cardW = 288;
  const cardH = 340;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  let cardLeft = (pointer?.x ?? 0) - cardW / 2;
  cardLeft = Math.max(12, Math.min(cardLeft, viewportW - cardW - 12));
  const openBelow = (pointer?.y ?? 0) < viewportH / 2;
  let cardTop = openBelow
    ? (pointer?.y ?? 0) + 14
    : Math.max(12, (pointer?.y ?? 0) - cardH - 14);
  if (openBelow && cardTop + cardH > viewportH - 12) {
    cardTop = Math.max(12, viewportH - cardH - 12);
  }

  return (
    <>
      <div
        className="absolute top-1.5 h-9 cursor-pointer rounded-lg shadow-sm transition-all hover:scale-[1.02] hover:shadow-md"
        style={{ left: `${left}%`, width: `${Math.max(0.4, width)}%` }}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          setPointer({ x: e.clientX, y: rect.top });
          setHoverPercent(pct);
          setHovered(true);
        }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          setPointer({ x: e.clientX, y: rect.top });
          setHoverPercent(pct);
        }}
        onMouseLeave={() => {
          setHovered(false);
          setPointer(null);
        }}
        onClick={() => onPlay(session, hoverPercent)}
      >
        <div className={`h-full w-full ${isFirst ? "rounded-l-md" : ""} ${isLast ? "rounded-r-md" : ""} ${meta.className} ${!isFirst && !isLast ? "" : ""}`} />
      </div>
      {hovered && pointer ? (
        <div
          className="fixed z-[100] max-h-[70vh] w-72 min-w-0 overflow-y-auto overscroll-contain rounded-2xl border border-[#E1D7CE] bg-white p-3 shadow-2xl ring-1 ring-black/5"
          style={{ left: cardLeft, top: cardTop }}
        >
          <div className="aspect-video overflow-hidden rounded-xl bg-[#171717]">
            {preview?.url ? (
              <video src={preview.url} muted autoPlay loop playsInline preload="auto" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-white/70">
                {previewLoading ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    <span className="text-[11px] font-medium">Loading preview…</span>
                  </>
                ) : (
                  <>
                    <Video className="h-6 w-6" />
                    <span className="text-[11px] font-medium">Preview unavailable</span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 px-1">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${meta.className}`} />
              <p className="truncate text-[13px] font-semibold text-[#302C28]">{employeeName}</p>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-[#8C837B]">
              {formatDate(session.startedAt)} · {formatTime(session.startedAt)}
            </p>
            <div className="mt-2 flex items-center justify-between text-[11px] font-medium text-[#8C837B]">
              <span>{meta.label}</span>
              <span>{formatDuration(session.durationMs)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E7E0DA]">
              <div className={`h-full rounded-full ${meta.className}`} style={{ width: `${meta.score}%` }} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── Detail Modal ───────────────────────────────────────────────────────────

function RecordingSessionModal({
  playlist,
  sessions,
  apiBase,
  authHeaders,
  onClose,
}: {
  playlist: FullDayPlaylist;
  sessions: RecordingSession[];
  apiBase: string;
  authHeaders: Record<string, string> | null;
  onClose: () => void;
}) {
  const sessionIds = Array.from(new Set(playlist.chunks.map((c) => ("sessionId" in c ? (c as any).sessionId : undefined)).filter(Boolean)));
  const involvedSessions = sessions.filter((s) => sessionIds.includes(s.id));
  const mainSession = involvedSessions[0];
  const employeeName = playlist.employeeName || mainSession?.employeeName || "Employee";
  const initials = employeeName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const totalDurationMs = involvedSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  const totalSize = involvedSessions.reduce((sum, s) => sum + (s.totalSize || 0), 0);
  const [topApps, setTopApps] = useState<{ name: string; seconds: number }[]>([]);

  useEffect(() => {
    if (!authHeaders || !mainSession?.employeeId || !mainSession?.startedAt) return;
    const date = mainSession.startedAt.slice(0, 10);
    const start = `${date}T00:00:00Z`;
    const end = `${date}T23:59:59Z`;
    fetch(`${apiBase}/api/web/dashboard/activity-timeline?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`, {
      headers: authHeaders,
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return;
        const emp = data.data?.employees?.find((e: any) => e.userId === mainSession.employeeId);
        if (emp?.topApps) setTopApps(emp.topApps.slice(0, 5));
      })
      .catch(() => {});
  }, [apiBase, authHeaders, mainSession]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0F0D0B]/60 p-3 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_32px_80px_rgba(0,0,0,0.28)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E7E0DA] bg-[#FAF8F6] px-6 py-4">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FDEBE5] text-sm font-bold text-brand">{initials}</span>
            <div>
              <h2 className="text-[16px] font-semibold text-[#302C28]">{employeeName}</h2>
              <p className="text-[12px] font-medium text-[#70675F]">
                {playlist.dateLabel} · {formatDuration(totalDurationMs)} · {involvedSessions.length} session
                {involvedSessions.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F2EEEA] text-[#70675F] transition hover:bg-[#E7E0DA] hover:text-[#302C28]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 gap-0 overflow-hidden lg:grid-cols-[1fr_340px]">
          {/* Left: existing full-day player */}
          <div className="flex min-h-0 flex-col overflow-y-auto bg-black">
            <FullDayPlayer
              playlist={playlist}
              apiBase={apiBase}
              authHeaders={authHeaders}
              employeeId={mainSession?.employeeId || ""}
              onClose={() => {}}
            />
          </div>

          {/* Right: insights + markers */}
          <div className="overflow-y-auto border-l border-[#E7E0DA] bg-white p-6">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[#8C837B]">Session Insights</h3>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-[#E7E0DA] bg-[#FAF8F6] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8C837B]">Total Duration</p>
                <p className="mt-1 text-[22px] font-semibold text-[#302C28]">{formatDuration(totalDurationMs)}</p>
              </div>
              <div className="rounded-2xl border border-[#E7E0DA] bg-[#FAF8F6] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8C837B]">Storage</p>
                <p className="mt-1 text-[22px] font-semibold text-[#302C28]">{formatFileSize(totalSize)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#E7E0DA] bg-[#FAF8F6] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8C837B]">FPS</p>
                  <p className="mt-2 text-[22px] font-semibold text-[#302C28]">{mainSession?.fps ?? "—"}</p>
                </div>
                <div className="rounded-2xl border border-[#E7E0DA] bg-[#FAF8F6] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8C837B]">Resolution</p>
                  <p className="mt-2 truncate text-[16px] font-semibold text-[#302C28]">
                    {mainSession ? `${mainSession.width}×${mainSession.height}` : "—"}
                  </p>
                </div>
              </div>
            </div>

            <h3 className="mb-3 mt-8 text-[13px] font-semibold uppercase tracking-wider text-[#8C837B]">Apps Used Today</h3>
            <div className="space-y-2">
              {topApps.length === 0 ? (
                <p className="rounded-xl border border-[#E7E0DA] bg-[#FAF8F6] p-3 text-[12px] font-medium text-[#8C837B]">No app data available.</p>
              ) : (
                topApps.map((app, i) => (
                  <div key={app.name} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[#E7E0DA] bg-white p-3 shadow-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FDEBE5] text-[10px] font-bold text-brand">{i + 1}</span>
                      <span className="min-w-0 truncate text-[13px] font-semibold text-[#302C28]" title={app.name}>{app.name}</span>
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-[#8C837B]">{formatDuration(app.seconds * 1000)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
