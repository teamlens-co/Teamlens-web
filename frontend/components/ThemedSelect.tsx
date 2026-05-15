"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";

export type ThemedSelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

export default function ThemedSelect({
  label,
  value,
  options,
  onChange,
  minWidth = 190,
  disabled = false,
  icon = true,
}: {
  label: string;
  value: string;
  options: ThemedSelectOption[];
  onChange: (value: string) => void;
  minWidth?: number;
  disabled?: boolean;
  icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef} style={{ minWidth }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-9 w-full items-center justify-between gap-3 rounded-md border bg-white px-3 text-left text-[13px] font-semibold text-[#302C28] shadow-[0_1px_2px_rgba(45,42,38,0.03)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-60 ${
          open ? "border-brand ring-2 ring-brand/10" : "border-[#D8CEC5] hover:border-brand/45 hover:bg-[#FFFDFB]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label ?? label}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[#8C837B]">
          {icon ? <SlidersHorizontal className={`h-3.5 w-3.5 ${open ? "text-brand" : ""}`} /> : null}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180 text-brand" : ""}`} />
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-[90] mt-1.5 max-h-72 w-full overflow-y-auto rounded-md border border-[#D8CEC5] bg-[#FFFDFB] p-1 shadow-[0_14px_32px_rgba(45,42,38,0.14)] animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#A79C94]">{label}</div>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value || "all"}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex h-8 w-full items-center justify-between gap-2 rounded px-2 text-left text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isSelected
                    ? "bg-brand text-white"
                    : "text-[#4A423C] hover:bg-[#F4EEE9] hover:text-[#302C28]"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
