"use client";

import { useState } from "react";
import { CircleHelp } from "lucide-react";

export type ActivityTimelineSegment = {
  start: string;
  end: string;
  kind: "active" | "idle";
  mouseMoves: number;
  keyPresses: number;
};

export type DailyActivityBar = {
  key: string;
  label: string;
  activeSeconds: number;
  idleSeconds: number;
  breakSeconds: number;
  manualSeconds: number;
};

export type UtilizationTotals = {
  productiveSeconds: number;
  neutralSeconds: number;
  unproductiveSeconds: number;
};

const toFiniteSeconds = (value: unknown) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : 0;
};

const formatChartDuration = (seconds = 0) => {
  const total = Math.max(0, Math.round(toFiniteSeconds(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} h`;
};

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const splitSegmentByDay = (segment: ActivityTimelineSegment, rangeStart: Date, rangeEnd: Date) => {
  const pieces: Array<{ key: string; kind: ActivityTimelineSegment["kind"]; seconds: number }> = [];
  let cursorMs = Math.max(new Date(segment.start).getTime(), rangeStart.getTime());
  const segmentEndMs = Math.min(new Date(segment.end).getTime(), rangeEnd.getTime());
  if (!Number.isFinite(cursorMs) || !Number.isFinite(segmentEndMs) || segmentEndMs <= cursorMs) return pieces;

  while (cursorMs < segmentEndMs) {
    const cursor = new Date(cursorMs);
    const nextDay = new Date(cursor);
    nextDay.setHours(24, 0, 0, 0);
    const sliceEndMs = Math.min(segmentEndMs, nextDay.getTime());
    pieces.push({
      key: dateKey(cursor),
      kind: segment.kind,
      seconds: Math.max(0, Math.round((sliceEndMs - cursorMs) / 1000)),
    });
    cursorMs = sliceEndMs;
  }

  return pieces;
};

export const buildDailyActivityBars = (
  segments: ActivityTimelineSegment[],
  rangeStart: Date,
  rangeEnd: Date,
  manualSeconds = 0,
): DailyActivityBar[] => {
  const bars: DailyActivityBar[] = [];
  const byKey = new Map<string, DailyActivityBar>();
  const start = new Date(rangeStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setHours(0, 0, 0, 0);

  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setDate(cursor.getDate() + 1)) {
    const key = dateKey(cursor);
    const item: DailyActivityBar = {
      key,
      label: cursor.toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
      activeSeconds: 0,
      idleSeconds: 0,
      breakSeconds: 0,
      manualSeconds: 0,
    };
    bars.push(item);
    byKey.set(key, item);
  }

  for (const segment of segments) {
    for (const piece of splitSegmentByDay(segment, rangeStart, rangeEnd)) {
      const bar = byKey.get(piece.key);
      if (!bar) continue;
      if (piece.kind === "active") bar.activeSeconds += piece.seconds;
      if (piece.kind === "idle") bar.idleSeconds += piece.seconds;
    }
  }

  if (bars.length > 0 && manualSeconds > 0) {
    bars[0]!.manualSeconds = manualSeconds;
  }

  return bars;
};

function EmployeeUtilizationChart({ totals, label }: { totals: UtilizationTotals; label: string }) {
  const totalSeconds = totals.productiveSeconds + totals.neutralSeconds + totals.unproductiveSeconds;
  const scaleSeconds = totalSeconds <= 3600 ? 3600 : totalSeconds <= 3 * 3600 ? 3 * 3600 : totalSeconds <= 6 * 3600 ? 6 * 3600 : 12 * 3600;
  const yTicks = [scaleSeconds, scaleSeconds * 0.75, scaleSeconds * 0.5, scaleSeconds * 0.25, 0];
  const productiveHeight = Math.min(100, (totals.productiveSeconds / scaleSeconds) * 100);
  const unproductiveHeight = Math.min(100 - productiveHeight, (totals.unproductiveSeconds / scaleSeconds) * 100);
  const neutralHeight = Math.min(100 - productiveHeight - unproductiveHeight, (totals.neutralSeconds / scaleSeconds) * 100);
  const formatTick = (seconds: number) => {
    if (seconds === 0) return "0";
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Number.isInteger(seconds / 3600) ? seconds / 3600 : (seconds / 3600).toFixed(1)}h`;
  };

  return (
    <div>
      <div className="grid grid-cols-[52px_1fr]">
        <div className="relative h-[260px] text-right text-[12px] font-medium text-[#7E6F65]">
          {yTicks.map((tick) => (
            <span
              key={tick}
              className={`absolute right-3 ${tick === scaleSeconds ? "translate-y-0" : tick === 0 ? "-translate-y-full" : "-translate-y-1/2"}`}
              style={{ top: `${((scaleSeconds - tick) / scaleSeconds) * 100}%` }}
            >
              {formatTick(tick)}
            </span>
          ))}
        </div>
        <div className="relative h-[260px]">
          {yTicks.map((tick) => (
            <span
              key={tick}
              className={`absolute left-0 right-0 border-t ${tick === 0 ? "border-dashed border-brand" : "border-[#E7DED6]"}`}
              style={{ top: `${((scaleSeconds - tick) / scaleSeconds) * 100}%` }}
            />
          ))}
          {totalSeconds <= 0 ? (
            <div className="absolute inset-0 grid place-items-center text-[13px] font-medium text-[#9A9088]">No utilization data for this range.</div>
          ) : (
            <div className="absolute inset-x-16 bottom-0 top-0 flex items-end">
              <div className="relative h-full w-full overflow-hidden border border-[#DDD2C9] bg-white">
                <div className="absolute bottom-0 left-0 right-0 bg-[#24C98B]" style={{ height: `${productiveHeight}%` }} />
                <div className="absolute left-0 right-0 bg-[#F47C8E]" style={{ bottom: `${productiveHeight}%`, height: `${unproductiveHeight}%` }} />
                <div className="absolute left-0 right-0 bg-[#D7DDE8]" style={{ bottom: `${productiveHeight + unproductiveHeight}%`, height: `${neutralHeight}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-[52px_1fr]">
        <div />
        <div className="mt-3 text-center text-[12px] font-medium text-[#7E6F65]">{label}</div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px] text-[#7E6F65]">
        {[
          ["bg-[#24C98B]", "Productive Time", totals.productiveSeconds],
          ["bg-[#F47C8E]", "Unproductive Time", totals.unproductiveSeconds],
          ["bg-[#D7DDE8]", "Neutral Time", totals.neutralSeconds],
        ].map(([className, itemLabel, seconds]) => (
          <span key={itemLabel as string} className="inline-flex items-center gap-3">
            <span className={`inline-block h-5 w-5 rounded-full ${className}`} />
            {itemLabel}
            <span className="font-medium text-[#171717]">{formatChartDuration(seconds as number)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ActivityTimelineChart({
  bars,
  utilization,
  rangeLabel,
  title = "Activity Timeline",
  description = "Activity and utilization insights for the selected range.",
}: {
  bars: DailyActivityBar[];
  utilization: UtilizationTotals;
  rangeLabel: string;
  title?: string;
  description?: string;
}) {
  const [chartTab, setChartTab] = useState<"activities" | "utilization">("activities");
  const [viewMode, setViewMode] = useState<"24h" | "12h" | "10h">("24h");
  const [hover, setHover] = useState<{ bar: DailyActivityBar; x: number; y: number; left: number } | null>(null);
  
  const isSingleDay = bars.length <= 1;
  
  // Determine label count and chart scaling based on view mode
  let chartMaxSeconds: number;
  let chartMaxHours: number;
  let yTicks: number[];
  let labelStep: number;
  
  switch (viewMode) {
    case "24h":
      chartMaxSeconds = isSingleDay ? 24 * 3600 : 12 * 3600;
      chartMaxHours = chartMaxSeconds / 3600;
      yTicks = isSingleDay ? [24, 18, 12, 6, 0] : [12, 9, 6, 3, 0];
      labelStep = Math.max(1, Math.ceil(bars.length / 8)); // 8 labels
      break;
    case "12h":
      chartMaxSeconds = isSingleDay ? 12 * 3600 : 6 * 3600;
      chartMaxHours = chartMaxSeconds / 3600;
      yTicks = isSingleDay ? [12, 9, 6, 3, 0] : [6, 4.5, 3, 1.5, 0];
      labelStep = Math.max(1, Math.ceil(bars.length / 6)); // 6 labels
      break;
    case "10h":
      chartMaxSeconds = isSingleDay ? 10 * 3600 : 5 * 3600;
      chartMaxHours = chartMaxSeconds / 3600;
      yTicks = isSingleDay ? [10, 7.5, 5, 2.5, 0] : [5, 3.75, 2.5, 1.25, 0];
      labelStep = Math.max(1, Math.ceil(bars.length / 5)); // 5 labels
      break;
    default:
      chartMaxSeconds = isSingleDay ? 24 * 3600 : 12 * 3600;
      chartMaxHours = chartMaxSeconds / 3600;
      yTicks = isSingleDay ? [24, 18, 12, 6, 0] : [12, 9, 6, 3, 0];
      labelStep = Math.max(1, Math.ceil(bars.length / 8));
  }

  return (
    <section className="rounded-xl border border-[#DDD2C9] bg-white p-5">
      <div className="mb-5 flex flex-col gap-3 border-b border-[#EFE8E2] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-medium text-[#171717]">{title}</h3>
          <p className="mt-1 text-[12px] text-[#7E6F65]">{description}</p>
        </div>
        <div className="flex flex-col gap-2">
          {/* Chart Tab Buttons */}
          <div className="inline-flex h-9 w-fit overflow-hidden rounded-xl border border-[#E1D7CE] bg-white">
            {[
              ["activities", "Activities"],
              ["utilization", "Utilization"],
            ].map(([id, itemLabel]) => (
              <button
                key={id}
                type="button"
                onClick={() => setChartTab(id as "activities" | "utilization")}
                className={`px-4 text-[13px] font-medium transition ${
                  chartTab === id ? "bg-[#FCE8E1] text-brand" : "text-[#7E6F65] hover:bg-[#FCFAF8] hover:text-[#171717]"
                }`}
              >
                {itemLabel}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Section */}
      {chartTab === "utilization" ? (
        <EmployeeUtilizationChart totals={utilization} label={rangeLabel} />
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[52px_1fr]">
                <div className="relative h-[260px]">
                  {yTicks.map((tick) => (
                    <span
                      key={tick}
                      className={`absolute right-3 text-[12px] font-medium text-[#7E6F65] ${
                        tick === chartMaxHours ? "translate-y-0" : tick === 0 ? "-translate-y-full" : "-translate-y-1/2"
                      }`}
                      style={{ top: `${((chartMaxHours - tick) / chartMaxHours) * 100}%` }}
                    >
                      {tick === 0 ? "0" : `${tick}h`}
                    </span>
                  ))}
                </div>
                <div className="relative h-[260px]">
                  {yTicks.map((tick) => (
                    <span
                      key={tick}
                      className={`absolute left-0 right-0 border-t ${tick === 0 ? "border-dashed border-brand" : "border-[#E7DED6]"}`}
                      style={{ top: `${((chartMaxHours - tick) / chartMaxHours) * 100}%` }}
                    />
                  ))}
                  {hover ? <span className="pointer-events-none absolute top-0 z-20 h-full border-l border-dashed border-[#BDB6AE]" style={{ left: `${hover.left}%` }} /> : null}
                  <div className={`absolute inset-x-0 bottom-0 top-0 flex items-end px-2 ${isSingleDay ? "justify-center" : "gap-3"}`}>
                    {bars.map((bar, index) => {
                      const activeHeight = Math.min(100, (bar.activeSeconds / chartMaxSeconds) * 100);
                      const idleHeight = Math.min(100 - activeHeight, (bar.idleSeconds / chartMaxSeconds) * 100);
                      const left = ((index + 0.5) / Math.max(bars.length, 1)) * 100;
                      return (
                        <div
                          key={bar.key}
                          className={`relative flex h-full items-end justify-center ${isSingleDay ? "w-[82%]" : "flex-1"}`}
                          onMouseEnter={(event) => setHover({ bar, x: event.clientX, y: event.clientY, left })}
                          onMouseMove={(event) => setHover({ bar, x: event.clientX, y: event.clientY, left })}
                          onMouseLeave={() => setHover(null)}
                        >
                          <div className={`relative w-full ${isSingleDay ? "max-w-none" : "max-w-[38px]"}`}>
                            <div className="absolute bottom-0 left-0 right-0 bg-brand/60" style={{ height: `${activeHeight * 2.6}px` }} />
                            <div
                              className="absolute left-0 right-0 border border-[#DDD2C9] bg-white [background-image:repeating-linear-gradient(135deg,transparent,transparent_2px,#DDD2C9_2px,#DDD2C9_4px)]"
                              style={{ bottom: `${activeHeight * 2.6}px`, height: `${idleHeight * 2.6}px` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[52px_1fr]">
                <div />
                <div className="mt-3 flex px-2">
                  {bars.map((bar, index) => (
                    <div key={bar.key} className={`flex-1 ${isSingleDay ? "text-center" : "text-left"}`}>
                      {index % labelStep === 0 ? <span className="text-[12px] font-semibold text-[#4A5568]">{bar.label}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {hover ? (
              <div
                className="pointer-events-none fixed z-[120] border border-[#D2CCC5] bg-white px-3 py-2 text-[#302C28] shadow-[0_4px_14px_rgba(39,34,30,0.18)]"
                style={{ left: Math.max(12, Math.min(hover.x + 12, window.innerWidth - 170)), top: Math.max(12, hover.y - 92) }}
              >
                <p className="mb-2 text-[12px] font-medium">{hover.bar.label}</p>
                {[
                  ["bg-brand", hover.bar.activeSeconds],
                  ["bg-[#F8B84E]", hover.bar.breakSeconds],
                  ["border border-[#F8A51B] bg-[#FFF5DE]", hover.bar.manualSeconds],
                  ["border border-[#FF9A51] bg-white [background-image:repeating-linear-gradient(135deg,transparent,transparent_2px,#FF9A51_2px,#FF9A51_4px)]", 0],
                  ["border border-[#DDD2C9] bg-white [background-image:repeating-linear-gradient(135deg,transparent,transparent_2px,#DDD2C9_2px,#DDD2C9_4px)]", hover.bar.idleSeconds],
                ].map(([className, value], index) => (
                  <div key={index} className="grid grid-cols-[14px_auto] items-center gap-2 text-[12px]">
                    <span className={`h-3 w-3 ${className}`} />
                    <span className="font-semibold">{formatChartDuration(value as number)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px] text-[#7E6F65]">
            {[
              ["bg-brand", "Active Time"],
              ["bg-[#F8B84E]", "Break Time"],
              ["border border-[#F8A51B] bg-[#FFF5DE]", "Manual Time"],
              ["border border-[#FF9A51] bg-white [background-image:repeating-linear-gradient(135deg,transparent,transparent_2px,#FF9A51_2px,#FF9A51_4px)]", "Manual Time in Processing"],
              ["border border-[#DDD2C9] bg-white [background-image:repeating-linear-gradient(135deg,transparent,transparent_2px,#DDD2C9_2px,#DDD2C9_4px)]", "Idle Time"],
            ].map(([className, itemLabel]) => (
              <span key={itemLabel} className="inline-flex items-center gap-3">
                <span className={`inline-block h-5 w-5 ${className}`} />
                {itemLabel}
                <CircleHelp className="h-4 w-4 fill-[#AAB3BE] text-white" />
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
