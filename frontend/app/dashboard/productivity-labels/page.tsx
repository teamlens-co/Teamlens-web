"use client";

import { useEffect, useState, useMemo } from "react";
import { 
  Globe2, 
  Laptop, 
  Search, 
  Tags, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Zap, 
  Sparkles, 
  Edit2 
} from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import DashboardDateFilter from "../../../components/DashboardDateFilter";
import ThemedSelect from "../../../components/ThemedSelect";

type Category = "PRODUCTIVE" | "UNPRODUCTIVE" | "NEUTRAL";
type TargetType = "APP" | "DOMAIN" | "URL";

type ClassificationItem = {
  name: string;
  type: TargetType;
  category: Category;
  samples: number;
  lastSeen: string;
  source: "rule" | "usage";
};

type UsageReportItem = {
  name: string;
  appName?: string | null;
  domain?: string | null;
  targetType?: TargetType;
  category: Category;
  samples: number;
};

type ClassificationRule = {
  id: string;
  targetType: TargetType;
  targetValue: string;
  category: Category;
};

const normalizeTarget = (value: string) => value.toLowerCase().trim();

const displayTargetType = (item: UsageReportItem): TargetType => {
  if (item.targetType === "APP" || item.targetType === "DOMAIN" || item.targetType === "URL") return item.targetType;
  return item.domain ? "DOMAIN" : "APP";
};

const ruleKey = (type: TargetType, value: string) => `${type}:${normalizeTarget(value)}`;

const labelClass: Record<Category, string> = {
  PRODUCTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  UNPRODUCTIVE: "border-rose-200 bg-rose-50 text-rose-700",
  NEUTRAL: "border-slate-200 bg-slate-50 text-slate-700",
};

export default function ProductivityLabelsPage() {
  const { authHeaders, apiBase, user, dateRange, selectedUserId } = useAuth();
  const [items, setItems] = useState<ClassificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");

  // Manual Override State
  const [overrideTarget, setOverrideTarget] = useState("");
  const [overrideType, setOverrideType] = useState<TargetType>("DOMAIN");
  const [overrideCategory, setOverrideCategory] = useState<Category>("PRODUCTIVE");
  
  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchItems = async () => {
    if (!authHeaders) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        groupBy: "total",
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      });
      if (user?.role !== "MANAGER" && selectedUserId) params.set("userId", selectedUserId);
      
      const [usageResponse, rulesResponse] = await Promise.all([
        fetch(`${apiBase}/api/web/dashboard/usage-report?${params.toString()}`, {
          headers: authHeaders,
          credentials: "include",
        }),
        fetch(`${apiBase}/api/web/classification-rules`, {
          headers: authHeaders,
          credentials: "include",
        }),
      ]);

      const usageResult = await usageResponse.json();
      const rulesResult = await rulesResponse.json();
      if (!usageResponse.ok || !usageResult.success) throw new Error(usageResult.message || "Unable to fetch usage report");
      if (!rulesResponse.ok || !rulesResult.success) throw new Error(rulesResult.message || "Unable to fetch classification rules");

      const rules = (rulesResult.data ?? []) as ClassificationRule[];
      const ruleMap = new Map(rules.map((rule) => [ruleKey(rule.targetType, rule.targetValue), rule]));
      const merged = new Map<string, ClassificationItem>();

      for (const rule of rules) {
        merged.set(ruleKey(rule.targetType, rule.targetValue), {
          name: rule.targetValue,
          type: rule.targetType,
          category: rule.category,
          samples: 0,
          lastSeen: "Manual rule",
          source: "rule",
        });
      }

      for (const usageItem of ((usageResult.data?.items ?? []) as UsageReportItem[])) {
        const type = displayTargetType(usageItem);
        const targetValue = type === "DOMAIN" && usageItem.domain ? usageItem.domain : usageItem.name;
        const matchedRule = ruleMap.get(ruleKey(type, targetValue)) ?? ruleMap.get(ruleKey(type, usageItem.name));
        const key = ruleKey(type, targetValue);
        merged.set(key, {
          name: targetValue,
          type,
          category: matchedRule?.category ?? usageItem.category,
          samples: usageItem.samples,
          lastSeen: "Recent",
          source: matchedRule ? "rule" : "usage",
        });
      }

      setItems(Array.from(merged.values()));
    } catch (error) {
      console.error("Failed to fetch classification items", error);
      setToast({ message: error instanceof Error ? error.message : "Failed to fetch classification items", type: "error" });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchItems();
  }, [authHeaders, apiBase, selectedUserId, dateRange]);

  const updateCategory = async (name: string, type: TargetType, category: Category) => {
    if (!authHeaders) return;
    try {
      const response = await fetch(`${apiBase}/api/web/classification-rules`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
        body: JSON.stringify({
          targetType: type,
          targetValue: name.toLowerCase().trim(),
          category: category,
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        const savedRule = result.data as ClassificationRule;
        setToast({ message: `Successfully marked ${name} as ${category.toLowerCase()}`, type: "success" });
        setTimeout(() => setToast(null), 3000);
        
        setItems(current => {
          const key = ruleKey(type, savedRule?.targetValue ?? name);
          const next = new Map(current.map((item) => [ruleKey(item.type, item.name), item]));
          next.set(key, {
            name: savedRule?.targetValue ?? normalizeTarget(name),
            type,
            category,
            samples: next.get(key)?.samples ?? 0,
            lastSeen: next.get(key)?.lastSeen ?? "Manual rule",
            source: "rule",
          });
          return Array.from(next.values());
        });
        
        await fetchItems();
      } else {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message || "Failed to save rule");
      }
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to update classification", type: "error" });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const saveManualRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeaders || !overrideTarget.trim()) return;
    
    await updateCategory(overrideTarget.trim(), overrideType, overrideCategory);
    setOverrideTarget("");
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesQuery = item.name.toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === "All" || item.category === filter.toUpperCase();
      return matchesQuery && matchesFilter;
    });
  }, [items, query, filter]);

  const stats = useMemo(() => {
    return [
      { label: "Total Tracked", value: items.length, tone: "text-slate-700 bg-slate-100" },
      { label: "Productive", value: items.filter(i => i.category === "PRODUCTIVE").length, tone: "text-emerald-600 bg-emerald-50" },
      { label: "Unproductive", value: items.filter(i => i.category === "UNPRODUCTIVE").length, tone: "text-rose-600 bg-rose-50" },
      { label: "Neutral", value: items.filter(i => i.category === "NEUTRAL").length, tone: "text-brand bg-brand/5" },
    ];
  }, [items]);

  if (user?.role !== "MANAGER") {
    return <div className="p-12 text-center font-medium text-slate-400 uppercase tracking-widest">Access Restricted</div>;
  }

  const commonLibrary = [
    { name: "Visual Studio Code", type: "APP" as TargetType, category: "PRODUCTIVE" as Category, icon: Laptop },
    { name: "Cursor", type: "APP" as TargetType, category: "PRODUCTIVE" as Category, icon: Laptop },
    { name: "Postman", type: "APP" as TargetType, category: "PRODUCTIVE" as Category, icon: Laptop },
    { name: "github.com", type: "DOMAIN" as TargetType, category: "PRODUCTIVE" as Category, icon: Globe2 },
    { name: "linear.app", type: "DOMAIN" as TargetType, category: "PRODUCTIVE" as Category, icon: Globe2 },
    { name: "Slack", type: "APP" as TargetType, category: "PRODUCTIVE" as Category, icon: Laptop },
    { name: "Microsoft Teams", type: "APP" as TargetType, category: "PRODUCTIVE" as Category, icon: Laptop },
    { name: "netflix.com", type: "DOMAIN" as TargetType, category: "UNPRODUCTIVE" as Category, icon: Globe2 },
    { name: "spotify.com", type: "DOMAIN" as TargetType, category: "UNPRODUCTIVE" as Category, icon: Globe2 },
    { name: "Steam", type: "APP" as TargetType, category: "UNPRODUCTIVE" as Category, icon: Laptop },
    { name: "youtube.com", type: "DOMAIN" as TargetType, category: "NEUTRAL" as Category, icon: Globe2 },
    { name: "chat.openai.com", type: "DOMAIN" as TargetType, category: "PRODUCTIVE" as Category, icon: Globe2 },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="tl-label uppercase tracking-widest text-[10px] font-medium text-slate-400">Organization Classification</p>
          <h2 className="mt-1 text-2xl font-medium text-slate-800 tracking-tight">Productivity Labels</h2>
        </div>
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <DashboardDateFilter />
          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="tl-input h-11 w-full pl-11 pr-4 text-[13px] font-medium bg-white border-slate-200" 
              placeholder="Search tracked apps and websites..." 
            />
          </div>
        </div>
      </div>

      {/* Custom Classification Form */}
      <section className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
         <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
               <Edit2 className="h-4.5 w-4.5 text-brand" />
            </div>
            <div>
               <h3 className="text-sm font-medium text-slate-800">Custom Override</h3>
               <p className="text-[11px] font-medium text-slate-400">Add a specific domain or app name to the classification engine.</p>
            </div>
         </div>

         <form onSubmit={saveManualRule} className="grid gap-3 md:grid-cols-[140px_1fr_160px_140px]">
            <ThemedSelect
              label="Target"
              value={overrideType}
              onChange={(nextValue) => setOverrideType(nextValue as TargetType)}
              minWidth={140}
              options={[
                { label: "Application", value: "APP" },
                { label: "Web Domain", value: "DOMAIN" },
                { label: "Full URL", value: "URL" },
              ]}
            />
            <input
              value={overrideTarget}
              onChange={(e) => setOverrideTarget(e.target.value)}
              className="tl-input h-10 px-4 text-sm"
              placeholder="e.g. facebook.com or Spotify"
            />
            <ThemedSelect
              label="Category"
              value={overrideCategory}
              onChange={(nextValue) => setOverrideCategory(nextValue as Category)}
              minWidth={160}
              options={[
                { label: "Productive", value: "PRODUCTIVE" },
                { label: "Unproductive", value: "UNPRODUCTIVE" },
                { label: "Neutral", value: "NEUTRAL" },
              ]}
            />
            <button
              type="submit"
              disabled={!overrideTarget.trim()}
              className="tl-primary-button h-10 text-xs font-medium shadow-brand/20 disabled:opacity-50"
            >
              Save Rule
            </button>
         </form>
      </section>

      {/* Intelligence Library */}
      <section className="bg-brand/5 border border-brand/10 rounded-3xl p-6">
         <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
               <div className="h-9 w-9 rounded-xl bg-brand text-white flex items-center justify-center shadow-lg shadow-brand/20">
                  <Sparkles className="h-5 w-5" />
               </div>
               <div>
                  <h3 className="text-sm font-medium text-slate-800">Intelligence Library</h3>
                  <p className="text-[11px] font-medium text-slate-500">Fast-track labeling for common enterprise resources.</p>
               </div>
            </div>
            <span className="text-[10px] font-medium text-brand uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-brand/10">Pre-defined rules</span>
         </div>
         
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {commonLibrary.map((item) => (
               <button
                  key={item.name}
                  onClick={() => updateCategory(item.name, item.type, item.category)}
                  className="bg-white border border-slate-100 rounded-2xl p-4 text-left hover:border-brand/30 hover:shadow-md transition-all group"
               >
                  <div className="flex items-center justify-between mb-3">
                     <item.icon className="h-4 w-4 text-slate-300 group-hover:text-brand" />
                     <span className={`text-[8px] font-medium uppercase px-1.5 py-0.5 rounded ${labelClass[item.category]}`}>
                        {item.category.toLowerCase()}
                     </span>
                  </div>
                  <p className="text-xs font-medium text-slate-700 truncate">{item.name}</p>
                  <p className="text-[9px] font-medium text-slate-400 uppercase mt-0.5">Quick Setup</p>
               </button>
            ))}
         </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, tone }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <span className="text-[10px] font-medium text-slate-400 block mb-1">{label}</span>
            <strong className={`text-3xl font-medium ${tone.split(' ')[0]}`}>{value}</strong>
          </div>
        ))}
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-50 bg-slate-50/30 p-4">
          <div className="flex gap-2">
            {["All", "Productive", "Unproductive", "Neutral"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-8 px-4 rounded-lg text-xs font-medium transition-all ${
                  filter === f ? "bg-white text-brand shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-medium text-brand uppercase bg-brand/5 px-3 py-1 rounded-full border border-brand/10">
             <Zap className="h-3 w-3 fill-current" /> Automatic Detection Active
          </div>
        </div>
        
        <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-50 p-2 custom-scrollbar">
          {loading ? (
            <div className="py-20 text-center text-slate-400 font-medium uppercase tracking-widest animate-pulse text-xs">
              Synchronizing workforce telemetry...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-20 text-center text-slate-400 font-medium uppercase tracking-widest text-xs">
              No items found matching your filter
            </div>
          ) : (
            filteredItems.map((item) => {
              const Icon = item.type === "DOMAIN" ? Globe2 : Laptop;
              return (
                <div key={item.name} className="grid gap-4 rounded-xl px-4 py-3.5 hover:bg-slate-50 transition-colors md:grid-cols-[auto_1fr_140px_180px] md:items-center group">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-100 group-hover:bg-brand/5 group-hover:text-brand group-hover:border-brand/10 transition-all">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700 group-hover:text-brand transition-colors">{item.name}</p>
                    <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
                      {item.type} · {item.source === "rule" ? "Manual rule" : `${item.samples} samples`}
                    </p>
                  </div>
                  <div className="flex justify-start">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-widest border ${labelClass[item.category]}`}>
                      {item.category.toLowerCase()}
                    </span>
                  </div>
                  <ThemedSelect
                    label="Classify"
                    value={item.category}
                    onChange={(nextValue) => updateCategory(item.name, item.type, nextValue as Category)}
                    minWidth={170}
                    options={[
                      { label: "Mark Productive", value: "PRODUCTIVE" },
                      { label: "Mark Unproductive", value: "UNPRODUCTIVE" },
                      { label: "Mark Neutral", value: "NEUTRAL" },
                    ]}
                  />
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Toast Notifications */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-8">
          <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
            toast.type === "error" ? "bg-rose-50 border-rose-100 text-rose-600" : "bg-white border-slate-100 text-slate-800"
          }`}>
            {toast.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            <span className="text-xs font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      <section className="bg-[#faf8f6] rounded-2xl border border-slate-100 p-6 flex flex-col gap-6 md:flex-row md:items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/20">
          <Tags className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
            Priority Intelligence Hierarchy
          </p>
          <p className="text-xs font-medium text-slate-500 mt-1 leading-relaxed">
            TeamLens provides automatic detection for 100+ developer and productivity tools. 
            However, <strong>Manual Overrides</strong> take absolute priority. Once you label a domain or app, the system will re-calculate all past and future analytics for that resource across your organization.
          </p>
        </div>
        <div className="flex gap-2">
           <div className="flex items-center gap-1.5 bg-white px-4 py-2 rounded-xl border border-slate-200 text-[10px] font-medium text-slate-400 uppercase tracking-widest">
              <Info className="h-3.5 w-3.5" /> Manager Logic Priority
           </div>
        </div>
      </section>
    </div>
  );
}
