"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Clock, Activity, Target,
  Image as ImageIcon, AlertCircle
} from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";

type DayData = {
  date: string;
  workSeconds: number;
  activeSeconds: number;
};

type WorkSession = {
  id: string;
  userId: string;
  clockInAt: string;
  clockOutAt?: string;
};

type Screenshot = {
  id: string;
  userId: string;
  capturedAt: string;
};

type DayDetail = {
  date: string;
  workSeconds: number;
  activeSeconds: number;
  productivityPercent: number;
  sessions: WorkSession[];
  screenshots: Screenshot[];
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmtFull = (seconds: number): string => {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const fmtShort = (seconds: number): string => {
  if (seconds === 0) return "0h";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const fmtTime = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
};

const sessionDuration = (s: WorkSession, dayEnd: Date): number => {
  const start = new Date(s.clockInAt);
  const end = s.clockOutAt ? new Date(s.clockOutAt) : dayEnd;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
};

const intensityClass = (workSec: number): string => {
  const h = workSec / 3600;
  if (h === 0) return "";
  if (h < 2) return "bg-indigo-100 text-indigo-700";
  if (h < 4) return "bg-indigo-200 text-indigo-800";
  if (h < 6) return "bg-indigo-400 text-white";
  if (h < 8) return "bg-indigo-600 text-white";
  return "bg-indigo-700 text-white";
};

export default function CalendarView() {
  const { authHeaders, apiBase, selectedUserId } = useAuth();

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [heatmap, setHeatmap] = useState<Map<string, DayData>>(new Map());
  const [heatmapLoading, setHeatmapLoading] = useState(true);

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // ── fetch monthly heatmap ────────────────────────────────────────────────
  const fetchHeatmap = useCallback(async () => {
    if (!authHeaders || !selectedUserId) return;
    setHeatmapLoading(true);
    try {
      const p = new URLSearchParams({ userId: selectedUserId, year: String(viewYear), month: String(viewMonth) });
      const res = await fetch(`${apiBase}/api/web/dashboard/calendar?${p}`, {
        headers: authHeaders,
        credentials: "include",
      });
      const json = await res.json();
      const map = new Map<string, DayData>();
      if (json.success) for (const d of json.data as DayData[]) map.set(d.date, d);
      setHeatmap(map);
    } catch { /* silent */ } finally {
      setHeatmapLoading(false);
    }
  }, [authHeaders, apiBase, selectedUserId, viewYear, viewMonth]);

  useEffect(() => { void fetchHeatmap(); }, [fetchHeatmap]);

  // ── fetch day detail ─────────────────────────────────────────────────────
  const fetchDetail = useCallback(async (dateKey: string) => {
    if (!authHeaders || !selectedUserId) return;
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);

    try {
      const dayStart = new Date(dateKey + "T00:00:00.000Z").toISOString();
      const dayEnd   = new Date(dateKey + "T23:59:59.999Z").toISOString();

      const [analyticsRes, screenshotsRes] = await Promise.all([
        fetch(
          `${apiBase}/api/web/dashboard/analytics?${new URLSearchParams({ userId: selectedUserId, startDate: dayStart, endDate: dayEnd })}`,
          { headers: authHeaders, credentials: "include" }
        ),
        fetch(
          `${apiBase}/api/agent/screenshots?${new URLSearchParams({ userId: selectedUserId, startDate: dayStart, endDate: dayEnd, limit: "50" })}`,
          { headers: authHeaders, credentials: "include" }
        ),
      ]);

      const analyticsJson = await analyticsRes.json();
      const screenshotsJson = await screenshotsRes.json();

      setDetail({
        date: dateKey,
        workSeconds: analyticsJson.data?.workSeconds ?? 0,
        activeSeconds: analyticsJson.data?.activeSeconds ?? 0,
        productivityPercent: analyticsJson.data?.productivityPercent ?? 0,
        sessions: analyticsJson.data?.sessions ?? [],
        screenshots: screenshotsJson.data ?? [],
      });
    } catch {
      setDetailError("Failed to load data for this date.");
    } finally {
      setDetailLoading(false);
    }
  }, [authHeaders, apiBase, selectedUserId]);

  const handleDayClick = (dateKey: string) => {
    if (dateKey > todayKey) return;
    setSelectedDateKey(dateKey);
    void fetchDetail(dateKey);
  };

  // ── navigation ───────────────────────────────────────────────────────────
  const prevMonth = () => viewMonth === 1 ? (setViewMonth(12), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 12 ? (setViewMonth(1), setViewYear(y => y + 1)) : setViewMonth(m => m + 1);

  // ── grid maths ───────────────────────────────────────────────────────────
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay();
  const leadingEmpties = (firstDow + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

  // monthly totals
  let monthWork = 0, monthActive = 0, activeDays = 0;
  for (const d of heatmap.values()) { monthWork += d.workSeconds; monthActive += d.activeSeconds; if (d.workSeconds > 0) activeDays++; }

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── CALENDAR CARD ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-medium text-slate-900">{MONTHS[viewMonth - 1]} {viewYear}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{activeDays} active day{activeDays !== 1 ? "s" : ""} this month</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <button onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth() + 1); }} className="px-4 py-1.5 text-sm font-medium rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-700">
              Today
            </button>
            <button onClick={nextMonth} disabled={viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors disabled:opacity-30">
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>

        {/* monthly summary strip */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 bg-slate-50/60">
          {[
            { label: "Total Work", value: fmtFull(monthWork) },
            { label: "Active Time", value: fmtFull(monthActive) },
            { label: "Avg / Active Day", value: activeDays > 0 ? fmtShort(Math.floor(monthWork / activeDays)) : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="px-6 py-4">
              <p className="text-xs font-medium text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-medium text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        {/* grid */}
        <div className="p-6">
          <div className="grid grid-cols-7 mb-2">
            {DAY_LABELS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
            ))}
          </div>

          {heatmapLoading ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Loading calendar…</div>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: leadingEmpties }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateKey = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const data = heatmap.get(dateKey);
                const isFuture = dateKey > todayKey;
                const isToday = dateKey === todayKey;
                const isSelected = selectedDateKey === dateKey;
                const cls = data ? intensityClass(data.workSeconds) : "";

                return (
                  <button
                    key={dateKey}
                    onClick={() => handleDayClick(dateKey)}
                    disabled={isFuture}
                    className={[
                      "relative aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-medium transition-all select-none",
                      isFuture ? "opacity-25 cursor-not-allowed" : "cursor-pointer hover:scale-105 hover:shadow-md",
                      isSelected ? "ring-2 ring-indigo-600 ring-offset-2 scale-105" : "",
                      cls || (isToday ? "ring-2 ring-slate-300 bg-slate-50 text-slate-600" : "bg-slate-50 text-slate-400"),
                    ].join(" ")}
                  >
                    <span className="text-sm font-medium leading-none">{day}</span>
                    {data && data.workSeconds > 0 && (
                      <span className="text-[9px] font-medium opacity-80 mt-0.5 leading-tight">{fmtShort(data.workSeconds)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* legend */}
          <div className="flex items-center gap-3 mt-5 justify-end">
            <span className="text-xs text-slate-400 mr-1">Hours worked:</span>
            {[
              ["< 2h", "bg-indigo-100"], ["< 4h", "bg-indigo-200"],
              ["< 6h", "bg-indigo-400"], ["< 8h", "bg-indigo-600"], ["8h+", "bg-indigo-700"],
            ].map(([label, bg]) => (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded-sm ${bg}`} />
                <span className="text-xs text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DAY DETAIL PANEL ──────────────────────────────────────────── */}
      {selectedDateKey && (
        <div className="space-y-4">
          {/* date heading */}
          <div className="flex items-center justify-between">
            <h3 className="text-base font-medium text-slate-800">
              {new Date(selectedDateKey + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </h3>
            <button onClick={() => { setSelectedDateKey(null); setDetail(null); }} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Clear
            </button>
          </div>

          {detailLoading && (
            <div className="bg-white rounded-[24px] border border-slate-200 py-12 text-center text-sm text-slate-400">
              Loading data for this day…
            </div>
          )}

          {detailError && !detailLoading && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 rounded-xl p-4 text-sm">
              <AlertCircle className="h-4 w-4" /> {detailError}
            </div>
          )}

          {detail && !detailLoading && (
            <>
              {/* stat cards */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: Clock, iconCls: "text-indigo-600", bg: "bg-indigo-50", label: "Work Time", value: fmtFull(detail.workSeconds) },
                  { icon: Activity, iconCls: "text-emerald-600", bg: "bg-emerald-50", label: "Active Time", value: fmtFull(detail.activeSeconds) },
                  { icon: Target, iconCls: "text-amber-600", bg: "bg-amber-50", label: "Productivity", value: `${detail.productivityPercent}%` },
                ].map(({ icon: Icon, iconCls, bg, label, value }) => (
                  <div key={label} className="bg-white rounded-[22px] border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-[16px] ${bg} flex items-center justify-center`}>
                      <Icon className={`h-6 w-6 ${iconCls}`} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400">{label}</p>
                      <p className="mt-0.5 text-xl font-medium text-slate-900">{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* sessions table */}
              <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-indigo-500" />
                  <h4 className="text-sm font-medium text-slate-800">Sessions</h4>
                  <span className="ml-auto text-xs text-slate-400">{detail.sessions.length} session{detail.sessions.length !== 1 ? "s" : ""}</span>
                </div>
                {detail.sessions.length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-slate-400">No work sessions found.</p>
                ) : (
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                      <tr>
                        {["Clock In", "Clock Out", "Duration", "Status"].map(h => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {detail.sessions.map(s => {
                        const dayEnd = new Date(selectedDateKey + "T23:59:59.999Z");
                        return (
                          <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3 text-sm text-slate-700 font-mono">{fmtTime(s.clockInAt)}</td>
                            <td className="px-5 py-3 text-sm text-slate-700 font-mono">{fmtTime(s.clockOutAt)}</td>
                            <td className="px-5 py-3 text-sm text-slate-700 font-mono">{fmtFull(sessionDuration(s, dayEnd))}</td>
                            <td className="px-5 py-3">
                              {s.clockOutAt
                                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">Completed</span>
                                : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Active</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* screenshots grid */}
              <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-indigo-500" />
                  <h4 className="text-sm font-medium text-slate-800">Screenshots</h4>
                  <span className="ml-auto text-xs text-slate-400">{detail.screenshots.length} captured</span>
                </div>
                {detail.screenshots.length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-slate-400">No screenshots captured on this day.</p>
                ) : (
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {detail.screenshots.map(sc => (
                      <a
                        key={sc.id}
                        href={`${apiBase}/api/agent/screenshots/${sc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block overflow-hidden rounded-[14px] bg-slate-900 border border-slate-200 hover:shadow-lg transition-all hover:scale-[1.02]"
                      >
                        <div className="aspect-[16/10] overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`${apiBase}/api/agent/screenshots/${sc.id}`}
                            alt="Screenshot"
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-2 bg-white">
                          <p className="text-xs text-slate-500 font-medium">
                            {new Date(sc.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
