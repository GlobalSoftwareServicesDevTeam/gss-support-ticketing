"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Globe,
  Search,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Server,
  RefreshCw,
  Info,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface DnsRecord {
  id?: number;
  type: string;
  host: string;
  value: string;
  opt?: string;
}

interface DomainOrder {
  id: string;
  domain: string;
  orderType: string;
  status: string;
  expiryDate?: string | null;
}

// ─── Constants ──────────────────────────────────────────

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];

const RECORD_TYPE_COLORS: Record<string, string> = {
  A: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  AAAA: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  CNAME: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  MX: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  TXT: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  NS: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  SRV: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  CAA: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  SOA: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400",
};

const RECORD_DESCRIPTIONS: Record<string, string> = {
  A: "Points domain to an IPv4 address",
  AAAA: "Points domain to an IPv6 address",
  CNAME: "Alias for another domain name",
  MX: "Mail server for the domain (set priority in Opt)",
  TXT: "Text record (SPF, DKIM, verification)",
  NS: "Nameserver for the domain",
  SRV: "Service location record",
  CAA: "Certificate Authority Authorization",
};

// ─── Component ──────────────────────────────────────────

export default function DnsManagerPage() {
  // Domain selection
  const [domains, setDomains] = useState<DomainOrder[]>([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");

  // DNS records
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [source, setSource] = useState<"plesk" | "dns" | "">("");
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("");

  // Nameservers
  const [nameservers, setNameservers] = useState<string[]>([]);
  const [nsLoading, setNsLoading] = useState(false);
  const [nsEditing, setNsEditing] = useState(false);
  const [nsForm, setNsForm] = useState(["", "", "", ""]);
  const [nsSubmitting, setNsSubmitting] = useState(false);

  // Add/Edit record
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null);
  const [form, setForm] = useState({ type: "A", host: "", value: "", opt: "" });
  const [submitting, setSubmitting] = useState(false);

  // UI
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [activeSection, setActiveSection] = useState<"dns" | "nameservers">("dns");

  // Fetch user's active domain orders
  useEffect(() => {
    fetch("/api/hosting/orders?status=ACTIVE")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const domainOrders = data.filter(
            (o: DomainOrder & { orderType: string }) =>
              o.domain && ["DOMAIN_REGISTER", "DOMAIN_TRANSFER", "HOSTING"].includes(o.orderType)
          );
          setDomains(domainOrders);
          if (domainOrders.length > 0 && !selectedDomain) {
            setSelectedDomain(domainOrders[0].domain);
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const activeDomain = customDomain || selectedDomain;

  // Fetch DNS records
  const fetchRecords = useCallback(async () => {
    if (!activeDomain) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hosting/dns?domain=${encodeURIComponent(activeDomain)}`);
      if (!res.ok) {
        const data = await res.json();
        showMsg("error", data.error || "Failed to fetch DNS records");
        setRecords([]);
        setSource("");
      } else {
        const data = await res.json();
        setRecords(data.records || []);
        setSource(data.source || "dns");
      }
    } catch {
      showMsg("error", "Failed to fetch DNS records");
    }
    setLoading(false);
  }, [activeDomain]);

  // Fetch nameservers
  const fetchNameservers = useCallback(async () => {
    if (!activeDomain) return;
    setNsLoading(true);
    try {
      const res = await fetch(`/api/hosting/nameservers?domain=${encodeURIComponent(activeDomain)}`);
      const data = await res.json();
      setNameservers(data.nameservers || []);
    } catch {
      setNameservers([]);
    }
    setNsLoading(false);
  }, [activeDomain]);

  useEffect(() => {
    if (activeDomain) {
      fetchRecords();
      fetchNameservers();
    }
  }, [activeDomain, fetchRecords, fetchNameservers]);

  // Add DNS record
  async function handleAddRecord() {
    if (!form.type || !form.host || !form.value) {
      showMsg("error", "Type, host, and value are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/hosting/dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: activeDomain,
          type: form.type,
          host: form.host,
          value: form.value,
          opt: form.opt || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showMsg("error", data.error || "Failed to add record");
      } else {
        showMsg("success", `${form.type} record added successfully`);
        setForm({ type: "A", host: "", value: "", opt: "" });
        setShowAddForm(false);
        fetchRecords();
      }
    } catch {
      showMsg("error", "Failed to add record");
    }
    setSubmitting(false);
  }

  // Update DNS record
  async function handleUpdateRecord() {
    if (!editingRecord?.id) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/hosting/dns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: editingRecord.id,
          domain: activeDomain,
          type: form.type,
          host: form.host,
          value: form.value,
          opt: form.opt || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        showMsg("error", data.error || "Failed to update record");
      } else {
        showMsg("success", "Record updated successfully");
        setEditingRecord(null);
        setForm({ type: "A", host: "", value: "", opt: "" });
        fetchRecords();
      }
    } catch {
      showMsg("error", "Failed to update record");
    }
    setSubmitting(false);
  }

  // Delete DNS record
  async function handleDeleteRecord(recordId: number) {
    if (!confirm("Delete this DNS record?")) return;
    try {
      const res = await fetch(
        `/api/hosting/dns?recordId=${recordId}&domain=${encodeURIComponent(activeDomain)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        showMsg("error", data.error || "Failed to delete record");
      } else {
        showMsg("success", "Record deleted");
        fetchRecords();
      }
    } catch {
      showMsg("error", "Failed to delete record");
    }
  }

  // Submit nameserver change request
  async function handleSubmitNameservers() {
    const filtered = nsForm.filter((ns) => ns.trim());
    if (filtered.length < 1) {
      showMsg("error", "At least 1 nameserver is required");
      return;
    }
    setNsSubmitting(true);
    try {
      const res = await fetch("/api/hosting/nameservers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: activeDomain, nameservers: filtered }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMsg("error", data.error || "Failed to submit nameserver change");
      } else {
        showMsg("success", data.message || "Nameserver change request submitted");
        setNsEditing(false);
      }
    } catch {
      showMsg("error", "Failed to submit nameserver change");
    }
    setNsSubmitting(false);
  }

  const filteredRecords = filterType
    ? records.filter((r) => r.type === filterType)
    : records;

  const recordTypeCounts = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">DNS Manager</h1>
          <p className="text-sm text-slate-500 mt-1">Manage DNS records and nameservers for your domains</p>
        </div>
      </div>

      {/* Domain Selector */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {domains.length > 0 && (
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Select Domain</label>
              <select
                title="Select domain"
                value={selectedDomain}
                onChange={(e) => {
                  setSelectedDomain(e.target.value);
                  setCustomDomain("");
                }}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
              >
                {domains.map((d) => (
                  <option key={d.id} value={d.domain}>
                    {d.domain} ({d.orderType === "HOSTING" ? "Hosting" : "Domain"})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={domains.length > 0 ? "flex-1" : "flex-1"}>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {domains.length > 0 ? "Or enter custom domain" : "Enter domain"}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchRecords()}
                placeholder="example.co.za"
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
              />
              <button
                onClick={() => {
                  fetchRecords();
                  fetchNameservers();
                }}
                disabled={!activeDomain || loading}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Lookup
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
            message.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {message.text}
        </div>
      )}

      {/* Section Tabs */}
      {activeDomain && (
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveSection("dns")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              activeSection === "dns"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Globe size={14} className="inline mr-1.5 -mt-0.5" />
            DNS Records
          </button>
          <button
            onClick={() => setActiveSection("nameservers")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              activeSection === "nameservers"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Server size={14} className="inline mr-1.5 -mt-0.5" />
            Nameservers
          </button>
        </div>
      )}

      {/* ─── DNS Records Section ───────────────────────── */}
      {activeDomain && activeSection === "dns" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilterType("")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  !filterType ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                All ({records.length})
              </button>
              {Object.entries(recordTypeCounts).map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type === filterType ? "" : type)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                    filterType === type
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {type} ({count})
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {source && (
                <span className={`text-[10px] px-2 py-0.5 rounded ${source === "plesk" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {source === "plesk" ? "Managed (Plesk)" : "Read-only (DNS Lookup)"}
                </span>
              )}
              <button
                onClick={fetchRecords}
                disabled={loading}
                className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                title="Refresh"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
              {source === "plesk" && (
                <button
                  onClick={() => {
                    setShowAddForm(true);
                    setEditingRecord(null);
                    setForm({ type: "A", host: "", value: "", opt: "" });
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                >
                  <Plus size={14} /> Add Record
                </button>
              )}
            </div>
          </div>

          {/* Add/Edit Form */}
          {(showAddForm || editingRecord) && source === "plesk" && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">
                {editingRecord ? "Edit DNS Record" : "Add DNS Record"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Type</label>
                  <select
                    title="Record type"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
                  >
                    {RECORD_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Host</label>
                  <input
                    type="text"
                    value={form.host}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                    placeholder={`e.g. ${activeDomain} or subdomain.${activeDomain}`}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Value</label>
                  <input
                    type="text"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder={
                      form.type === "A" ? "192.168.1.1" :
                      form.type === "CNAME" ? "target.example.com" :
                      form.type === "MX" ? "mail.example.com" :
                      form.type === "TXT" ? "v=spf1 include:..." :
                      "value"
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {form.type === "MX" ? "Priority" : "Options"}
                  </label>
                  <input
                    type="text"
                    value={form.opt}
                    onChange={(e) => setForm({ ...form, opt: e.target.value })}
                    placeholder={form.type === "MX" ? "10" : "optional"}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
                  />
                </div>
              </div>
              {RECORD_DESCRIPTIONS[form.type] && (
                <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                  <Info size={10} /> {RECORD_DESCRIPTIONS[form.type]}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={editingRecord ? handleUpdateRecord : handleAddRecord}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {editingRecord ? "Update" : "Add Record"}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingRecord(null);
                    setForm({ type: "A", host: "", value: "", opt: "" });
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          )}

          {/* Records Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 size={20} className="animate-spin mr-2" /> Loading DNS records...
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Globe size={32} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">{records.length === 0 ? "No DNS records found" : "No records match the filter"}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Host</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Value</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Priority/Opt</th>
                      {source === "plesk" && (
                        <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredRecords.map((record, idx) => (
                      <tr key={record.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${RECORD_TYPE_COLORS[record.type] || "bg-slate-100 text-slate-600"}`}>
                            {record.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 font-mono text-xs max-w-[200px] truncate" title={record.host}>
                          {record.host}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 font-mono text-xs max-w-[300px] truncate" title={record.value}>
                          {record.value}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {record.opt || "—"}
                        </td>
                        {source === "plesk" && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {record.id && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingRecord(record);
                                      setShowAddForm(false);
                                      setForm({
                                        type: record.type,
                                        host: record.host,
                                        value: record.value,
                                        opt: record.opt || "",
                                      });
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 transition"
                                    title="Edit"
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRecord(record.id!)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 transition"
                                    title="Delete"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Nameservers Section ───────────────────────── */}
      {activeDomain && activeSection === "nameservers" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Server size={18} className="text-blue-600" /> Nameservers for {activeDomain}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchNameservers}
                  disabled={nsLoading}
                  className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  title="Refresh"
                >
                  <RefreshCw size={14} className={nsLoading ? "animate-spin" : ""} />
                </button>
                {!nsEditing && (
                  <button
                    onClick={() => {
                      setNsEditing(true);
                      const padded = [...nameservers, "", "", "", ""].slice(0, 4);
                      setNsForm(padded);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                  >
                    <Edit3 size={14} /> Change Nameservers
                  </button>
                )}
              </div>
            </div>

            {/* Current Nameservers */}
            {nsLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 size={18} className="animate-spin mr-2" /> Loading nameservers...
              </div>
            ) : !nsEditing ? (
              <div className="space-y-2">
                {nameservers.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4">No nameservers could be resolved for this domain</p>
                ) : (
                  nameservers.map((ns, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                      <span className="text-xs font-medium text-slate-400 w-8">NS{i + 1}</span>
                      <span className="text-sm font-mono text-slate-700 dark:text-slate-300">{ns}</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Edit Nameservers Form */
              <div className="space-y-3">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Changing nameservers will affect where your domain&apos;s DNS is managed.
                    This request will be submitted to our team for processing. Changes may take up to 48 hours to propagate globally.
                  </p>
                </div>
                {nsForm.map((ns, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-400 w-8">NS{i + 1}</span>
                    <input
                      type="text"
                      value={ns}
                      onChange={(e) => {
                        const updated = [...nsForm];
                        updated[i] = e.target.value;
                        setNsForm(updated);
                      }}
                      placeholder={`ns${i + 1}.example.com`}
                      className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-mono text-slate-900 dark:text-white dark:bg-slate-700"
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSubmitNameservers}
                    disabled={nsSubmitting}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {nsSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Submit Request
                  </button>
                  <button
                    onClick={() => setNsEditing(false)}
                    className="flex items-center gap-1.5 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Common nameserver presets */}
          {nsEditing && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Common Nameserver Presets</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {[
                  { label: "Cloudflare", ns: ["carl.ns.cloudflare.com", "jane.ns.cloudflare.com"] },
                  { label: "Google Cloud DNS", ns: ["ns-cloud-a1.googledomains.com", "ns-cloud-a2.googledomains.com"] },
                  { label: "AWS Route 53", ns: ["ns-0000.awsdns-00.org", "ns-0000.awsdns-00.co.uk"] },
                  { label: "GoDaddy", ns: ["ns73.domaincontrol.com", "ns74.domaincontrol.com"] },
                  { label: "Hetzner", ns: ["helium.ns.hetzner.de", "hydrogen.ns.hetzner.com", "oxygen.ns.hetzner.com"] },
                  { label: "Afrihost", ns: ["ns1.afrihost.com", "ns2.afrihost.com"] },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      const padded = [...preset.ns, "", "", "", ""].slice(0, 4);
                      setNsForm(padded);
                    }}
                    className="text-left p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition"
                  >
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{preset.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">{preset.ns[0]}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!activeDomain && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Globe size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-lg font-medium text-slate-900 dark:text-white">Select a domain to manage</p>
          <p className="text-sm text-slate-400 mt-1">Choose from your registered domains or enter a custom domain above</p>
        </div>
      )}
    </div>
  );
}
