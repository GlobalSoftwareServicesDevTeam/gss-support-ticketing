"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Globe,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Shield,
  ArrowUpDown,
  FileQuestion,
  Play,
  Ban,
  Edit3,
  Save,
  X,
  Upload,
  Building2,
  FolderKanban,
  Plus,
  Trash2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface DomainEntry {
  id: string;
  domain: string | null;
  orderType: string;
  status: string;
  amount: number | null;
  period: number;
  expiryDate: string | null;
  daysLeft: number | null;
  expiryStatus: "ok" | "warning" | "critical" | "expired" | "none";
  reminderSentAt: string | null;
  pleskSubscriptionId: string | null;
  invoiceNinjaInvoiceId: string | null;
  recurringInvoiceId: string | null;
  provisionedAt: string | null;
  notes: string | null;
  createdAt: string;
  product: { name: string; type: string; monthlyPrice: number } | null;
  user: { id: string; firstName: string; lastName: string; email: string; company: string | null } | null;
  customer: { id: string; company: string } | null;
  project: { id: string; projectName: string } | null;
  subProjectId: string | null;
  subProject: { id: string; name: string } | null;
}

interface CustomerOption {
  id: string;
  company: string;
}

interface ProjectOption {
  id: string;
  projectName: string;
}

interface ImportRow {
  domain: string;
  expiryDate: string;
  status: string;
  customerId: string;
  projectId: string;
  notes: string;
  amount: string;
}

interface DomainStats {
  total: number;
  active: number;
  pending: number;
  expiringSoon: number;
  expired: number;
  cancelled: number;
}

// ─── Constants ──────────────────────────────────────────

type FilterTab = "ALL" | "ACTIVE" | "PENDING" | "EXPIRING" | "EXPIRED" | "CANCELLED";

const ORDER_STATUS_STYLE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  PENDING: { bg: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400", text: "Pending", icon: <Clock size={14} /> },
  QUOTED: { bg: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400", text: "Quoted", icon: <FileQuestion size={14} /> },
  PROFORMA_SENT: { bg: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400", text: "Proforma Sent", icon: <FileQuestion size={14} /> },
  PAID: { bg: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400", text: "Paid", icon: <CheckCircle2 size={14} /> },
  PROVISIONING: { bg: "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400", text: "Provisioning", icon: <Loader2 size={14} className="animate-spin" /> },
  ACTIVE: { bg: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400", text: "Active", icon: <CheckCircle2 size={14} /> },
  FAILED: { bg: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400", text: "Failed", icon: <XCircle size={14} /> },
  CANCELLED: { bg: "bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-400", text: "Cancelled", icon: <XCircle size={14} /> },
};

const EXPIRY_STYLE: Record<string, string> = {
  ok: "text-green-600 dark:text-green-400",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400 font-semibold",
  expired: "text-red-700 dark:text-red-500 font-bold",
  none: "text-slate-400",
};

const EXPIRY_BG: Record<string, string> = {
  ok: "",
  warning: "bg-amber-50 dark:bg-amber-900/10",
  critical: "bg-red-50 dark:bg-red-900/10",
  expired: "bg-red-100 dark:bg-red-900/20",
  none: "",
};

type SortField = "domain" | "expiryDate" | "status" | "createdAt" | "user";
type SortDir = "asc" | "desc";

function SortHeader({ field, label, sortField, onToggle }: { field: SortField; label: string; sortField: SortField; onToggle: (f: SortField) => void }) {
  return (
    <button
      onClick={() => onToggle(field)}
      className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
    >
      {label}
      <ArrowUpDown size={12} className={sortField === field ? "text-brand-500" : "opacity-40"} />
    </button>
  );
}

// ─── Component ──────────────────────────────────────────

export default function DomainsManagerPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [domains, setDomains] = useState<DomainEntry[]>([]);
  const [stats, setStats] = useState<DomainStats>({ total: 0, active: 0, pending: 0, expiringSoon: 0, expired: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("ALL");
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("expiryDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingExpiry, setEditingExpiry] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [expiryValue, setExpiryValue] = useState("");
  const [notesValue, setNotesValue] = useState("");

  // Import modal state
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([{ domain: "", expiryDate: "", status: "ACTIVE", customerId: "", projectId: "", notes: "", amount: "" }]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ domain: string; status: string; reason?: string }[] | null>(null);

  // Assignment editing
  const [editingAssign, setEditingAssign] = useState<string | null>(null);
  const [assignCustomerId, setAssignCustomerId] = useState("");
  const [assignProjectId, setAssignProjectId] = useState("");
  const [assignSubProjectId, setAssignSubProjectId] = useState("");
  const [subProjectsCache, setSubProjectsCache] = useState<Record<string, { id: string; name: string }[]>>({});

  // Lookup data for customers & projects
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const fetchDomains = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = filterTab === "ALL" ? "" : filterTab;
      const res = await fetch(`/api/hosting/domains/manage${statusParam ? `?status=${statusParam}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setDomains(data.domains);
        setStats(data.stats);
      }
    } catch {
      showMessage("error", "Failed to load domains");
    }
    setLoading(false);
  }, [filterTab, showMessage]);

  useEffect(() => {
    if (session?.user) {
      fetchDomains();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, filterTab]);

  // Load customers & projects for assignment dropdowns (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/customers?limit=1000").then((r) => r.json()).then((data) => {
      const list = data.customers || data;
      if (Array.isArray(list)) setCustomers(list.map((c: { id: string; company: string }) => ({ id: c.id, company: c.company })));
    }).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setProjects(data.map((p: { id: string; projectName: string }) => ({ id: p.id, projectName: p.projectName })));
    }).catch(() => {});
  }, [isAdmin]);

  // ─── Import ───────────────────────────────────────────

  function addImportRow() {
    setImportRows([...importRows, { domain: "", expiryDate: "", status: "ACTIVE", customerId: "", projectId: "", notes: "", amount: "" }]);
  }

  function removeImportRow(i: number) {
    setImportRows(importRows.filter((_, idx) => idx !== i));
  }

  function updateImportRow(i: number, field: keyof ImportRow, value: string) {
    setImportRows(importRows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function handleCsvPaste(text: string) {
    const lines = text.split("\n").filter((l) => l.trim());
    const rows: ImportRow[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map((p) => p.trim().replace(/^"|"$/g, ""));
      if (parts[0]) {
        rows.push({
          domain: parts[0],
          expiryDate: parts[1] || "",
          status: parts[2] || "ACTIVE",
          customerId: "",
          projectId: "",
          notes: parts[3] || "",
          amount: parts[4] || "",
        });
      }
    }
    if (rows.length > 0) setImportRows(rows);
  }

  async function submitImport() {
    const validRows = importRows.filter((r) => r.domain.trim());
    if (validRows.length === 0) return;
    setImporting(true);
    setImportResults(null);
    try {
      const payload = validRows.map((r) => ({
        domain: r.domain.trim(),
        expiryDate: r.expiryDate || undefined,
        status: r.status || "ACTIVE",
        customerId: r.customerId || undefined,
        projectId: r.projectId || undefined,
        notes: r.notes || undefined,
        amount: r.amount ? parseFloat(r.amount) : undefined,
      }));
      const res = await fetch("/api/hosting/domains/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: payload }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportResults(data.results);
        showMessage("success", `Imported ${data.summary.created} domains (${data.summary.skipped} skipped, ${data.summary.errors} errors)`);
        fetchDomains();
      } else {
        showMessage("error", data.error || "Import failed");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setImporting(false);
  }

  // ─── Assignment ───────────────────────────────────────

  async function saveAssignment(orderId: string) {
    setActionLoading(orderId);
    try {
      const res = await fetch(`/api/hosting/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: assignCustomerId || null, projectId: assignProjectId || null, subProjectId: assignSubProjectId || null }),
      });
      if (res.ok) {
        showMessage("success", "Assignment updated");
        setEditingAssign(null);
        fetchDomains();
      } else {
        showMessage("error", "Failed to update assignment");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  async function fetchSubProjects(projectId: string) {
    if (subProjectsCache[projectId]) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/sub-projects`);
      if (res.ok) {
        const data = await res.json();
        setSubProjectsCache((prev) => ({ ...prev, [projectId]: data.map((sp: { id: string; name: string }) => ({ id: sp.id, name: sp.name })) }));
      }
    } catch { /* ignore */ }
  }

  // ─── Sorting ──────────────────────────────────────────

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const filteredAndSorted = [...domains]
    .filter((d) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        d.domain?.toLowerCase().includes(q) ||
        d.user?.email?.toLowerCase().includes(q) ||
        d.user?.firstName?.toLowerCase().includes(q) ||
        d.user?.lastName?.toLowerCase().includes(q) ||
        d.user?.company?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "domain":
          return dir * (a.domain || "").localeCompare(b.domain || "");
        case "expiryDate": {
          const ae = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
          const be = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
          return dir * (ae - be);
        }
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "createdAt":
          return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        case "user":
          return dir * ((a.user?.lastName || "").localeCompare(b.user?.lastName || ""));
        default:
          return 0;
      }
    });

  // ─── Actions ──────────────────────────────────────────

  async function updateOrderStatus(orderId: string, status: string) {
    setActionLoading(orderId);
    try {
      const res = await fetch(`/api/hosting/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showMessage("success", `Status updated to ${status}`);
        fetchDomains();
      } else {
        const data = await res.json();
        showMessage("error", data.error || "Failed to update");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  async function provisionOrder(orderId: string) {
    setActionLoading(orderId);
    try {
      const res = await fetch("/api/hosting/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", `Provisioned. ${data.pleskSubscriptionId ? "Plesk subscription created." : ""}`);
        fetchDomains();
      } else {
        showMessage("error", data.error || "Provisioning failed");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  async function cancelOrder(orderId: string) {
    if (!confirm("Cancel this domain order? This will suspend the domain and stop billing.")) return;
    setActionLoading(orderId);
    try {
      const res = await fetch(`/api/hosting/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspendHosting: true }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", "Domain order cancelled");
        fetchDomains();
      } else {
        showMessage("error", data.error || "Failed to cancel");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  async function saveExpiry(orderId: string) {
    setActionLoading(orderId);
    try {
      const res = await fetch(`/api/hosting/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiryDate: expiryValue || null }),
      });
      if (res.ok) {
        showMessage("success", expiryValue ? `Expiry date set to ${expiryValue}` : "Expiry date cleared");
        setEditingExpiry(null);
        fetchDomains();
      } else {
        showMessage("error", "Failed to update expiry date");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  async function saveNotes(orderId: string) {
    setActionLoading(orderId);
    try {
      const res = await fetch(`/api/hosting/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesValue || null }),
      });
      if (res.ok) {
        showMessage("success", "Notes updated");
        setEditingNotes(null);
        fetchDomains();
      } else {
        showMessage("error", "Failed to update notes");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  async function sendReminders() {
    if (!confirm("Send renewal invoices and email reminders for all domains expiring within 30 days?")) return;
    setActionLoading("reminders");
    try {
      const res = await fetch("/api/hosting/domain-reminders", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", `Processed ${data.processed} domains. Invoices: ${data.invoicesCreated}, Reminders: ${data.remindersSent}`);
        fetchDomains();
      } else {
        showMessage("error", data.error || "Failed to send reminders");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  // ─── Helpers ──────────────────────────────────────────

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
  }

  function formatCurrency(v: number) {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(v);
  }

  // ─── Filter tabs ──────────────────────────────────────

  const filterTabs: { key: FilterTab; label: string; count: number; color: string }[] = [
    { key: "ALL", label: "All Domains", count: stats.total, color: "text-slate-600" },
    { key: "ACTIVE", label: "Active", count: stats.active, color: "text-green-600" },
    { key: "EXPIRING", label: "Expiring Soon", count: stats.expiringSoon, color: "text-amber-600" },
    { key: "EXPIRED", label: "Expired", count: stats.expired, color: "text-red-600" },
    { key: "PENDING", label: "Pending", count: stats.pending, color: "text-blue-600" },
    { key: "CANCELLED", label: "Cancelled", count: stats.cancelled, color: "text-slate-500" },
  ];

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Domains Manager</h1>
          <p className="text-sm text-slate-500 mt-1">Track, manage, and renew domain registrations</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => { setShowImport(true); setImportResults(null); setImportRows([{ domain: "", expiryDate: "", status: "ACTIVE", customerId: "", projectId: "", notes: "", amount: "" }]); }}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition"
            >
              <Upload size={14} /> Import Domains
            </button>
          )}
          {isAdmin && (
            <button
              onClick={sendReminders}
              disabled={actionLoading === "reminders"}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
            >
              {actionLoading === "reminders" ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
              Send Reminders
            </button>
          )}
          <button
            onClick={fetchDomains}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition text-slate-700 dark:text-slate-300"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
          message.type === "success"
            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
            : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
        }`}>
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {message.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {filterTabs.map((ft) => (
          <button
            key={ft.key}
            onClick={() => setFilterTab(ft.key)}
            className={`text-left bg-white dark:bg-slate-800 rounded-xl border p-4 transition ${
              filterTab === ft.key
                ? "border-brand-500 ring-1 ring-brand-500/20"
                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
            }`}
          >
            <p className="text-xs text-slate-500 uppercase tracking-wide">{ft.label}</p>
            <p className={`text-2xl font-bold mt-1 ${ft.color}`}>{ft.count}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by domain name, user email, name, or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
        />
      </div>

      {/* Domain List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-16 text-center">
          <Globe className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No domains found.</p>
        </div>
      ) : (
        <>
          {/* Table Header */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-4 py-2">
            <div className="col-span-3"><SortHeader field="domain" label="Domain" sortField={sortField} onToggle={toggleSort} /></div>
            {isAdmin && <div className="col-span-2"><SortHeader field="user" label="Owner" sortField={sortField} onToggle={toggleSort} /></div>}
            <div className={isAdmin ? "col-span-1" : "col-span-2"}><SortHeader field="status" label="Status" sortField={sortField} onToggle={toggleSort} /></div>
            <div className="col-span-2"><SortHeader field="expiryDate" label="Expiry" sortField={sortField} onToggle={toggleSort} /></div>
            <div className="col-span-1"><span className="text-xs uppercase text-slate-500">Renewal</span></div>
            <div className={isAdmin ? "col-span-2" : "col-span-3"}><SortHeader field="createdAt" label="Registered" sortField={sortField} onToggle={toggleSort} /></div>
            <div className="col-span-1"></div>
          </div>

          <div className="space-y-2">
            {filteredAndSorted.map((d) => {
              const status = ORDER_STATUS_STYLE[d.status] || ORDER_STATUS_STYLE.PENDING;
              const isExpanded = expandedDomain === d.id;
              const isLoading = actionLoading === d.id;

              return (
                <div
                  key={d.id}
                  className={`bg-white dark:bg-slate-800 rounded-xl border overflow-hidden transition ${
                    d.expiryStatus === "critical" || d.expiryStatus === "expired"
                      ? "border-red-300 dark:border-red-800"
                      : d.expiryStatus === "warning"
                      ? "border-amber-300 dark:border-amber-800"
                      : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  {/* Domain Row */}
                  <div
                    className={`flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition ${EXPIRY_BG[d.expiryStatus]}`}
                    onClick={() => setExpandedDomain(isExpanded ? null : d.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="lg:grid lg:grid-cols-12 lg:gap-4 lg:items-center">
                        {/* Domain Name */}
                        <div className="col-span-3 flex items-center gap-2 min-w-0">
                          <Globe size={16} className={`flex-shrink-0 ${d.expiryStatus === "expired" || d.expiryStatus === "critical" ? "text-red-500" : "text-brand-500"}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {d.domain || "Unknown domain"}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {d.orderType === "DOMAIN_TRANSFER" ? "Transfer" : "Registration"}
                            </p>
                          </div>
                        </div>

                        {/* Owner */}
                        {isAdmin && d.user && (
                          <div className="col-span-2 hidden lg:block">
                            <p className="text-xs text-slate-700 dark:text-slate-300 truncate">
                              {d.user.firstName} {d.user.lastName}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">{d.user.company || d.user.email}</p>
                          </div>
                        )}

                        {/* Status */}
                        <div className={`${isAdmin ? "col-span-1" : "col-span-2"} hidden lg:block`}>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${status.bg}`}>
                            {status.icon} {status.text}
                          </span>
                        </div>

                        {/* Expiry */}
                        <div className="col-span-2 hidden lg:block">
                          {d.expiryDate ? (
                            <div>
                              <p className={`text-xs ${EXPIRY_STYLE[d.expiryStatus]}`}>
                                {formatDate(d.expiryDate)}
                              </p>
                              <p className={`text-[11px] ${EXPIRY_STYLE[d.expiryStatus]}`}>
                                {d.daysLeft !== null && d.daysLeft <= 0
                                  ? `Expired ${Math.abs(d.daysLeft)} days ago`
                                  : `${d.daysLeft} days left`}
                              </p>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Not set</span>
                          )}
                        </div>

                        {/* Price */}
                        <div className="col-span-1 hidden lg:block">
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {d.amount ? `${formatCurrency(d.amount)}/yr` : "—"}
                          </p>
                        </div>

                        {/* Registered */}
                        <div className={`${isAdmin ? "col-span-2" : "col-span-3"} hidden lg:block`}>
                          <p className="text-xs text-slate-500">{formatDate(d.createdAt)}</p>
                          {d.reminderSentAt && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded mt-0.5">
                              <Bell size={8} /> Reminded {formatDate(d.reminderSentAt)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mobile info */}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 lg:hidden">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${status.bg}`}>
                          {status.icon} {status.text}
                        </span>
                        {d.expiryDate && (
                          <span className={`text-[11px] ${EXPIRY_STYLE[d.expiryStatus]}`}>
                            {d.daysLeft !== null && d.daysLeft <= 0
                              ? `Expired ${Math.abs(d.daysLeft)}d ago`
                              : `${d.daysLeft}d left`}
                          </span>
                        )}
                        {isAdmin && d.user && (
                          <span className="text-[11px] text-slate-400">
                            {d.user.firstName} {d.user.lastName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isLoading && <Loader2 size={16} className="animate-spin text-slate-400" />}
                      {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                        <div>
                          <p className="text-xs text-slate-400 uppercase">Order ID</p>
                          <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{d.id.slice(0, 16)}...</p>
                        </div>
                        {isAdmin && d.user && (
                          <div>
                            <p className="text-xs text-slate-400 uppercase">Owner</p>
                            <Link
                              href={`/users/${d.user.id}`}
                              className="text-xs text-brand-600 hover:underline mt-0.5 inline-flex items-center gap-1"
                            >
                              {d.user.firstName} {d.user.lastName}
                              <ExternalLink size={10} />
                            </Link>
                            <p className="text-[11px] text-slate-400">{d.user.email}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-slate-400 uppercase">Product</p>
                          <p className="text-slate-700 dark:text-slate-300 text-xs mt-0.5">{d.product?.name || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 uppercase">Amount</p>
                          <p className="text-slate-700 dark:text-slate-300 text-xs mt-0.5">
                            {d.amount ? `${formatCurrency(d.amount)}/yr` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 uppercase">Invoice ID</p>
                          <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{d.invoiceNinjaInvoiceId || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 uppercase">Recurring ID</p>
                          <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{d.recurringInvoiceId || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 uppercase">Plesk Sub ID</p>
                          <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{d.pleskSubscriptionId || "—"}</p>
                        </div>
                        {d.provisionedAt && (
                          <div>
                            <p className="text-xs text-slate-400 uppercase">Provisioned</p>
                            <p className="text-slate-700 dark:text-slate-300 text-xs mt-0.5">{formatDate(d.provisionedAt)}</p>
                          </div>
                        )}

                        {/* Client Assignment */}
                        <div>
                          <p className="text-xs text-slate-400 uppercase flex items-center gap-1">
                            <Building2 size={10} /> Client
                          </p>
                          {isAdmin && editingAssign === d.id ? (
                            <select
                              title="Assign client"
                              value={assignCustomerId}
                              onChange={(e) => setAssignCustomerId(e.target.value)}
                              className="mt-0.5 px-1.5 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-700 dark:text-slate-300 dark:bg-slate-700 w-full"
                            >
                              <option value="">— None —</option>
                              {customers.map((c) => (
                                <option key={c.id} value={c.id}>{c.company}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex items-center gap-1 mt-0.5">
                              <p className="text-slate-700 dark:text-slate-300 text-xs">{d.customer?.company || "—"}</p>
                              {isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAssignCustomerId(d.customer?.id || "");
                                    setAssignProjectId(d.project?.id || "");
                                    setAssignSubProjectId(d.subProjectId || "");
                                    if (d.project?.id) fetchSubProjects(d.project.id);
                                    setEditingAssign(d.id);
                                  }}
                                  className="text-slate-400 hover:text-brand-500"
                                  title="Edit assignment"
                                >
                                  <Edit3 size={10} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Project Assignment */}
                        <div>
                          <p className="text-xs text-slate-400 uppercase flex items-center gap-1">
                            <FolderKanban size={10} /> Project
                          </p>
                          {isAdmin && editingAssign === d.id ? (
                            <div>
                              <select
                                title="Assign project"
                                value={assignProjectId}
                                onChange={(e) => {
                                  setAssignProjectId(e.target.value);
                                  setAssignSubProjectId("");
                                  if (e.target.value) fetchSubProjects(e.target.value);
                                }}
                                className="mt-0.5 px-1.5 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-700 dark:text-slate-300 dark:bg-slate-700 w-full"
                              >
                                <option value="">— None —</option>
                                {projects.map((p) => (
                                  <option key={p.id} value={p.id}>{p.projectName}</option>
                                ))}
                              </select>
                              {assignProjectId && (
                                <select
                                  title="Assign sub-project"
                                  value={assignSubProjectId}
                                  onChange={(e) => setAssignSubProjectId(e.target.value)}
                                  onFocus={() => assignProjectId && fetchSubProjects(assignProjectId)}
                                  className="mt-1 px-1.5 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-700 dark:text-slate-300 dark:bg-slate-700 w-full"
                                >
                                  <option value="">— No Sub-Project —</option>
                                  {(subProjectsCache[assignProjectId] || []).map((sp) => (
                                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                                  ))}
                                </select>
                              )}
                              <div className="flex gap-1 mt-1">
                                <button onClick={() => saveAssignment(d.id)} className="text-green-600 hover:text-green-700" title="Save">
                                  <Save size={12} />
                                </button>
                                <button onClick={() => setEditingAssign(null)} className="text-slate-400 hover:text-slate-600" title="Cancel">
                                  <X size={12} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-0.5">
                              <p className="text-slate-700 dark:text-slate-300 text-xs">{d.project?.projectName || "—"}</p>
                              {d.subProject && (
                                <p className="text-slate-500 dark:text-slate-400 text-xs ml-2">↳ {d.subProject.name}</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Expiry Date - Editable */}
                        <div>
                          <p className="text-xs text-slate-400 uppercase flex items-center gap-1">
                            <CalendarClock size={10} /> Expiry Date
                          </p>
                          {isAdmin && editingExpiry === d.id ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <input
                                type="date"
                                title="Domain expiry date"
                                value={expiryValue}
                                onChange={(e) => setExpiryValue(e.target.value)}
                                className="px-1.5 py-0.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-700 dark:text-slate-300 dark:bg-slate-700 w-32"
                              />
                              <button onClick={() => saveExpiry(d.id)} className="text-green-600 hover:text-green-700" title="Save">
                                <Save size={12} />
                              </button>
                              <button onClick={() => setEditingExpiry(null)} className="text-slate-400 hover:text-slate-600" title="Cancel">
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-xs ${d.expiryDate ? EXPIRY_STYLE[d.expiryStatus] : "text-slate-400"}`}>
                                {d.expiryDate ? formatDate(d.expiryDate) : "Not set"}
                                {d.daysLeft !== null && (
                                  <span className="ml-1">
                                    ({d.daysLeft <= 0 ? `expired ${Math.abs(d.daysLeft)}d ago` : `${d.daysLeft}d left`})
                                  </span>
                                )}
                              </span>
                              {isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpiryValue(d.expiryDate ? d.expiryDate.split("T")[0] : "");
                                    setEditingExpiry(d.id);
                                  }}
                                  className="text-slate-400 hover:text-brand-500"
                                  title="Edit expiry"
                                >
                                  <Edit3 size={10} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Notes - Editable */}
                        <div className="col-span-2">
                          <p className="text-xs text-slate-400 uppercase">Notes</p>
                          {isAdmin && editingNotes === d.id ? (
                            <div className="flex items-start gap-1 mt-0.5">
                              <textarea
                                title="Domain notes"
                                value={notesValue}
                                onChange={(e) => setNotesValue(e.target.value)}
                                rows={2}
                                className="flex-1 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-700 dark:text-slate-300 dark:bg-slate-700 resize-none"
                              />
                              <button onClick={() => saveNotes(d.id)} className="text-green-600 hover:text-green-700 mt-0.5" title="Save">
                                <Save size={12} />
                              </button>
                              <button onClick={() => setEditingNotes(null)} className="text-slate-400 hover:text-slate-600 mt-0.5" title="Cancel">
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-start gap-1 mt-0.5">
                              <p className="text-slate-700 dark:text-slate-300 text-xs">{d.notes || "—"}</p>
                              {isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNotesValue(d.notes || "");
                                    setEditingNotes(d.id);
                                  }}
                                  className="text-slate-400 hover:text-brand-500 flex-shrink-0"
                                  title="Edit notes"
                                >
                                  <Edit3 size={10} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Admin Actions */}
                      {isAdmin && (
                        <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                          {d.status === "PENDING" && (
                            <>
                              <button
                                onClick={() => updateOrderStatus(d.id, "QUOTED")}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                              >
                                <FileQuestion size={12} /> Mark Quoted
                              </button>
                              <button
                                onClick={() => updateOrderStatus(d.id, "PROFORMA_SENT")}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                              >
                                <FileQuestion size={12} /> Mark Proforma Sent
                              </button>
                            </>
                          )}
                          {(d.status === "QUOTED" || d.status === "PROFORMA_SENT") && (
                            <button
                              onClick={() => updateOrderStatus(d.id, "PAID")}
                              disabled={isLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                            >
                              <CheckCircle2 size={12} /> Mark Paid
                            </button>
                          )}
                          {(d.status === "PAID" || d.status === "PENDING" || d.status === "QUOTED") && (
                            <button
                              onClick={() => provisionOrder(d.id)}
                              disabled={isLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                            >
                              <Play size={12} /> Provision
                            </button>
                          )}
                          {d.status !== "CANCELLED" && (
                            <button
                              onClick={() => cancelOrder(d.id)}
                              disabled={isLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                            >
                              <Ban size={12} /> Cancel
                            </button>
                          )}
                          {d.status === "ACTIVE" && d.domain && (
                            <Link
                              href={`/dns-manager?domain=${encodeURIComponent(d.domain)}`}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition"
                            >
                              <Shield size={12} /> Manage DNS
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-slate-400 text-center">
            Showing {filteredAndSorted.length} of {stats.total} domains
          </p>
        </>
      )}

      {/* ─── Import Modal ─── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowImport(false)}>
          <div
            className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Upload size={20} className="text-brand-500" /> Import Domains
              </h2>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600" title="Close"><X size={20} /></button>
            </div>

            {/* CSV Paste area */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Paste CSV (domain, expiry, status, notes, amount) — or add rows manually
              </label>
              <textarea
                placeholder={"example.com,2027-01-15,ACTIVE,Client domain,150\nother.co.za,2026-06-30,ACTIVE,,200"}
                rows={3}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (text.includes(",") || text.includes("\t") || text.includes("\n")) {
                    e.preventDefault();
                    handleCsvPaste(text);
                  }
                }}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700 font-mono"
              />
            </div>

            {/* Import rows */}
            <div className="space-y-2 mb-4 max-h-[40vh] overflow-y-auto">
              {importRows.map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-3">
                    {i === 0 && <label className="block text-[10px] text-slate-500 mb-0.5">Domain *</label>}
                    <input
                      type="text"
                      placeholder="example.com"
                      value={row.domain}
                      onChange={(e) => updateImportRow(i, "domain", e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-900 dark:text-white dark:bg-slate-700"
                    />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="block text-[10px] text-slate-500 mb-0.5">Expiry</label>}
                    <input
                      type="date"
                      title="Expiry date"
                      value={row.expiryDate}
                      onChange={(e) => updateImportRow(i, "expiryDate", e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-900 dark:text-white dark:bg-slate-700"
                    />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="block text-[10px] text-slate-500 mb-0.5">Client</label>}
                    <select
                      title="Assign to client"
                      value={row.customerId}
                      onChange={(e) => updateImportRow(i, "customerId", e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-900 dark:text-white dark:bg-slate-700"
                    >
                      <option value="">— None —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.company}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="block text-[10px] text-slate-500 mb-0.5">Project</label>}
                    <select
                      title="Assign to project"
                      value={row.projectId}
                      onChange={(e) => updateImportRow(i, "projectId", e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-900 dark:text-white dark:bg-slate-700"
                    >
                      <option value="">— None —</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.projectName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="block text-[10px] text-slate-500 mb-0.5">Amount (ZAR)</label>}
                    <input
                      type="number"
                      placeholder="0.00"
                      value={row.amount}
                      onChange={(e) => updateImportRow(i, "amount", e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-900 dark:text-white dark:bg-slate-700"
                    />
                  </div>
                  <div className="col-span-1 flex items-end">
                    {i === 0 && <label className="block text-[10px] text-slate-500 mb-0.5">&nbsp;</label>}
                    <button
                      onClick={() => removeImportRow(i)}
                      disabled={importRows.length <= 1}
                      className="p-1.5 text-red-400 hover:text-red-600 disabled:opacity-30"
                      title="Remove row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={addImportRow}
                className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                <Plus size={12} /> Add Row
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {importRows.filter((r) => r.domain.trim()).length} domain(s)
                </span>
                <button
                  onClick={() => setShowImport(false)}
                  className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={submitImport}
                  disabled={importing || importRows.filter((r) => r.domain.trim()).length === 0}
                  className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  Import
                </button>
              </div>
            </div>

            {/* Import Results */}
            {importResults && (
              <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Import Results</h3>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {importResults.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                      r.status === "created" ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" :
                      r.status === "skipped" ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400" :
                      "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                    }`}>
                      {r.status === "created" ? <CheckCircle2 size={12} /> : r.status === "skipped" ? <AlertTriangle size={12} /> : <XCircle size={12} />}
                      <span className="font-mono">{r.domain}</span>
                      <span>— {r.status}{r.reason ? `: ${r.reason}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
