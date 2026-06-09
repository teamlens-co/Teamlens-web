"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface AlertEvent {
  id: string;
  rule_id: string;
  rule_name: string;
  rule_type: string;
  severity: string;
  title: string;
  message: string;
  employee_id: string;
  employee_name: string;
  metadata: string;
  triggered_at: string;
  acknowledged: boolean;
}

export default function AlertBell() {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { authHeaders } = useAuth();

  // Fetch initial alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const headers: HeadersInit = authHeaders ? (authHeaders as HeadersInit) : {};
      const res = await fetch("/api/alerts", { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.data) {
        setAlerts(data.data);
        setUnreadCount(data.data.filter((a: AlertEvent) => !a.acknowledged).length);
      }
    } catch {
      // silent
    }
  }, [authHeaders]);

  // WebSocket connection for real-time
  useEffect(() => {
    if (typeof window === "undefined") return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${proto}//${host}/ws/alerts`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => console.log("[AlertBell] WebSocket connected");
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "alert") {
            const alert = msg.data as AlertEvent;
            setAlerts(prev => [alert, ...prev]);
            setUnreadCount(prev => prev + 1);
            playAlertSound();
          }
        } catch {}
      };
      ws.onclose = () => setTimeout(connect, 5000); // reconnect
      wsRef.current = ws;
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Poll for alerts as fallback
  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Play sound
  const playAlertSound = () => {
    if (!soundEnabled) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      // Use Web Audio API to generate a simple beep
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  };

  // Acknowledge alert
  const acknowledgeAlert = async (alertId: string) => {
    try {
      const headers: HeadersInit = authHeaders ? { ...(authHeaders as HeadersInit), "Content-Type": "application/json" } : { "Content-Type": "application/json" };
      await fetch(`/api/alerts/${alertId}/ack`, {
        method: "POST",
        headers,
        body: JSON.stringify({ acknowledged_by: "manager" }),
      });
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-500";
      case "warning": return "bg-amber-500";
      default: return "bg-blue-500";
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-500 bg-red-50 border-red-200";
      case "warning": return "text-amber-600 bg-amber-50 border-amber-200";
      default: return "text-blue-600 bg-blue-50 border-blue-200";
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="grid h-8 w-8 place-items-center rounded-md text-foreground/60 hover:bg-accent/60 transition-colors"
          title={soundEnabled ? "Mute alerts" : "Unmute alerts"}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>

        <button
          onClick={() => setShowPanel(!showPanel)}
          className={`relative grid h-8 w-8 place-items-center rounded-md transition-colors ${
            showPanel ? "bg-accent text-primary" : "text-foreground/80 hover:bg-accent/60"
          }`}
        >
          <Bell className="h-4 w-4" strokeWidth={2} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#DC3030] px-1 text-[9px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          <div className="absolute right-0 mt-2 w-[380px] origin-top-right rounded-xl border border-border bg-[var(--surface-2)] shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold uppercase tracking-wider text-foreground">Alerts</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-[#DC3030] px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
              <span 
                className="text-[10px] font-medium text-primary hover:underline cursor-pointer"
                onClick={() => alerts.filter(a => !a.acknowledged).forEach(a => acknowledgeAlert(a.id))}
              >
                Acknowledge all
              </span>
            </div>

            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 p-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                  <span className="text-[12px] text-muted-foreground">No alerts yet</span>
                  <span className="text-[10px] text-muted-foreground/60">
                    Alerts will appear here when triggered by configured rules
                  </span>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex flex-col gap-1.5 p-3 rounded-lg transition-colors ${
                      !alert.acknowledged ? "bg-accent/20" : "opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${getSeverityColor(alert.severity)}`} />
                        <span className="text-[13px] font-semibold text-foreground truncate">{alert.title}</span>
                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase ${getSeverityBadge(alert.severity)}`}>
                          {alert.severity}
                        </span>
                      </div>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="shrink-0 grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title="Acknowledge"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground pl-4">{alert.message}</p>
                    <div className="flex items-center justify-between pl-4">
                      {alert.employee_name && (
                        <span className="text-[10px] font-medium text-muted-foreground/70">
                          👤 {alert.employee_name}
                        </span>
                      )}
                      <span className="text-[10px] font-medium text-muted-foreground/60">
                        {new Date(alert.triggered_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-border p-2">
              <a
                href="/dashboard/alert-settings"
                className="block w-full rounded-lg py-2 text-center text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
              >
                Configure alert rules
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
