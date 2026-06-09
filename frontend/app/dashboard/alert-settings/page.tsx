"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import {
  Bell,
  Save,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Smartphone,
  Mail,
  RefreshCw,
  Zap,
  Ban,
  Target,
  ThumbsDown,
} from "lucide-react";

interface AlertRule {
  id: string;
  name: string;
  type: string;
  entity_type: string;
  entity_id: string;
  org_id: string;
  enabled: boolean;
  threshold_ms: number;
  threshold_pct: number;
  severity: string;
  notify_via: string[];
  created_at: string;
  updated_at: string;
}

const ruleIcons: Record<string, React.ElementType> = {
  continuous_activity: Activity,
  idle: Ban,
  low_score: Target,
  no_deep_work: Zap,
  social_media: Smartphone,
  unproductive: ThumbsDown,
};

function formatMs(ms: number): string {
  if (ms >= 3600000) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const m = Math.floor(ms / 60000);
  return `${m}m`;
}

function formatMsToInput(ms: number): string {
  const m = Math.floor(ms / 60000);
  return String(m);
}

function inputToMs(minutes: string): number {
  const m = parseInt(minutes, 10);
  if (isNaN(m) || m < 1) return 60000;
  return m * 60000;
}

const ruleDescriptions: Record<string, string> = {
  continuous_activity: "Alert when an employee has been continuously active without breaks for too long (potential mouse jiggler or overwork).",
  idle: "Alert when an employee has been idle for an extended period.",
  low_score: "Alert when an employee's productivity score drops below the configured percentage threshold.",
  no_deep_work: "Alert when an employee has no deep work sessions logged for an entire day.",
  social_media: "Alert when social media / leisure usage exceeds the configured time limit.",
  unproductive: "Alert when an employee spends excessive time on unproductive or non-work apps/websites.",
};

interface EditingRule {
  id: string;
  enabled: boolean;
  threshold_ms: number;
  threshold_pct: number;
}

export default function AlertSettingsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [error, setError] = useState("");
  const [editingRules, setEditingRules] = useState<Map<string, EditingRule>>(new Map());
  const { authHeaders } = useAuth();

  const fetchRules = useCallback(async () => {
    try {
      const headers: HeadersInit = authHeaders ? (authHeaders as HeadersInit) : {};
      const res = await fetch("/api/rules", { headers });
      if (!res.ok) throw new Error("Failed to fetch rules");
      const data = await res.json();
      if (data.success && data.data) {
        setRules(data.data);
        const map = new Map<string, EditingRule>();
        data.data.forEach((r: AlertRule) => {
          map.set(r.id, {
            id: r.id,
            enabled: r.enabled,
            threshold_ms: r.threshold_ms,
            threshold_pct: r.threshold_pct,
          });
        });
        setEditingRules(map);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleToggle = (ruleId: string) => {
    setEditingRules(prev => {
      const next = new Map(prev);
      const r = next.get(ruleId);
      if (r) next.set(ruleId, { ...r, enabled: !r.enabled });
      return next;
    });
  };

  const handleMsChange = (ruleId: string, value: string) => {
    setEditingRules(prev => {
      const next = new Map(prev);
      const r = next.get(ruleId);
      if (r) next.set(ruleId, { ...r, threshold_ms: inputToMs(value) });
      return next;
    });
  };

  const handlePctChange = (ruleId: string, value: string) => {
    const pct = parseInt(value, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    setEditingRules(prev => {
      const next = new Map(prev);
      const r = next.get(ruleId);
      if (r) next.set(ruleId, { ...r, threshold_pct: pct });
      return next;
    });
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setError("");
    setSuccessMsg("");
    let hasError = false;

    for (const [, edit] of editingRules) {
      const original = rules.find(r => r.id === edit.id);
      if (!original) continue;
      if (original.enabled === edit.enabled && original.threshold_ms === edit.threshold_ms && original.threshold_pct === edit.threshold_pct) continue;

      try {
        const headers: HeadersInit = authHeaders ? { ...(authHeaders as HeadersInit), "Content-Type": "application/json" } : { "Content-Type": "application/json" };
        const res = await fetch(`/api/rules/${edit.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            ...original,
            enabled: edit.enabled,
            threshold_ms: edit.threshold_ms,
            threshold_pct: edit.threshold_pct,
          }),
        });
        if (!res.ok) throw new Error(`Failed to update ${original.name}`);
      } catch (err) {
        hasError = true;
        setError(err instanceof Error ? err.message : "Update failed");
      }
    }

    setSaving(false);
    if (!hasError) {
      setSuccessMsg("All alert rules updated successfully");
      fetchRules();
      setTimeout(() => setSuccessMsg(""), 3000);
    }
  };

  // Group rules by type for display
  const ruleTypes = [...new Set(rules.map(r => r.type))];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-52px)]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-[12px] text-muted-foreground">Loading alert rules...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Bell className="h-4 w-4" strokeWidth={2} />
          <span className="text-[11px] font-semibold uppercase tracking-wider">System</span>
        </div>
        <h1 className="text-[22px] font-bold text-foreground">Alert Rules</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Configure notification triggers for employee productivity monitoring. Changes take effect within 60 seconds.
        </p>
      </div>

      {/* Success / Error messages */}
      {successMsg && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[13px] font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
          {successMsg}
        </div>
      )}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
          <AlertTriangle className="h-4 w-4" strokeWidth={2} />
          {error}
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-4">
        {ruleTypes.map((type) => {
          const typeRules = rules.filter(r => r.type === type);
          if (typeRules.length === 0) return null;
          const Icon = ruleIcons[type] || Bell;
          const description = ruleDescriptions[type] || "";
          const primaryRule = typeRules[0];
          const editData = editingRules.get(primaryRule.id);

          return (
            <div
              key={type}
              className="rounded-xl border border-border bg-[var(--surface-2)] overflow-hidden"
            >
              {/* Rule header */}
              <div className="flex items-start sm:items-center justify-between border-b border-border px-4 sm:px-5 py-3 sm:py-4 gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="grid h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 place-items-center rounded-lg bg-accent/40">
                    <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${editData?.enabled ? "text-foreground" : "text-muted-foreground/50"}`} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-[13px] sm:text-[14px] font-bold truncate ${editData?.enabled ? "text-foreground" : "text-muted-foreground/60"}`}>{primaryRule.name}</h3>
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground/70 font-mono truncate block">{type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
                  <span className="hidden sm:inline text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-green-600">{editData?.enabled ? "Active" : "Off"}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editData?.enabled}
                    onClick={() => handleToggle(primaryRule.id)}
                    className={`relative inline-flex h-5 w-9 sm:h-6 sm:w-10 items-center rounded-full transition-all duration-200 flex-shrink-0 cursor-pointer ${
                      editData?.enabled
                        ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]"
                        : "bg-muted-foreground/25"
                    }`}
                  >
                    <span
                      className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow-md transition-all duration-200 ${
                        editData?.enabled ? "left-[calc(100%-18px)] sm:left-[calc(100%-22px)]" : "left-[2px]"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Rule body */}
              <div className="px-5 py-4 space-y-4">
                <p className="text-[12px] leading-relaxed text-muted-foreground">{description}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Time threshold (for time-based rules) */}
                  {(type === "continuous_activity" || type === "idle" || type === "social_media" || type === "unproductive") && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Time Threshold
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="1440"
                          value={editData ? formatMsToInput(editData.threshold_ms) : "60"}
                          onChange={(e) => handleMsChange(primaryRule.id, e.target.value)}
                          className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-[13px] text-foreground text-center font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                          disabled={!editData?.enabled}
                        />
                        <span className="text-[11px] text-muted-foreground">minutes</span>
                      </div>
                    </div>
                  )}

                  {/* Percentage threshold (for score-based rules) */}
                  {type === "low_score" && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Score Below
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={editData?.threshold_pct ?? 40}
                          onChange={(e) => handlePctChange(primaryRule.id, e.target.value)}
                          className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-[13px] text-foreground text-center font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                          disabled={!editData?.enabled}
                        />
                        <span className="text-[11px] text-muted-foreground">%</span>
                      </div>
                    </div>
                  )}

                  {/* Notification channels */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Deliver Via
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Bell className="h-3.5 w-3.5" strokeWidth={2} />
                        In-App
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Smartphone className="h-3.5 w-3.5" strokeWidth={2} />
                        Push
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" strokeWidth={2} />
                        Email
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60">
                      In-app and push are always sent. Email digest coming soon.
                    </span>
                  </div>
                </div>

                {/* Current value summary */}
                {type === "continuous_activity" && (
                  <div className="rounded-lg bg-accent/20 px-3 py-2 text-[11px] text-muted-foreground">
                    Deployed by: <span className="font-medium text-foreground/80">test-v2.teamlens.co</span>
                    {" · "}Severity: <span className="font-medium text-amber-600">{primaryRule.severity}</span>
                    {" · "}Scope: <span className="font-medium">{primaryRule.entity_type}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="mt-8 flex items-center justify-between rounded-xl border border-border bg-[var(--surface-2)] px-5 py-4">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
          Changes apply within 60 seconds (engine check cycle)
        </div>
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2} />
          ) : (
            <Save className="h-4 w-4" strokeWidth={2} />
          )}
          {saving ? "Saving..." : "Save All Changes"}
        </button>
      </div>
    </div>
  );
}
