"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";

type SignalAck = {
  ok: boolean;
  sessionId?: string;
  iceServers?: RTCIceServer[];
  error?: string;
};

const defaultIceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

const trimSlash = (value: string) => value.replace(/\/$/, "");

function MobileLiveInner() {
  const params = useSearchParams();
  const token = params.get("mobileToken") || params.get("teamlensToken") || "";
  const employeeId = params.get("employeeId") || "";
  const runtimeHost = typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}` : "";
  const apiBase = trimSlash(params.get("mobileApiBase") || (runtimeHost ? `${runtimeHost}:5000` : "http://localhost:5000"));
  const wsBase = trimSlash(params.get("mobileWsBase") || (runtimeHost ? `${runtimeHost}:4000` : "http://localhost:4000"));

  const [status, setStatus] = useState("Preparing live stream...");
  const [viewState, setViewState] = useState<"idle" | "connecting" | "waiting" | "live" | "error" | "ended">("idle");
  const [sessionId, setSessionId] = useState("");
  const [employeeName, setEmployeeName] = useState("Employee");

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef("");
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  const canStart = Boolean(token && employeeId);

  const cleanupPeer = useCallback(() => {
    peerRef.current?.getReceivers().forEach((receiver) => receiver.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
    pendingIceRef.current = [];
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopViewing = useCallback((reason = "ended") => {
    if (sessionIdRef.current) {
      socketRef.current?.emit("live:view-ended", { sessionId: sessionIdRef.current, reason });
    }
    cleanupPeer();
    sessionIdRef.current = "";
    setSessionId("");
    setViewState("ended");
    setStatus("Live stream stopped.");
  }, [cleanupPeer]);

  const requestLiveView = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !employeeId) return;

    cleanupPeer();
    setViewState("connecting");
    setStatus("Requesting employee live screen...");

    socket.timeout(12000).emit("live:view-request", { employeeId }, (error: Error | null, response: SignalAck) => {
      if (error || !response?.ok || !response.sessionId) {
        setViewState("error");
        setStatus(response?.error || "Live view request failed. Make sure the employee agent is online and clocked in.");
        return;
      }

      sessionIdRef.current = response.sessionId;
      setSessionId(response.sessionId);
      setViewState("waiting");
      setStatus("Waiting for employee agent to send video...");
    });
  }, [cleanupPeer, employeeId]);

  useEffect(() => {
    if (!canStart) {
      return;
    }

    fetch(`${apiBase}/api/web/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.message || `Auth failed at ${apiBase}`);
        }
      })
      .catch((error) => {
        setViewState("error");
        setStatus(error instanceof Error ? error.message : "Unable to validate mobile token.");
      });
  }, [apiBase, canStart, token]);

  useEffect(() => {
    if (!canStart || viewState === "error") return;

    const socket = io(wsBase, {
      auth: { token },
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("Connected to live signaling. Starting stream...");
      requestLiveView();
    });

    socket.on("connect_error", (error) => {
      setViewState("error");
      setStatus(`Live signaling failed at ${wsBase}: ${error.message}`);
    });

    socket.on("live:view-accepted", (payload: { sessionId: string }) => {
      if (payload.sessionId === sessionIdRef.current) {
        setViewState("waiting");
        setStatus("Employee accepted. Connecting video...");
      }
    });

    socket.on("live:view-ended", (payload: { sessionId: string; reason?: string }) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      cleanupPeer();
      sessionIdRef.current = "";
      setViewState("ended");
      setStatus(payload.reason === "disconnect" ? "Stream ended because a peer disconnected." : "Live stream ended.");
    });

    socket.on("webrtc:offer", async (payload: { sessionId: string; offer: RTCSessionDescriptionInit; iceServers?: RTCIceServer[] }) => {
      if (!payload.sessionId || payload.sessionId !== sessionIdRef.current) return;

      try {
        cleanupPeer();
        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;

        const peer = new RTCPeerConnection({
          iceServers: payload.iceServers?.length ? payload.iceServers : defaultIceServers,
          bundlePolicy: "max-bundle",
          rtcpMuxPolicy: "require",
        });
        peerRef.current = peer;

        peer.ontrack = (event) => {
          event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
          if (videoRef.current) {
            videoRef.current.srcObject = remoteStream;
            void videoRef.current.play().catch(() => {
              setStatus("Stream connected. Tap play if video is paused.");
            });
          }
          setViewState("live");
          setStatus("Live stream connected.");
        };

        peer.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("webrtc:ice-candidate", { sessionId: payload.sessionId, candidate: event.candidate });
          }
        };

        peer.onconnectionstatechange = () => {
          if (peer.connectionState === "connected") {
            setViewState("live");
            setStatus("Live stream connected.");
          }
          if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
            setStatus(`WebRTC connection ${peer.connectionState}.`);
          }
        };

        await peer.setRemoteDescription(payload.offer);
        for (const candidate of pendingIceRef.current.splice(0)) {
          await peer.addIceCandidate(candidate).catch(() => undefined);
        }

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("webrtc:answer", { sessionId: payload.sessionId, answer });
      } catch (error) {
        setViewState("error");
        setStatus(error instanceof Error ? error.message : "Unable to connect WebRTC stream.");
      }
    });

    socket.on("webrtc:ice-candidate", async (payload: { sessionId: string; candidate: RTCIceCandidateInit }) => {
      if (payload.sessionId !== sessionIdRef.current || !payload.candidate) return;
      const peer = peerRef.current;
      if (!peer || !peer.remoteDescription) {
        pendingIceRef.current.push(payload.candidate);
        return;
      }
      await peer.addIceCandidate(payload.candidate).catch(() => undefined);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      cleanupPeer();
    };
  }, [canStart, cleanupPeer, requestLiveView, token, viewState, wsBase]);

  useEffect(() => {
    if (!employeeId || !token) return;
    fetch(`${apiBase}/api/web/users`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json();
        const user = Array.isArray(payload?.data) ? payload.data.find((item: { id: string }) => item.id === employeeId) : null;
        if (user?.fullName) setEmployeeName(user.fullName);
      })
      .catch(() => undefined);
  }, [apiBase, employeeId, token]);

  const statusTone = useMemo(() => {
    if (viewState === "live") return "bg-emerald-500";
    if (viewState === "error" || !canStart) return "bg-red-500";
    return "bg-amber-500";
  }, [canStart, viewState]);

  const displayStatus = canStart ? status : "Missing mobile token or employee id.";

  return (
    <main className="flex min-h-screen flex-col bg-[#111] text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-black px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">TeamLens Mobile Live</p>
          <h1 className="truncate text-base font-semibold">{employeeName}</h1>
        </div>
        <button
          type="button"
          onClick={() => requestLiveView()}
          className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white"
        >
          Retry
        </button>
      </header>

      <section className="relative flex flex-1 items-center justify-center bg-black">
        <video ref={videoRef} autoPlay playsInline muted controls className="h-full max-h-[calc(100vh-150px)] w-full object-contain" />
        {viewState !== "live" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center">
            <div>
              <div className={`mx-auto mb-4 h-3 w-3 rounded-full ${statusTone}`} />
              <p className="text-sm font-semibold">{displayStatus}</p>
              <p className="mt-3 text-xs text-white/45">API: {apiBase}</p>
              <p className="mt-1 text-xs text-white/45">WS: {wsBase}</p>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="border-t border-white/10 bg-black px-4 py-3">
        <p className="text-xs font-medium text-white/70">{displayStatus}</p>
        {sessionId ? <p className="mt-1 text-[10px] text-white/35">Session {sessionId}</p> : null}
        <button
          type="button"
          onClick={() => stopViewing("ended")}
          className="mt-3 w-full rounded-full bg-red-500 px-4 py-3 text-sm font-bold text-white"
        >
          Stop stream
        </button>
      </footer>
    </main>
  );
}

export default function MobileLivePage() {
  return <MobileLiveInner />;
}
