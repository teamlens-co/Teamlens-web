"use client";

import { useState } from "react";
import { 
  Sparkles, 
  BrainCircuit, 
  Target, 
  AlertTriangle, 
  TrendingUp, 
  MessageSquare,
  Zap,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

export default function AICenterPage() {
  const [activeTab, setActiveTab] = useState("insights");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="tl-label flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-brand" /> Neural analysis engine
          </p>
          <h2 className="mt-1 text-2xl font-medium text-slate-800">AI Intelligence Center</h2>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {["Insights", "Anomalies", "Predictions"].map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t.toLowerCase())}
              className={`px-5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === t.toLowerCase() ? "bg-white text-brand shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Main Insight Card */}
          <section className="tl-card bg-gradient-to-br from-brand to-brand-dark p-8 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700" />
            <div className="relative z-10 space-y-6">
              <div className="inline-flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-[10px] font-medium uppercase tracking-widest backdrop-blur-md border border-white/10">
                <BrainCircuit className="h-3.5 w-3.5" /> Core Executive Summary
              </div>
              <h3 className="text-3xl font-medium leading-tight max-w-xl">
                Team focus has shifted towards <span className="underline decoration-white/30 underline-offset-8">Production Work</span> by 12.4% this week.
              </h3>
              <p className="text-white/80 text-sm font-medium max-w-lg leading-relaxed">
                Our AI model has detected a significant reduction in administrative overhead. Engineering velocity is expected to increase by 15% if this trend continues through Friday.
              </p>
              <div className="flex gap-4 pt-2">
                <div className="bg-white/10 rounded-xl p-4 border border-white/10 flex-1">
                  <p className="text-[10px] font-medium text-white/60">Primary Driver</p>
                  <p className="text-lg font-medium mt-1">Deep Work Mode</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4 border border-white/10 flex-1">
                  <p className="text-[10px] font-medium text-white/60">System Confidence</p>
                  <p className="text-lg font-medium mt-1">94% Accurate</p>
                </div>
              </div>
            </div>
          </section>

          {/* Detailed Analysis Tabs */}
          <div className="grid gap-6 md:grid-cols-2">
             <section className="tl-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-slate-400 flex items-center gap-2">
                    <Target className="h-4 w-4 text-brand" /> Productivity Trends
                  </h4>
                  <span className="text-[10px] font-medium text-emerald-500">+8.2%</span>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Focused Coding", val: 82, color: "bg-brand" },
                    { label: "Internal Comms", val: 12, color: "bg-emerald-400" },
                    { label: "Web Research", val: 6, color: "bg-slate-200" },
                  ].map((item, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-medium text-slate-600">
                        <span>{item.label}</span>
                        <span>{item.val}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.val}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
             </section>

             <section className="tl-card p-6 space-y-4 border-amber-100 bg-amber-50/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-amber-600 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Anomaly Detection
                  </h4>
                  <span className="text-[10px] font-medium text-amber-600">2 Alerts</span>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-3 bg-white p-3 rounded-xl border border-amber-100 shadow-sm">
                    <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <Zap className="h-4 w-4 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">Sudden Idle Spike</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Marketing team showing 40% idle time in the last 2 hours.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 bg-white p-3 rounded-xl border border-slate-100 opacity-60">
                    <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                      <ShieldCheck className="h-4 w-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">Unauthorized App Use</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Resolved: Personal cloud storage detected and blocked.</p>
                    </div>
                  </div>
                </div>
             </section>
          </div>
        </div>

        <aside className="space-y-6">
          <section className="tl-card overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                <MessageSquare className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-medium text-slate-800">AI Consultant</h4>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4 text-xs text-slate-600 leading-relaxed italic border border-slate-100">
                &quot;Hello! I&apos;ve analyzed your team&apos;s patterns. Would you like to know which members are most likely to burn out this month based on their late-night activity?&quot;
              </div>
              <div className="space-y-2">
                <button className="w-full text-left px-4 py-2.5 rounded-xl border border-slate-200 text-[11px] font-medium text-slate-500 hover:border-brand hover:text-brand transition-all flex items-center justify-between group">
                  Identify Burnout Risks <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                <button className="w-full text-left px-4 py-2.5 rounded-xl border border-slate-200 text-[11px] font-medium text-slate-500 hover:border-brand hover:text-brand transition-all flex items-center justify-between group">
                  Optimize Shift Allocation <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                <button className="w-full text-left px-4 py-2.5 rounded-xl border border-slate-200 text-[11px] font-medium text-slate-500 hover:border-brand hover:text-brand transition-all flex items-center justify-between group">
                  Software License ROI <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
              <input 
                className="tl-input w-full h-10 px-4 text-xs bg-slate-50 border-transparent focus:bg-white" 
                placeholder="Ask intelligence agent anything..." 
              />
            </div>
          </section>

          <section className="tl-panel p-6 border-dashed border-2">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              <h4 className="text-sm font-medium text-slate-700">Prediction Engine</h4>
            </div>
            <div className="space-y-4">
               <p className="text-[10px] font-medium text-slate-400">Estimated Productivity (Next 7 Days)</p>
               <div className="h-24 flex items-end gap-1.5">
                  {[40, 55, 45, 80, 75, 90, 85].map((h, i) => (
                    <div key={i} className="flex-1 bg-brand/10 rounded-t-sm relative group overflow-hidden">
                       <div className="absolute bottom-0 left-0 right-0 bg-brand rounded-t-sm transition-all duration-1000" style={{ height: `${h}%` }} />
                    </div>
                  ))}
               </div>
               <div className="pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-medium text-slate-500">Predicted trend is <strong className="text-brand">positive</strong>. Current engineering momentum is strong.</p>
               </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
