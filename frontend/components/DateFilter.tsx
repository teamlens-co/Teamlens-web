"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";

export type DateRange = {
  label: string;
  startDate: Date;
  endDate: Date;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const PRESETS = [
  "Today",
  "Yesterday",
  "This Week",
  "Last 7 Days",
  "Previous Week",
  "This Month",
  "Previous Month",
  "Last 3 Months",
  "Last 6 Months",
];

export const getPresetRange = (label: string): DateRange => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (label) {
    case "Today":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "Yesterday":
      start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);   end.setHours(23, 59, 59, 999);
      break;
    case "This Week": {
      const d = start.getDay();
      start.setDate(start.getDate() - (d === 0 ? 6 : d - 1));
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "Last 7 Days":
      start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "Previous Week": {
      const d = start.getDay();
      const mon = new Date(now);
      mon.setDate(now.getDate() - (d === 0 ? 6 : d - 1));
      end.setTime(mon.getTime() - 1);
      start.setTime(mon.getTime()); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
      break;
    }
    case "This Month":
      start.setDate(1); start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "Previous Month":
      start.setMonth(now.getMonth() - 1, 1); start.setHours(0, 0, 0, 0);
      end.setDate(0); end.setHours(23, 59, 59, 999);
      break;
    case "Last 3 Months":
      start.setMonth(now.getMonth() - 3); start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "Last 6 Months":
      start.setMonth(now.getMonth() - 6); start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    default:
      start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
  }
  return { label, startDate: start, endDate: end };
};

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const isSameDay = (a: Date, b: Date) => toDateKey(a) === toDateKey(b);

const isToday = (date: Date) => isSameDay(date, new Date());

const isFullMonth = (start: Date, end: Date) => {
  if (start.getFullYear() !== end.getFullYear() || start.getMonth() !== end.getMonth()) return false;
  const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return start.getDate() === 1 && end.getDate() === lastDay;
};

const formatMonthYear = (date: Date) =>
  `${date.toLocaleDateString(undefined, { month: "short" })}, ${date.getFullYear()}`;

const formatRangeLabel = (start: Date, end: Date) => {
  if (isToday(start) && isSameDay(start, end)) return "Today";

  if (isSameDay(start, end)) {
    return start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  if (isFullMonth(start, end)) return formatMonthYear(start);

  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const endLabel = end.toLocaleDateString(undefined, {
    ...(sameMonth ? {} : { month: "short" }),
    day: "numeric",
    year: "numeric",
  });

  return `${startLabel} - ${endLabel}`;
};

const normalizeRange = (start: Date, end: Date): DateRange => {
  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);
  rangeStart.setHours(0, 0, 0, 0);
  rangeEnd.setHours(23, 59, 59, 999);
  return {
    label: formatRangeLabel(rangeStart, rangeEnd),
    startDate: rangeStart,
    endDate: rangeEnd,
  };
};

const formatButtonDate = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const formatButtonRange = (range: DateRange) => {
  const start = range.startDate;
  const end = range.endDate;

  if (range.label === "Today" && isToday(start) && isSameDay(start, end)) {
    return { start: "Today" };
  }

  if (range.label === "Yesterday" && isSameDay(start, end)) {
    return { start: "Yesterday" };
  }

  if (isSameDay(start, end)) {
    return { start: formatButtonDate(start) };
  }

  if (isFullMonth(start, end)) {
    return { start: formatMonthYear(start) };
  }

  return {
    start: formatButtonDate(start),
    end: formatButtonDate(end),
  };
};

export default function DateFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [staged, setStaged] = useState<DateRange>(value);
  const [selectingRangeEnd, setSelectingRangeEnd] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleOpen = () => {
    setOpen((current) => {
      if (!current) {
        setStaged(value);
        setSelectingRangeEnd(false);
        setCalYear(value.startDate.getFullYear());
        setCalMonth(value.startDate.getMonth());
      }

      return !current;
    });
  };

  const apply = () => { onChange(staged); setOpen(false); };
  const cancel = () => setOpen(false);

  const selectPreset = (label: string) => {
    setSelectingRangeEnd(false);
    setStaged(getPresetRange(label));
  };

  const selectDay = (day: number) => {
    const selected = new Date(calYear, calMonth, day);
    selected.setHours(0, 0, 0, 0);

    if (!selectingRangeEnd) {
      setSelectingRangeEnd(true);
      setStaged(normalizeRange(selected, selected));
      return;
    }

    if (selected.getTime() < staged.startDate.getTime()) {
      setSelectingRangeEnd(false);
      setStaged(normalizeRange(selected, staged.startDate));
      return;
    }

    setSelectingRangeEnd(false);
    setStaged(normalizeRange(staged.startDate, selected));
  };

  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayKey = toDateKey(new Date());

  const prevCal = () => calMonth === 0 ? (setCalMonth(11), setCalYear(y => y - 1)) : setCalMonth(m => m - 1);
  const nextCal = () => calMonth === 11 ? (setCalMonth(0), setCalYear(y => y + 1)) : setCalMonth(m => m + 1);

  const stagedStartKey = toDateKey(staged.startDate);
  const stagedEndKey = toDateKey(staged.endDate);
  const buttonRange = formatButtonRange(value);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className="inline-flex h-9 items-center gap-2 rounded-sm border border-brand-dark bg-brand px-3 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(45,42,38,0.08)] transition-colors hover:bg-brand-dark"
      >
        <CalendarDays className="h-4 w-4 shrink-0" />
        <span>{buttonRange.start}</span>
        {buttonRange.end ? (
          <>
            <ArrowRight className="h-4 w-4 shrink-0" />
            <span>{buttonRange.end}</span>
          </>
        ) : null}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* POPOVER - Warm Neutral Styles */}
      {open && (
        <div className="absolute left-0 top-full z-[80] mt-2 w-[min(560px,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] origin-top-left overflow-auto rounded-lg border border-border bg-[var(--surface-2)] shadow-[0_10px_30px_rgba(45,42,38,0.10)] animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Select Period</span>
          </div>

          <div className="flex flex-col sm:flex-row">
            {/* Calendar */}
            <div className="min-w-0 flex-1 border-b border-border p-5 sm:border-b-0 sm:border-r">
              <div className="flex items-center justify-between mb-5">
                <button onClick={prevCal} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[12px] font-semibold uppercase tracking-wider text-foreground">
                  {MONTHS[calMonth]} {calYear}
                </span>
                <button onClick={nextCal} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Beginning</p>
                  <p className="mt-1 truncate text-[12px] font-medium text-foreground">
                    {staged.startDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">End</p>
                  <p className="mt-1 truncate text-[12px] font-medium text-foreground">
                    {staged.endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-7 mb-2">
                {DAY_LABELS.map((d, i) => (
                  <div key={i} className="py-1 text-center text-[10px] font-medium text-muted-foreground">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isToday = dateKey === todayKey;
                  const currentDate = new Date(calYear, calMonth, day);
                  const isRangeStart = dateKey === stagedStartKey;
                  const isRangeEnd = dateKey === stagedEndKey;
                  const isSelected = isRangeStart || isRangeEnd;
                  const isInRange = currentDate >= staged.startDate && currentDate <= staged.endDate;
                  const isFuture = dateKey > todayKey;

                  return (
                    <button
                      key={day}
                      onClick={() => !isFuture && selectDay(day)}
                      disabled={isFuture}
                      className={`
                        flex h-8 w-full items-center justify-center rounded-md text-[12px] font-medium transition-all
                        ${isFuture ? "cursor-not-allowed text-muted-foreground/35" : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"}
                        ${isInRange && !isSelected ? "bg-[var(--brand-tint)] text-primary" : ""}
                        ${isSelected ? "!bg-primary !text-primary-foreground shadow-[0_1px_2px_rgba(45,42,38,0.08)]" : ""}
                        ${isToday && !isSelected ? "border border-primary/30 text-primary" : ""}
                      `}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Presets */}
            <div className="w-full shrink-0 bg-background px-3 py-4 sm:w-48 sm:rounded-r-lg">
              <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Filters</p>
              <div className="space-y-1">
                {PRESETS.map(preset => {
                  const isActive = staged.label === preset;
                  return (
                    <button
                      key={preset}
                      onClick={() => selectPreset(preset)}
                      className={`
                        flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[12px] font-medium transition-colors
                        ${isActive ? "bg-[var(--brand-tint)] text-primary" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}
                      `}
                    >
                      {preset}
                      {isActive && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-3">
            <button
              onClick={cancel}
              className="rounded-md px-4 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              className="rounded-md bg-primary px-5 py-2 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Update View
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
