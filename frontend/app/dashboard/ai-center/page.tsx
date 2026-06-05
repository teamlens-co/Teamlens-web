"use client";

import { BrainCircuit } from "lucide-react";
import LiveActivityBoard from "../../../components/LiveActivityBoard";

export default function AICenterPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <BrainCircuit className="h-4 w-4 text-brand" />
            Screenshot Intelligence
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">AI Work Summary</h2>
        </div>
      </header>
      <LiveActivityBoard />
    </div>
  );
}
