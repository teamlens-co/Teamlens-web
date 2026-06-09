"use client";

import { useEffect, useState, useCallback } from "react";
import { Video, Download, Trash2, Clock, User, Calendar, HardDrive, Play, Search, FastForward, Rewind } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";

type Recording = {
  id: string;
  managerId: string;
  employeeId: string;
  organizationId: string;
  liveSessionId: string | null;
  filePath: string;
  fileSize: number;
  durationMs: number;
  mimeType: string;
  recordedAt: string;
  createdAt: string;
};

const formatDuration = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
};

export default function RecordingsPage() {
  const { authHeaders, apiBase, user } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [teamUsers, setTeamUsers] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [loadError, setLoadError] = useState("");

  const isManager = user?.role === "MANAGER";

  // Fetch team users for name resolution
  useEffect(() => {
    if (!authHeaders || !isManager) return;
    fetch(`${apiBase}/api/web/users`, { headers: authHeaders, credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setTeamUsers(data.data);
      })
      .catch(() => {});
  }, [authHeaders, apiBase, isManager]);

  const fetchRecordings = useCallback(async () => {
    if (!authHeaders) return;
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams();
      if (user?.role !== "MANAGER" && user?.id) {
        params.set("employeeId", user.id);
      }
      const query = params.toString();
      const url = `${apiBase}/api/web/recordings${query ? `?${query}` : ""}`;
      const response = await fetch(url, {
        headers: authHeaders,
        credentials: "include",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || payload?.message || `Unable to load recordings (${response.status})`);
      }

      const result = await response.json();
      if (result.success) {
        setRecordings(result.data);
      } else {
        throw new Error(result.error || result.message || "Unable to load recordings");
      }
    } catch (error) {
      setRecordings([]);
      setLoadError(error instanceof Error ? error.message : "Unable to connect to recordings API");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, apiBase, user?.id, user?.role]);

  useEffect(() => {
    void fetchRecordings();
  }, [fetchRecordings]);

  const handleDelete = async (id: string) => {
    if (!authHeaders) return;
    try {
      const response = await fetch(`${apiBase}/api/web/recordings/${id}`, {
        method: "DELETE",
        headers: authHeaders,
        credentials: "include",
      });
      if (response.ok) {
        setRecordings((prev) => prev.filter((r) => r.id !== id));
        setDeleteConfirmId(null);
        if (playingId === id) setPlayingId(null);
      }
    } catch (error) {
      console.error("Failed to delete recording", error);
    }
  };

  const handleDownload = (recording: Recording) => {
    const link = document.createElement("a");
    link.href = `${apiBase}/api/web/recordings/${recording.id}/file`;
    link.download = `recording-${recording.id}.webm`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getEmployeeName = (employeeId: string): string => {
    const teamUser = teamUsers.find((u) => u.id === employeeId);
    return teamUser?.fullName || teamUser?.email || employeeId.slice(0, 8);
  };

  const filteredRecordings = recordings.filter((r) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const employeeName = getEmployeeName(r.employeeId).toLowerCase();
    const date = formatDate(r.recordedAt).toLowerCase();
    return employeeName.includes(query) || date.includes(query);
  });

  // Group recordings by date
  const groupedRecordings = filteredRecordings.reduce<Record<string, Recording[]>>((acc, rec) => {
    const dateKey = formatDate(rec.recordedAt);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(rec);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 rounded-full border-2 border-[#FDEBE5] border-t-brand animate-spin" />
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
            {recordings.length} recording{recordings.length !== 1 ? "s" : ""} saved
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C837B]" />
          <input
            type="text"
            placeholder="Search by name or date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-72 rounded-xl border border-[#E1D7CE] bg-white pl-10 pr-4 text-[13px] font-medium text-[#302C28] outline-none transition placeholder:text-[#8C837B] focus:border-brand focus:ring-2 focus:ring-brand/10"
            id="recording-search-input"
          />
        </div>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
          {loadError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#DDD2C9] bg-white p-4 shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FDEBE5]">
              <Video className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#9A9088]">Total Recordings</p>
              <p className="text-[22px] font-semibold leading-none text-[#302C28]">{recordings.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#DDD2C9] bg-white p-4 shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF9F3]">
              <Clock className="h-5 w-5 text-[#2BAE78]" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#9A9088]">Total Duration</p>
              <p className="text-[22px] font-semibold leading-none text-[#302C28]">
                {formatDuration(recordings.reduce((sum, r) => sum + r.durationMs, 0))}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#DDD2C9] bg-white p-4 shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF8E8]">
              <HardDrive className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#9A9088]">Total Size</p>
              <p className="text-[22px] font-semibold leading-none text-[#302C28]">
                {formatFileSize(recordings.reduce((sum, r) => sum + r.fileSize, 0))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {playingId && (
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
              className="w-full h-full object-contain"
              id="recording-video-player"
              ref={(el) => {
                if (el) el.playbackRate = playbackSpeed;
              }}
            />
          </div>
          {/* Playback speed controls */}
          <div className="flex items-center justify-between border-t border-[#EFE8E2] px-5 py-2.5">
            <div className="flex items-center gap-1.5">
              <FastForward className="h-3.5 w-3.5 text-[#8C837B]" strokeWidth={2} />
              <span className="text-[11px] font-medium text-[#8C837B] mr-1">Speed</span>
              {[0.5, 1, 1.5, 2].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => {
                    setPlaybackSpeed(speed);
                    const video = document.getElementById("recording-video-player") as HTMLVideoElement | null;
                    if (video) video.playbackRate = speed;
                  }}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    playbackSpeed === speed
                      ? "bg-brand text-white shadow-sm"
                      : "bg-[#F1ECE7] text-[#7E6F65] hover:bg-[#E5DDD6]"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
            <span className="text-[10px] font-medium text-[#9A9088]">
              {playbackSpeed !== 1 ? `Playing at ${playbackSpeed}x speed` : "Normal speed"}
            </span>
          </div>
        </div>
      )}

      {Object.keys(groupedRecordings).length === 0 ? (
        <div className="rounded-xl border border-[#DDD2C9] bg-white p-12 text-center shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1ECE7]">
            <Video className="h-6 w-6 text-[#B4AAA2]" />
          </div>
          <h3 className="text-[14px] font-medium text-[#302C28]">No recordings yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-[13px] font-medium text-[#8C837B]">
            Start a live screen session and click the record button to capture screen recordings.
          </p>
        </div>
      ) : (
        Object.entries(groupedRecordings).map(([date, recs]) => (
          <div key={date} className="overflow-hidden rounded-xl border border-[#DDD2C9] bg-white shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
            <div className="border-b border-[#EFE8E2] bg-[#FCFAF8] px-5 py-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#8C837B]" />
                <h3 className="text-[13px] font-medium text-[#302C28]">{date}</h3>
                <span className="ml-auto text-[11px] font-medium text-[#9A9088]">{recs.length} recording{recs.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="divide-y divide-[#EFE8E2]">
              {recs.map((recording) => (
                <div
                  key={recording.id}
                  className={`flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 transition-colors hover:bg-[#FCFAF8] ${
                    playingId === recording.id ? "border-l-2 border-l-brand bg-[#FDEBE5]/45" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPlayingId(playingId === recording.id ? null : recording.id);
                      if (playingId !== recording.id) setPlaybackSpeed(1);
                    }}
                    className="group relative flex h-12 w-[72px] sm:h-14 sm:w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#171717] transition-colors hover:bg-[#302C28]"
                    id={`play-recording-${recording.id}`}
                  >
                    <div className="absolute inset-0 bg-brand/20 opacity-0 transition-opacity group-hover:opacity-100" />
                    <Play className="h-5 w-5 text-white/80 transition-all group-hover:scale-110 group-hover:text-white" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-[#8C837B]" />
                      <span className="truncate text-[13px] font-medium text-[#302C28]">
                        {getEmployeeName(recording.employeeId)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] sm:text-[12px] font-medium text-[#8C837B]">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(recording.recordedAt)}
                      </span>
                      <span>·</span>
                      <span>{formatDuration(recording.durationMs)}</span>
                      <span>·</span>
                      <span>{formatFileSize(recording.fileSize)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 ml-auto sm:ml-0">
                    <button
                      type="button"
                      onClick={() => handleDownload(recording)}
                      className="inline-flex items-center rounded-lg border border-[#E1D7CE] bg-white px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-[12px] font-medium text-[#302C28] shadow-sm transition-colors hover:bg-[#FCFAF8]"
                      id={`download-btn-${recording.id}`}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                    {isManager && (
                      <>
                        {deleteConfirmId === recording.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(recording.id)}
                              className="inline-flex items-center rounded-lg bg-[#DC2626] px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-[12px] font-medium text-white transition-colors hover:bg-[#B91C1C]"
                              id={`confirm-delete-${recording.id}`}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="inline-flex items-center rounded-lg border border-[#E1D7CE] bg-white px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-[12px] font-medium text-[#302C28] transition-colors hover:bg-[#FCFAF8]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(recording.id)}
                            className="inline-flex items-center rounded-lg border border-rose-100 bg-rose-50 px-2 sm:px-2.5 py-1 sm:py-1.5 text-[11px] sm:text-[12px] font-medium text-[#DC2626] transition-colors hover:bg-rose-100"
                            id={`delete-btn-${recording.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
