"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

interface TimeRangeSliderProps {
  startHour: number;
  endHour: number;
  onChange: (start: number, end: number) => void;
}

const formatHourLabel = (h: number) => {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
};

export default function TimeRangeSlider({ startHour, endHour, onChange }: TimeRangeSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeThumb, setActiveThumb] = useState<"start" | "end" | null>(null);

  const getHourFromX = useCallback((clientX: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(percentage * 24);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!activeThumb) return;
      const hour = getHourFromX(e.clientX);
      
      if (activeThumb === "start") {
        onChange(Math.min(hour, endHour - 1), endHour);
      } else {
        onChange(startHour, Math.max(hour, startHour + 1));
      }
    },
    [activeThumb, endHour, getHourFromX, onChange, startHour]
  );

  const handleMouseUp = useCallback(() => {
    setActiveThumb(null);
  }, []);

  useEffect(() => {
    if (activeThumb) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeThumb, handleMouseMove, handleMouseUp]);

  const startPct = (startHour / 24) * 100;
  const endPct = (endHour / 24) * 100;

  return (
    <div className="w-full">
      {/* Hours Grid */}
      <div className="mb-3 flex justify-between px-0 text-[9px] font-medium text-[#7E6F65]">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((i) => (
          <div key={i} className="text-center" style={{ flex: 1 }}>
            {i === 0 ? '12A' : i === 12 ? '12P' : i > 12 ? `${i - 12}P` : `${i}A`}
          </div>
        ))}
      </div>

      <div 
        ref={containerRef}
        className="relative h-2 w-full rounded-full bg-[#EEEAE6]"
      >
        {/* Track */}
        <div 
          className="absolute h-full bg-brand shadow-sm"
          style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
        />

        {/* Start Thumb */}
        <div 
          className={`absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-brand bg-white shadow-md transition-transform hover:scale-110 active:cursor-grabbing ${activeThumb === "start" ? "scale-110 ring-2 ring-brand/40" : ""}`}
          style={{ left: `${startPct}%` }}
          onMouseDown={(e) => {
            e.preventDefault();
            setActiveThumb("start");
          }}
        >
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-brand px-2 py-1 text-[9px] font-bold text-white shadow-sm">
            {formatHourLabel(startHour)}
            <div className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rotate-45 bg-brand" />
          </div>
        </div>

        {/* End Thumb */}
        <div 
          className={`absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-brand bg-white shadow-md transition-transform hover:scale-110 active:cursor-grabbing ${activeThumb === "end" ? "scale-110 ring-2 ring-brand/40" : ""}`}
          style={{ left: `${endPct}%` }}
          onMouseDown={(e) => {
            e.preventDefault();
            setActiveThumb("end");
          }}
        >
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-brand px-2 py-1 text-[9px] font-bold text-white shadow-sm">
            {formatHourLabel(endHour)}
            <div className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rotate-45 bg-brand" />
          </div>
        </div>
      </div>

      {/* Range Display */}
      <div className="mt-4 text-center text-[11px] font-semibold text-[#7E6F65]">
        <span className="text-brand font-bold">{formatHourLabel(startHour)} - {formatHourLabel(endHour)}</span>
      </div>
    </div>
  );
}
