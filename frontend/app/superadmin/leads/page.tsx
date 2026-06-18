"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Building2,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Mail,
  Phone,
  Edit2,
  Save,
  Plus,
  Trash2,
  Loader2,
  Layers,
  X,
  User,
} from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";

type Lead = {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string | null;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "LOST";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function LeadsPipelinePage() {
  const { apiBase, authHeaders } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    notes: "",
  });

  // Editing notes state
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editingNotesText, setEditingNotesText] = useState("");
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);

  // Status updating state
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const fetchLeads = async () => {
    if (!authHeaders) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${apiBase}/api/web/superadmin/leads`, {
        headers: authHeaders as any,
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setLeads(json.data || []);
      } else {
        setErrorMsg(json.message || "Failed to load leads pipeline");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error connecting to platform API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authHeaders) {
      fetchLeads();
    }
  }, [apiBase, authHeaders]);

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authHeaders) return;
    if (!newLead.name || !newLead.email || !newLead.company) {
      setErrorMsg("Please fill in Name, Email, and Company fields.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${apiBase}/api/web/superadmin/leads`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        } as any,
        body: JSON.stringify({
          name: newLead.name,
          email: newLead.email,
          company: newLead.company,
          phone: newLead.phone ? newLead.phone : null,
          notes: newLead.notes ? newLead.notes : null,
        }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setLeads((prev) => [json.data, ...prev]);
        setSuccessMsg("New lead registered successfully.");
        setIsAddModalOpen(false);
        setNewLead({ name: "", email: "", company: "", phone: "", notes: "" });
      } else {
        setErrorMsg(json.message || "Failed to create lead");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error creating lead.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    if (!authHeaders) return;
    setUpdatingStatusId(leadId);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${apiBase}/api/web/superadmin/leads/${leadId}/status`, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        } as any,
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setLeads((prev) =>
          prev.map((lead) => (lead.id === leadId ? { ...lead, status: newStatus as any } : lead))
        );
        setSuccessMsg("Lead status updated.");
      } else {
        setErrorMsg(json.message || "Failed to update status");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error updating lead status.");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const startEditNotes = (lead: Lead) => {
    setEditingLeadId(lead.id);
    setEditingNotesText(lead.notes || "");
  };

  const saveNotes = async (leadId: string) => {
    if (!authHeaders) return;
    setSavingNotesId(leadId);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${apiBase}/api/web/superadmin/leads/${leadId}/notes`, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        } as any,
        body: JSON.stringify({ notes: editingNotesText }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setLeads((prev) =>
          prev.map((lead) => (lead.id === leadId ? { ...lead, notes: editingNotesText } : lead))
        );
        setEditingLeadId(null);
        setSuccessMsg("Lead notes updated.");
      } else {
        setErrorMsg(json.message || "Failed to save notes");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error saving notes.");
    } finally {
      setSavingNotesId(null);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!authHeaders) return;
    if (!confirm("Are you sure you want to delete this lead?")) return;

    setErrorMsg("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${apiBase}/api/web/superadmin/leads/${leadId}`, {
        method: "DELETE",
        headers: authHeaders as any,
      });
      const json = await res.json();

      if (res.ok && json.success) {
        setLeads((prev) => prev.filter((lead) => lead.id !== leadId));
        setSuccessMsg("Lead removed from pipeline.");
      } else {
        setErrorMsg(json.message || "Failed to delete lead");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error deleting lead.");
    }
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || lead.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const total = leads.length;
    const newCount = leads.filter((l) => l.status === "NEW").length;
    const contactedCount = leads.filter((l) => l.status === "CONTACTED").length;
    const qualifiedCount = leads.filter((l) => l.status === "QUALIFIED").length;
    return { total, newCount, contactedCount, qualifiedCount };
  }, [leads]);

  if (loading && leads.length === 0) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-brand animate-spin" />
          <span className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Loading leads pipeline...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 font-sans">
      {/* Top Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Leads Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and manage prospective organizations subscribing to the SaaS platform.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchLeads}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-card hover:bg-accent/40 text-foreground border border-border rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition active:scale-[0.98] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Leads
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition active:scale-[0.98] shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Leads Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Inquiries
            </span>
            <div className="rounded-xl bg-[var(--brand-tint)] p-2 text-primary">
              <Building2 className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground tracking-tight">
              {stats.total}
            </span>
            <span className="text-xs text-muted-foreground">prospects</span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              New Leads
            </span>
            <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
              <Plus className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground tracking-tight">
              {stats.newCount}
            </span>
            <span className="text-xs text-muted-foreground">new registrations</span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Contacted Leads
            </span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <Users className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground tracking-tight">
              {stats.contactedCount}
            </span>
            <span className="text-xs text-muted-foreground">in discussions</span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Qualified Leads
            </span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground tracking-tight">
              {stats.qualifiedCount}
            </span>
            <span className="text-xs text-muted-foreground">ready to seed</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="text-xs font-semibold">{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="text-xs font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Leads Table Container */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Active Pipelines</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review and record notes for inbound company requests.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search leads by name, email or company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-background border border-border rounded-xl py-2 px-10 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:border-brand outline-none transition"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus:border-brand outline-none transition cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="NEW">New</option>
              <option value="CONTACTED">Contacted</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="LOST">Lost</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-4 px-6">Company & Lead Profile</th>
                <th className="py-4 px-6">Contact Details</th>
                <th className="py-4 px-6">Pipeline Status</th>
                <th className="py-4 px-6 w-[350px]">Discussion Notes</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[13px]">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground font-medium">
                    No leads found matching current filter rules.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-muted/10 transition"
                  >
                    <td className="py-4.5 px-6">
                      <div className="font-semibold text-foreground">{lead.company}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 font-mono">
                        <User className="h-3.5 w-3.5" />
                        {lead.name}
                      </div>
                    </td>
                    <td className="py-4.5 px-6 space-y-1 text-foreground">
                      <div className="text-xs flex items-center gap-1.5 font-mono">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {lead.email}
                      </div>
                      {lead.phone && (
                        <div className="text-xs flex items-center gap-1.5 font-mono text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </div>
                      )}
                    </td>
                    <td className="py-4.5 px-6">
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                        disabled={updatingStatusId === lead.id}
                        className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-3 py-1 border transition outline-none cursor-pointer ${
                          lead.status === "NEW"
                            ? "bg-blue-50 border-blue-200 text-blue-600"
                            : lead.status === "CONTACTED"
                            ? "bg-amber-50 border-amber-200 text-amber-600"
                            : lead.status === "QUALIFIED"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                            : "bg-slate-50 border-slate-200 text-slate-500"
                        }`}
                      >
                        <option value="NEW">New</option>
                        <option value="CONTACTED">Contacted</option>
                        <option value="QUALIFIED">Qualified</option>
                        <option value="LOST">Lost</option>
                      </select>
                    </td>
                    <td className="py-4.5 px-6">
                      {editingLeadId === lead.id ? (
                        <div className="flex items-start gap-2">
                          <textarea
                            value={editingNotesText}
                            onChange={(e) => setEditingNotesText(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl p-2 text-xs font-medium text-foreground outline-none focus:border-brand transition min-h-[60px]"
                            placeholder="Add lead discussion history..."
                          />
                          <button
                            onClick={() => saveNotes(lead.id)}
                            disabled={savingNotesId === lead.id}
                            className="bg-brand text-white p-2 rounded-xl hover:bg-brand-dark transition shrink-0 active:scale-95 disabled:opacity-50"
                          >
                            {savingNotesId === lead.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2 group/notes max-w-[330px]">
                          <p className="text-[12px] text-muted-foreground line-clamp-3 leading-relaxed break-words">
                            {lead.notes || <span className="italic text-muted-foreground/40">No records saved yet.</span>}
                          </p>
                          <button
                            onClick={() => startEditNotes(lead)}
                            className="opacity-0 group-hover/notes:opacity-100 p-1 hover:bg-accent/40 rounded-lg text-muted-foreground hover:text-foreground transition duration-150 shrink-0"
                            title="Edit Notes"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-4.5 px-6 text-right">
                      <button
                        onClick={() => handleDeleteLead(lead.id)}
                        className="p-1.5 hover:bg-rose-50 text-muted-foreground hover:text-rose-600 rounded-xl transition-colors duration-150 active:scale-95 border border-transparent hover:border-rose-100"
                        title="Remove Lead"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Entry Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 relative animate-in fade-in zoom-in-95 duration-200 font-sans">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 hover:bg-accent/40 rounded-xl text-muted-foreground hover:text-foreground transition duration-150"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <h3 className="text-base font-bold text-foreground flex items-center gap-2 mb-4">
              <Layers className="h-4.5 w-4.5 text-brand" />
              Register Prospect Lead
            </h3>

            <form onSubmit={handleAddLead} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sterling Industries"
                  value={newLead.company}
                  onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl py-2 px-3 text-foreground placeholder:text-muted-foreground/40 focus:border-brand outline-none transition font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Contact Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl py-2 px-3 text-foreground placeholder:text-muted-foreground/40 focus:border-brand outline-none transition font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl py-2 px-3 text-foreground placeholder:text-muted-foreground/40 focus:border-brand outline-none transition font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Phone Number (Optional)</label>
                <input
                  type="text"
                  placeholder="+1 (555) 019-2834"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl py-2 px-3 text-foreground placeholder:text-muted-foreground/40 focus:border-brand outline-none transition font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Initial Discussion Notes</label>
                <textarea
                  placeholder="e.g. Met at regional expo. Interested in employee tracking agent..."
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  className="w-full bg-background border border-border rounded-xl p-3 text-foreground placeholder:text-muted-foreground/40 focus:border-brand outline-none transition font-medium min-h-[80px]"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-card border border-border hover:bg-accent/40 text-foreground px-4 py-2 rounded-xl font-semibold uppercase tracking-wider text-[10px] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-brand hover:bg-brand-dark text-white px-5 py-2 rounded-xl font-semibold uppercase tracking-wider text-[10px] shadow-sm transition active:scale-95 disabled:opacity-50"
                >
                  {submitting ? "Submitting..." : "Save Prospect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
