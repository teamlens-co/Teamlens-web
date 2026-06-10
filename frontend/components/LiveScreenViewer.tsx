"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonitorUp, Square, WifiOff, Download, Maximize2, Minimize2 } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../contexts/AuthContext";

type LiveScreenViewerProps = {
  employeeId: string;
  disabled?: boolean;
  disabledReason?: string;
  autoStart?: boolean;
};

type SignalAck = {
  ok: boolean;
  sessionId?: string;
  iceServers?: RTCIceServer[];
  error?: string;
};

type RecordingEntry = {
  id: string;
  blob: Blob;
  url: string;
  startedAt: Date;
  stoppedAt: Date;
  durationMs: number;
  employeeId: string;
};

type StreamStats = {
  fps: number;
  bitrateKbps: number;
  width: number;
  height: number;
  latencyMs: number | null;
};

const defaultIceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

const configuredIceServers = (): RTCIceServer[] => {
  const raw = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS;
  if (!raw) return defaultIceServers;

  try {
    const parsed = JSON.parse(raw) as RTCIceServer[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultIceServers;
  } catch {
    return defaultIceServers;
  }
};

const formatRecordingDuration = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const formatTimestamp = (date: Date): string => {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
};

const generateFilename = (employeeId: string, startedAt: Date): string => {
  const date = startedAt.toISOString().slice(0, 10);
  const time = startedAt.toTimeString().slice(0, 8).replace(/:/g, "-");
  return `screen-recording_${employeeId}_${date}_${time}.webm`;
};

export default function LiveScreenViewer({ employeeId, disabled, disabledReason, autoStart = false }: LiveScreenViewerProps) {
  const { apiBase, wsBase, authHeaders, user } = useAuth();
  const [socketState, setSocketState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [viewState, setViewState] = useState<"idle" | "requesting" | "waiting" | "live" | "ended">("idle");
  const [message, setMessage] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamStats, setStreamStats] = useState<StreamStats | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const viewStateRef = useRef(viewState);
  const liveConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iceServers = useMemo(() => configuredIceServers(), []);
  const sessionIceServersRef = useRef<RTCIceServer[]>(iceServers);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const canView = user?.role === "MANAGER" && employeeId && employeeId !== user.id && !disabled;

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<Date | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousVideoStatsRef = useRef<{ timestamp: number; bytesReceived: number; framesDecoded: number } | null>(null);
  const autoStartRequestedRef = useRef(false);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    autoStartRequestedRef.current = false;
  }, [employeeId]);

  const cleanupPeer = useCallback(() => {
    if (liveConnectTimerRef.current) {
      clearTimeout(liveConnectTimerRef.current);
      liveConnectTimerRef.current = null;
    }
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
    previousVideoStatsRef.current = null;
    setStreamStats(null);
    peerRef.current?.getReceivers().forEach((receiver) => receiver.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
    pendingIceCandidatesRef.current = [];
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startStatsMonitor = useCallback((peer: RTCPeerConnection) => {
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current);
    }

    statsTimerRef.current = setInterval(async () => {
      try {
        const stats = await peer.getStats();
        stats.forEach((report) => {
          if (report.type !== "inbound-rtp" || report.kind !== "video") return;

          const previous = previousVideoStatsRef.current;
          const bytesReceived = Number(report.bytesReceived) || 0;
          const framesDecoded = Number(report.framesDecoded) || 0;
          const timestamp = Number(report.timestamp) || performance.now();
          const frameWidth = Number(report.frameWidth) || videoRef.current?.videoWidth || 0;
          const frameHeight = Number(report.frameHeight) || videoRef.current?.videoHeight || 0;
          const jitterBufferDelay = Number(report.jitterBufferDelay);
          const jitterBufferEmittedCount = Number(report.jitterBufferEmittedCount);
          const latencyMs =
            jitterBufferEmittedCount > 0 && Number.isFinite(jitterBufferDelay)
              ? Math.round((jitterBufferDelay / jitterBufferEmittedCount) * 1000)
              : null;

          if (!previous) {
            previousVideoStatsRef.current = { timestamp, bytesReceived, framesDecoded };
            return;
          }

          const elapsedSeconds = Math.max((timestamp - previous.timestamp) / 1000, 0.001);
          const bitrateKbps = Math.max(0, Math.round(((bytesReceived - previous.bytesReceived) * 8) / elapsedSeconds / 1000));
          const fps = Math.max(0, Math.round((framesDecoded - previous.framesDecoded) / elapsedSeconds));

          previousVideoStatsRef.current = { timestamp, bytesReceived, framesDecoded };
          setStreamStats({
            fps,
            bitrateKbps,
            width: frameWidth,
            height: frameHeight,
            latencyMs,
          });
        });
      } catch {
        // Stats are best-effort; the video itself should keep playing.
      }
    }, 1000);
  }, []);

  // Stop recording helper
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  // Start recording
  const startRecording = useCallback(() => {
    const stream = remoteStreamRef.current;
    if (!stream || stream.getTracks().length === 0) {
      setMessage("No live stream available to record.");
      return;
    }

    // Determine best supported MIME type
    const mimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";

    try {
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      });

      recordedChunksRef.current = [];
      recordingStartRef.current = new Date();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        if (chunks.length === 0) return;

        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const startedAt = recordingStartRef.current || new Date();
        const stoppedAt = new Date();
        const durationMs = stoppedAt.getTime() - startedAt.getTime();

        const entry: RecordingEntry = {
          id: crypto.randomUUID(),
          blob,
          url,
          startedAt,
          stoppedAt,
          durationMs,
          employeeId,
        };

        setRecordings((prev) => [entry, ...prev]);
        recordedChunksRef.current = [];
        recordingStartRef.current = null;

        // Upload to backend in the background
        const formData = new FormData();
        formData.append("file", blob, generateFilename(employeeId, startedAt));
        formData.append("employeeId", employeeId);
        formData.append("durationMs", String(durationMs));
        formData.append("recordedAt", startedAt.toISOString());
        if (sessionIdRef.current) {
          formData.append("liveSessionId", sessionIdRef.current);
        }

        fetch(`${apiBase}/api/web/recordings`, {
          method: "POST",
          headers: authHeaders?.Authorization ? { Authorization: authHeaders.Authorization } : undefined,
          credentials: "include",
          body: formData,
        }).then(async (res) => {
          if (res.ok) {
            setMessage("Recording saved to Screen Recordings.");
            return;
          }

          const payload = await res.json().catch(() => null);
          const errorMessage = payload?.error || "Failed to save recording to server.";
          console.warn(errorMessage);
          setMessage(`${errorMessage} Local copy is still available below.`);
        }).catch((err) => {
          console.warn("Recording upload failed (saved locally only)", err);
          setMessage("Recording upload failed. Local copy is still available below.");
        });
      };

      recorder.onerror = () => {
        setMessage("Recording error occurred.");
        stopRecording();
      };

      // Collect data every second for smoother progress
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingDuration(0);

      // Update duration timer
      recordingTimerRef.current = setInterval(() => {
        if (recordingStartRef.current) {
          setRecordingDuration(Date.now() - recordingStartRef.current.getTime());
        }
      }, 500);
    } catch (err) {
      console.error("Failed to start recording", err);
      setMessage("Unable to start recording. Your browser may not support MediaRecorder.");
    }
  }, [apiBase, authHeaders, employeeId, stopRecording]);

  // Download recording
  const downloadRecording = useCallback((entry: RecordingEntry) => {
    const link = document.createElement("a");
    link.href = entry.url;
    link.download = generateFilename(entry.employeeId, entry.startedAt);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const container = videoContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => { });
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => { });
    }
  }, []);

  // Listen for fullscreen change
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const attachVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && remoteStreamRef.current) {
      node.srcObject = remoteStreamRef.current;
      void node.play().catch(() => {
        setMessage("Live stream connected. Press play if the browser paused video playback.");
      });
    }
  }, []);

  const stopViewing = useCallback(
    (reason = "ended") => {
      // Stop recording if active
      stopRecording();

      const activeSessionId = sessionIdRef.current;
      if (activeSessionId) {
        socketRef.current?.emit("live:view-ended", { sessionId: activeSessionId, reason });
      }
      cleanupPeer();
      sessionIdRef.current = null;
      sessionIceServersRef.current = iceServers;
      setSessionId(null);
      setViewState(reason === "ended" || reason === "timeout" ? "ended" : "idle");
      setMessage(
        reason === "ended"
          ? "Live viewing stopped."
          : reason === "timeout"
            ? "Live stream did not start. Please make sure the employee agent is clocked in and online, then try again."
            : "",
      );
    },
    [cleanupPeer, iceServers, stopRecording],
  );

  // Cleanup recording URLs on unmount
  useEffect(() => {
    return () => {
      recordings.forEach((r) => URL.revokeObjectURL(r.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;

    setSocketState("connecting");
    const token = typeof window !== "undefined" ? window.localStorage.getItem("teamlens_access_token") ?? "" : "";
    const socket = io(wsBase, {
      auth: token ? { token } : undefined,
      withCredentials: true,
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketState("connected");
      setMessage("");
    });

    socket.on("connect_error", (error) => {
      setSocketState("error");
      console.warn("Live signaling connection failed", {
        message: error.message,
        description: (error as Error & { description?: unknown }).description,
        context: (error as Error & { context?: unknown }).context,
      });
      setMessage(error.message || "Live signaling connection failed.");
    });

    socket.on("disconnect", () => {
      setSocketState("idle");
      cleanupPeer();
      setViewState((current) => (current === "live" || current === "waiting" ? "ended" : current));
      setMessage("Live signaling disconnected.");
    });

    socket.on("live:view-accepted", (payload: { sessionId: string }) => {
      if (payload.sessionId === sessionIdRef.current) {
        setViewState("waiting");
        setMessage("Employee accepted. Connecting video...");
      }
    });

    socket.on("live:view-ended", (payload: { sessionId: string; reason?: string }) => {
      if (!sessionIdRef.current || payload.sessionId !== sessionIdRef.current) return;
      cleanupPeer();
      sessionIdRef.current = null;
      setSessionId(null);
      setViewState("ended");
      setMessage(payload.reason === "disconnect" ? "Live view ended because a peer disconnected." : "Live view ended.");
    });

    socket.on("webrtc:offer", async (payload: { sessionId: string; offer: RTCSessionDescriptionInit }) => {
      if (!payload.sessionId || payload.sessionId !== sessionIdRef.current) return;

      try {
        if (liveConnectTimerRef.current) {
          clearTimeout(liveConnectTimerRef.current);
          liveConnectTimerRef.current = null;
        }
        cleanupPeer();
        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStream;
        }

        const peer = new RTCPeerConnection({
          iceServers: sessionIceServersRef.current,
        });
        peerRef.current = peer;
        startStatsMonitor(peer);

        peer.ontrack = (event) => {
          event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
          if (videoRef.current) {
            videoRef.current.srcObject = remoteStream;
            void videoRef.current.play().catch(() => {
              setMessage("Live stream connected. Press play if the browser paused video playback.");
            });
          }
          setViewState("live");
          setMessage("");
        };

        peer.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("webrtc:ice-candidate", { sessionId: payload.sessionId, candidate: event.candidate });
          }
        };

        peer.onconnectionstatechange = () => {
          console.info("Live WebRTC connection state", peer.connectionState);
          if (peer.connectionState === "connected") {
            setMessage("");
          }
          if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
            setMessage(`WebRTC connection ${peer.connectionState}.`);
          }
        };

        peer.oniceconnectionstatechange = () => {
          console.info("Live WebRTC ICE state", peer.iceConnectionState);
          if (peer.iceConnectionState === "failed") {
            setMessage("WebRTC ICE failed. Retrying connection...");
            peer.restartIce?.();
          }
        };

        await peer.setRemoteDescription(payload.offer);

        const pendingCandidates = pendingIceCandidatesRef.current.splice(0);
        for (const candidate of pendingCandidates) {
          try {
            await peer.addIceCandidate(candidate);
          } catch (error) {
            console.warn("Unable to add queued remote ICE candidate", error);
          }
        }

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("webrtc:answer", { sessionId: payload.sessionId, answer });
      } catch (error) {
        console.error("Failed to answer live screen offer", error);
        setMessage("Unable to connect to the employee screen.");
        stopViewing("error");
      }
    });

    socket.on("webrtc:ice-candidate", async (payload: { sessionId: string; candidate: RTCIceCandidateInit }) => {
      if (payload.sessionId !== sessionIdRef.current || !payload.candidate) return;

      const peer = peerRef.current;
      if (!peer || !peer.remoteDescription) {
        pendingIceCandidatesRef.current.push(payload.candidate);
        return;
      }

      try {
        await peer.addIceCandidate(payload.candidate);
      } catch (error) {
        console.warn("Unable to add remote ICE candidate", error);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      cleanupPeer();
    };
  }, [cleanupPeer, iceServers, startStatsMonitor, stopViewing, user, wsBase]);

  const requestLiveView = useCallback(() => {
    if (!canView || !socketRef.current || socketState !== "connected") return;

    cleanupPeer();
    sessionIdRef.current = null;
    sessionIceServersRef.current = iceServers;
    setViewState("requesting");
    setMessage("Requesting live screen...");
    socketRef.current.timeout(10000).emit("live:view-request", { employeeId }, (error: Error | null, response: SignalAck) => {
      if (error || !response?.ok || !response.sessionId) {
        setViewState("idle");
        setMessage(response?.error || "Live view request timed out.");
        return;
      }

      sessionIceServersRef.current = response.iceServers?.length ? response.iceServers : iceServers;
      setSessionId(response.sessionId);
      sessionIdRef.current = response.sessionId;
      setViewState("waiting");
      setMessage("Waiting for the employee agent to start streaming...");
      liveConnectTimerRef.current = setTimeout(() => {
        if (sessionIdRef.current !== response.sessionId || viewStateRef.current === "live") return;
        stopViewing("timeout");
      }, 35000);
    });
  }, [canView, cleanupPeer, employeeId, iceServers, socketState, stopViewing]);

  useEffect(() => {
    if (!autoStart || autoStartRequestedRef.current || viewState !== "idle") return;
    if (!canView || socketState !== "connected") return;

    autoStartRequestedRef.current = true;
    requestLiveView();
  }, [autoStart, canView, requestLiveView, socketState, viewState]);

  return (
    <section className="bg-white rounded-[24px] border border-slate-200 p-5 shadow-sm shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-slate-900">Live Screen</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Recording controls — visible only when live */}
          {viewState === "live" || viewState === "waiting" || viewState === "requesting" ? (
            <button
              type="button"
              onClick={() => stopViewing("ended")}
              className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              id="stop-live-btn"
            >
              <Square className="mr-2 h-4 w-4" />
              Stop
            </button>
          ) : autoStart ? (
            <span className="inline-flex items-center rounded-md bg-slate-50 border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600">
              <MonitorUp className="mr-2 h-4 w-4 text-brand" />
              Starting live screen...
            </span>
          ) : (
            <button
              type="button"
              onClick={requestLiveView}
              disabled={!canView || socketState !== "connected"}
              title={!canView ? disabledReason : undefined}
              className="inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:bg-slate-300"
              id="view-live-btn"
            >
              <MonitorUp className="mr-2 h-4 w-4" />
              View Live Screen
            </button>
          )}
        </div>
      </div>

      {message ? (
        <div className="mt-4 flex items-center rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {socketState === "error" ? <WifiOff className="mr-2 h-4 w-4 text-red-500" /> : null}
          {message}
        </div>
      ) : null}

      {!canView && disabledReason ? (
        <div className="mt-4 flex items-center rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {disabledReason}
        </div>
      ) : null}

      {/* Video player with fullscreen support */}
      {(viewState === "live" || viewState === "waiting") && (
        <div ref={videoContainerRef} className="mt-4 relative group overflow-hidden rounded-md bg-slate-950">
          <video
            ref={attachVideoRef}
            autoPlay
            playsInline
            muted
            controls
            disablePictureInPicture
            className="aspect-video w-full bg-slate-950 object-contain"
          />

          {/* Fullscreen toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute top-3 right-3 p-2 bg-black/50 backdrop-blur-sm rounded-lg text-white/80 hover:text-white hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-all"
            id="fullscreen-toggle-btn"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      )}

      {/* Recordings list */}
      {recordings.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium text-slate-700 mb-3">
            Recordings
            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {recordings.length}
            </span>
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {recordings.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3 border border-slate-100 hover:border-slate-200 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10">
                    <MonitorUp className="h-4 w-4 text-brand" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {formatTimestamp(entry.startedAt)} — {formatTimestamp(entry.stoppedAt)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Duration: {formatRecordingDuration(entry.durationMs)}
                      <span className="mx-1.5">·</span>
                      {(entry.blob.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadRecording(entry)}
                  className="inline-flex items-center rounded-md bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
                  id={`download-recording-${entry.id}`}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </button>
              </div>

            ))}
          </div>
        </div>
      )}
    </section>
  );
}
