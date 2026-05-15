"use client";

import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import ThemedSelect from "../../../components/ThemedSelect";

const scheduleItems = [
  { day: 4, name: "Aarav", title: "Morning Shift", type: "shift" },
  { day: 7, name: "Meera", title: "Design Review", type: "shift" },
  { day: 11, name: "Rohan", title: "Time Off", type: "time_off" },
  { day: 18, name: "Nisha", title: "Holiday", type: "holiday" },
  { day: 22, name: "Team", title: "Planning", type: "shift" },
];

const typeClass: Record<string, string> = {
  shift: "border-l-brand bg-[#FDEBE5] text-brand",
  time_off: "border-l-[#3B82F6] bg-[#EFF6FF] text-[#2457A6]",
  holiday: "border-l-[#2BAE78] bg-[#EEF9F3] text-[#1F7A55]",
};

export default function SchedulesPage() {
  const days = Array.from({ length: 35 }, (_, index) => index + 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[18px] font-semibold leading-tight text-[#302C28]">Employee Schedules</h1>
          <p className="mt-1 text-[13px] font-medium text-[#8C837B]">Planning calendar for shifts, time off, and holidays</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E1D7CE] bg-white text-[#7E6F65] transition hover:bg-[#FCFAF8] hover:text-[#302C28]" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-36 text-center text-[13px] font-medium text-[#302C28]">May 2026</span>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E1D7CE] bg-white text-[#7E6F65] transition hover:bg-[#FCFAF8] hover:text-[#302C28]" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
          <ThemedSelect
            label="Employees"
            value="all"
            onChange={() => undefined}
            minWidth={170}
            options={[
              { label: "All Employees", value: "all" },
              { label: "Aarav Sharma", value: "aarav" },
              { label: "Meera Kapoor", value: "meera" },
            ]}
          />
          <button className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-medium text-white shadow-sm shadow-brand/20 transition hover:bg-brand-dark">
            <Plus className="h-4 w-4" />
            Add Schedule
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-[#DDD2C9] bg-white p-4 shadow-[0_1px_2px_rgba(45,42,38,0.03)]">
        <div className="grid grid-cols-7 gap-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-[#9A9088]">
              {day}
            </div>
          ))}
          {days.map((day) => {
            const inMonth = day > 2 && day < 34;
            const date = inMonth ? day - 2 : day;
            const items = scheduleItems.filter((item) => item.day === date);
            return (
              <div
                key={day}
                className={`min-h-28 rounded-lg border p-2 ${inMonth ? "border-[#EFE8E2] bg-[#FFFDFB]" : "border-transparent bg-[#F1ECE7] opacity-50"}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#302C28]">{date}</span>
                  {date === 4 && <Clock className="h-3.5 w-3.5 text-brand" />}
                </div>
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <div key={`${item.day}-${item.title}`} className={`truncate rounded border-l-4 px-2 py-1 text-[11px] font-medium ${typeClass[item.type]}`}>
                      {item.name}: {item.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-[12px] font-medium text-[#8C837B]">
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-4 rounded-sm bg-[#FDEBE5] ring-1 ring-brand/30" /> Shift</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-4 rounded-sm bg-[#EFF6FF] ring-1 ring-[#BFD6FF]" /> Time Off</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-4 rounded-sm bg-[#EEF9F3] ring-1 ring-[#BFEBD3]" /> Holiday</span>
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-[#DDD2C9] bg-white p-5 shadow-[0_1px_2px_rgba(45,42,38,0.03)] md:grid-cols-[auto_1fr_auto] md:items-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FDEBE5] text-brand">
          <CalendarPlus className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[13px] font-medium text-[#302C28]">Schedule form preview</p>
          <p className="text-[12px] font-medium text-[#8C837B]">Employee, type, title, date, start time, end time, and notes.</p>
        </div>
        <button className="h-9 rounded-xl border border-[#E1D7CE] bg-white px-4 text-[13px] font-medium text-[#302C28] transition hover:bg-[#FCFAF8]">Open Form</button>
      </section>
    </div>
  );
}
