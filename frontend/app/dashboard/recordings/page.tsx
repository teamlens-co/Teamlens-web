"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Clock, Download, HardDrive, Play, Search, Trash2, User, Video } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";

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
  durationMs: number;
  playbackUrl: string;
};

type Playlist = {
  session: RecordingSession;
  chunks: RecordingChunk[];
};

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

const formatDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const formatTime = (dateStr: string): string =>
  new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function SessionRecordingPlayer({
  playlist,
  apiBase,
  authHeaders,
  onClose,
}: {
  playlist: Playlist;
  apiBase: string;
  authHeaders: { "Content-Type": string; Authorization?: string } | null;
  onClose: () => void;
}) {
  const [chunkIndex, setChunkIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [chunkUrl, setChunkUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const chunks = playlist.chunks;
  const current = chunks[chunkIndex];
  const progress = chunks.length ? ((chunkIndex + 1) / chunks.length) * 100 : 0;

  useEffect(() => {
    let objectUrl = "";
    const loadChunk = async () => {
      if (!current || !authHeaders) {
        setChunkUrl("");
        return;
      }
      const response = await fetch(`${apiBase}${current.playbackUrl}`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!response.ok) {
        setChunkUrl("");
        return;
      }
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      setChunkUrl(objectUrl);
    };
    void loadChunk();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiBase, authHeaders, current]);

  useEffect(() => {
    if (videoRef.current && chunkUrl) {
      videoRef.current.playbackRate = speed;
      void videoRef.current.play().catch(() => {});
    }
  }, [chunkUrl, speed]);

  return (
    <div className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFE8E2] px-5 py-3">
        <div>
          <h3 className="text-[13px] font-semibold text-[#302C28]">{playlist.session.employeeName || playlist.session.employeeEmail || "Employee"}</h3>
          <p className="mt-0.5 text-[11px] font-medium text-[#8C837B]">
            {chunks.length} chunks · {playlist.session.fps} FPS · {playlist.session.width}x{playlist.session.height}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-[12px] font-semibold text-[#7E6F65] transition-colors hover:text-brand">
          Close Player
        </button>
      </div>

      <div className="aspect-video bg-[#171717]">
        {current && chunkUrl ? (
          <video
            key={current.id}
            ref={videoRef}
            src={chunkUrl}
            controls
            autoPlay
            className="h-full w-full object-contain"
            onEnded={() => setChunkIndex((index) => Math.min(index + 1, chunks.length - 1))}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] font-medium text-white/70">
            {current ? "Loading recording chunk..." : "No uploaded chunks yet"}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-[#EFE8E2] px-5 py-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-[#EFE8E2]">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setChunkIndex((index) => Math.max(index - 1, 0))} className="rounded-lg border border-[#E1D7CE] px-3 py-1.5 text-[12px] font-semibold text-[#302C28]">
              Back
            </button>
            <button type="button" onClick={() => setChunkIndex((index) => Math.min(index + 1, chunks.length - 1))} className="rounded-lg border border-[#E1D7CE] px-3 py-1.5 text-[12px] font-semibold text-[#302C28]">
              Next
            </button>
            <span className="text-[11px] font-medium text-[#8C837B]">
              {chunks.length ? chunkIndex + 1 : 0} / {chunks.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {[1, 2, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSpeed(value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${speed === value ? "bg-brand text-white" : "bg-[#F1ECE7] text-[#7E6F65]"}`}
              >
                {value}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RecordingsPage() {
  const { authHeaders, apiBase, user } = useAuth();
  const [tab, setTab] = useState<"auto" | "manual">("auto");
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [manualRecordings, setManualRecordings] = useState<ManualRecording[]>([]);
  const [teamUsers, setTeamUsers] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const isManager = user?.role === "MANAGER";

  useEffect(() => {
    if (!authHeaders || !isManager) return;
    fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setTeamUsers(data.data);
      })
      .catch(() => {});
  }, [authHeaders, apiBase, isManager]);

  const fetchData = useCallback(async () => {
    if (!authHeaders) return;
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams();
      if (user?.role !== "MANAGER" && user?.id) params.set("employeeId", user.id);
      const query = params.toString();
      const [sessionsRes, manualRes] = await Promise.all([
        fetch(`${apiBase}/api/web/recording-sessions${query ? `?${query}` : ""}`, { headers: authHeaders, credentials: "include" }),
        fetch(`${apiBase}/api/web/recordings${query ? `?${query}` : ""}`, { headers: authHeaders, credentials: "include" }),
      ]);
      const [sessionsPayload, manualPayload] = await Promise.all([sessionsRes.json(), manualRes.json()]);
      if (!sessionsRes.ok || !sessionsPayload.success) throw new Error(sessionsPayload.message || "Unable to load auto recordings");
      if (!manualRes.ok || !manualPayload.success) throw new Error(manualPayload.message || "Unable to load live recordings");
      setSessions(sessionsPayload.data || []);
      setManualRecordings(manualPayload.data || []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to connect to recordings API");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, apiBase, user?.id, user?.role]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const getEmployeeName = useCallback((employeeId: string): string => {
    const teamUser = teamUsers.find((u) => u.id === employeeId);
    return teamUser?.fullName || teamUser?.email || employeeId.slice(0, 8);
  }, [teamUsers]);

  const filteredSessions = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return sessions.filter((session) => {
      const name = (session.employeeName || session.employeeEmail || getEmployeeName(session.employeeId)).toLowerCase();
      return !query || name.includes(query) || formatDate(session.startedAt).toLowerCase().includes(query) || session.status.includes(query);
    });
  }, [getEmployeeName, searchQuery, sessions]);

  const filteredManual = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return manualRecordings.filter((recording) => {
      const name = getEmployeeName(recording.employeeId).toLowerCase();
      return !query || name.includes(query) || formatDate(recording.recordedAt).toLowerCase().includes(query);
    });
  }, [getEmployeeName, manualRecordings, searchQuery]);

  const playSession = async (session: RecordingSession) => {
    if (!authHeaders) return;
    const response = await fetch(`${apiBase}/api/web/recording-sessions/${session.id}/playlist`, {
      headers: authHeaders,
      credentials: "include",
    });
    const payload = await response.json();
    if (response.ok && payload.success) {
      setPlaylist(payload.data);
      setTab("auto");
    }
  };

  const handleManualDelete = async (id: string) => {
    if (!authHeaders) return;
    const response = await fetch(`${apiBase}/api/web/recordings/${id}`, {
      method: "DELETE",
      headers: authHeaders,
      credentials: "include",
    });
    if (response.ok) {
      setManualRecordings((prev) => prev.filter((recording) => recording.id !== id));
      setDeleteConfirmId(null);
    }
  };

  const totalAutoSize = sessions.reduce((sum, session) => sum + Number(session.totalSize || 0), 0);
  const totalAutoDuration = sessions.reduce((sum, session) => sum + Number(session.durationMs || 0), 0);

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-semibold leading-tight text-[#302C28]">Screen Recordings</h1>
          <p className="mt-1 text-[13px] font-medium text-[#8C837B]">
            {sessions.length} auto sessions · {manualRecordings.length} live recordings
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C837B]" />
          <input
            type="text"
            placeholder="Search recordings..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-9 w-72 rounded-xl border border-[#E1D7CE] bg-white pl-10 pr-4 text-[13px] font-medium text-[#302C28] outline-none transition placeholder:text-[#8C837B] focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>
      </div>

      {loadError ? <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">{loadError}</div> : null}

      <div className="flex w-fit rounded-xl border border-[#DDD2C9] bg-white p-1">
        <button type="button" onClick={() => setTab("auto")} className={`rounded-lg px-4 py-2 text-[12px] font-semibold ${tab === "auto" ? "bg-[#302C28] text-white" : "text-[#7E6F65]"}`}>
          Auto Sessions
        </button>
        <button type="button" onClick={() => setTab("manual")} className={`rounded-lg px-4 py-2 text-[12px] font-semibold ${tab === "manual" ? "bg-[#302C28] text-white" : "text-[#7E6F65]"}`}>
          Live Recordings
        </button>
      </div>

      {tab === "auto" ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat icon={Video} label="Auto Sessions" value={String(sessions.length)} />
            <Stat icon={Clock} label="Total Duration" value={formatDuration(totalAutoDuration)} />
            <Stat icon={HardDrive} label="Total Size" value={formatFileSize(totalAutoSize)} />
          </div>

          {playlist ? <SessionRecordingPlayer playlist={playlist} apiBase={apiBase} authHeaders={authHeaders} onClose={() => setPlaylist(null)} /> : null}

          {filteredSessions.length === 0 ? (
            <EmptyState text="No auto recording sessions yet" detail="Employee agent recordings appear here after chunks upload." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
              <div className="divide-y divide-[#EFE8E2]">
                {filteredSessions.map((session) => (
                  <div key={session.id} className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-[#FCFAF8]">
                    <button type="button" onClick={() => void playSession(session)} className="group flex h-14 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#171717] transition-colors hover:bg-[#302C28]">
                      <Play className="h-5 w-5 text-white/80 transition-all group-hover:scale-110 group-hover:text-white" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <User className="h-3.5 w-3.5 text-[#8C837B]" />
                        <span className="truncate text-[13px] font-semibold text-[#302C28]">{session.employeeName || session.employeeEmail || getEmployeeName(session.employeeId)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${session.status === "complete" ? "bg-[#EEF9F3] text-[#21845D]" : session.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-[#FDEBE5] text-brand"}`}>
                          {session.status}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-[#8C837B]">
                        <span>{formatDate(session.startedAt)} · {formatTime(session.startedAt)}</span>
                        <span>{formatDuration(session.durationMs)}</span>
                        <span>{session.fps} FPS</span>
                        <span>{session.width}x{session.height}</span>
                        <span>{session.chunkCount || 0} chunks</span>
                        <span>{formatFileSize(Number(session.totalSize || 0))}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Video; label: string; value: string }) {
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
    return <EmptyState text="No live recordings yet" detail="Manual live-view recordings appear here after a manager records a live session." />;
  }

  return (
    <div className="space-y-4">
      {playingId ? (
        <div className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
          <div className="flex items-center justify-between border-b border-[#EFE8E2] px-5 py-3">
            <h3 className="text-[13px] font-medium text-[#302C28]">Now Playing</h3>
            <button type="button" onClick={() => setPlayingId(null)} className="text-[12px] font-medium text-[#7E6F65] transition-colors hover:text-brand">
              Close Player
            </button>
          </div>
          <div className="aspect-video bg-[#171717]">
            <video src={`${apiBase}/api/web/recordings/${playingId}/file`} controls autoPlay className="h-full w-full object-contain" />
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
        <div className="divide-y divide-[#EFE8E2]">
          {recordings.map((recording) => (
            <div key={recording.id} className="flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-[#FCFAF8]">
              <button type="button" onClick={() => setPlayingId(playingId === recording.id ? null : recording.id)} className="group flex h-14 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#171717] transition-colors hover:bg-[#302C28]">
                <Play className="h-5 w-5 text-white/80 transition-all group-hover:scale-110 group-hover:text-white" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-[#8C837B]" />
                  <span className="truncate text-[13px] font-semibold text-[#302C28]">{getEmployeeName(recording.employeeId)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-[#8C837B]">
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(recording.recordedAt)}</span>
                  <span>{formatTime(recording.recordedAt)}</span>
                  <span>{formatDuration(recording.durationMs)}</span>
                  <span>{formatFileSize(recording.fileSize)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={`${apiBase}/api/web/recordings/${recording.id}/file`} download={`recording-${recording.id}.webm`} className="inline-flex items-center rounded-lg border border-[#E1D7CE] bg-white px-3 py-1.5 text-[12px] font-medium text-[#302C28] shadow-sm transition-colors hover:bg-[#FCFAF8]">
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download
                </a>
                {isManager ? (
                  deleteConfirmId === recording.id ? (
                    <>
                      <button type="button" onClick={() => onDelete(recording.id)} className="rounded-lg bg-[#DC2626] px-3 py-1.5 text-[12px] font-medium text-white">Confirm</button>
                      <button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded-lg border border-[#E1D7CE] px-3 py-1.5 text-[12px] font-medium text-[#302C28]">Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setDeleteConfirmId(recording.id)} className="rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-[#DC2626] transition-colors hover:bg-rose-100">
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
