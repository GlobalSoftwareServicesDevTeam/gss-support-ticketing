"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  FileEdit,
  Plus,
  X,
  Send,
  Search,
  Loader2,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Edit3,
  Copy,
} from "lucide-react";

interface QuoteCustomer {
  id: string;
  company: string;
  emailAddress: string;
}

interface QuoteProject {
  id: string;
  projectName: string;
}

interface Quote {
  id: string;
  quoteNo: string;
  title: string | null;
  description: string | null;
  lineItems: string | null;
  amount: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  validUntil: string | null;
  notes: string | null;
  quoteStatus: string;
  clientName: string | null;
  clientEmail: string | null;
  clientCompany: string | null;
  clientSignature: string | null;
  clientSignedAt: string | null;
  clientSignedName: string | null;
  declineReason: string | null;
  token: string | null;
  sentAt: string | null;
  createdAt: string;
  customer: QuoteCustomer | null;
  project: QuoteProject | null;
}

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

const STATUS_BADGES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT: { label: "Draft", color: "bg-slate-100 text-slate-700", icon: <Edit3 size={12} /> },
  SENT: { label: "Sent", color: "bg-blue-100 text-blue-700", icon: <Send size={12} /> },
  VIEWED: { label: "Viewed", color: "bg-purple-100 text-purple-700", icon: <Eye size={12} /> },
  ACCEPTED: { label: "Accepted", color: "bg-green-100 text-green-700", icon: <CheckCircle2 size={12} /> },
  DECLINED: { label: "Declined", color: "bg-red-100 text-red-700", icon: <XCircle size={12} /> },
  EXPIRED: { label: "Expired", color: "bg-orange-100 text-orange-700", icon: <Clock size={12} /> },
  CONVERTED: { label: "Converted", color: "bg-teal-100 text-teal-700", icon: <CheckCircle2 size={12} /> },
};

export default function QuotesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<QuoteCustomer[]>([]);
  const [projects, setProjects] = useState<QuoteProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    clientName: "",
    clientEmail: "",
    clientCompany: "",
    customerId: "",
    projectId: "",
    taxRate: "15",
    validUntil: "",
    notes: "",
    lineItems: [{ description: "", qty: 1, unitPrice: 0 }] as LineItem[],
  });

  const [viewQuote, setViewQuote] = useState<Quote | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const fetchQuotes = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    try {
      const res = await fetch(`/api/quotes?${params}`);
      if (res.ok) setQuotes(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  useEffect(() => {
    if (isAdmin) {
      Promise.all([fetch("/api/customers"), fetch("/api/projects")]).then(async ([cRes, pRes]) => {
        if (cRes.ok) {
          const data = await cRes.json();
          setCustomers(Array.isArray(data) ? data : data.customers || []);
        }
        if (pRes.ok) setProjects(await pRes.json());
      });
    }
  }, [isAdmin]);

  function openCreate() {
    setEditingQuote(null);
    setForm({
      title: "",
      description: "",
      clientName: "",
      clientEmail: "",
      clientCompany: "",
      customerId: "",
      projectId: "",
      taxRate: "15",
      validUntil: "",
      notes: "",
      lineItems: [{ description: "", qty: 1, unitPrice: 0 }],
    });
    setMsg("");
    setShowModal(true);
  }

  function openEdit(q: Quote) {
    setEditingQuote(q);
    const items: LineItem[] = q.lineItems ? JSON.parse(q.lineItems) : [{ description: "", qty: 1, unitPrice: 0 }];
    setForm({
      title: q.title || "",
      description: q.description || "",
      clientName: q.clientName || "",
      clientEmail: q.clientEmail || "",
      clientCompany: q.clientCompany || "",
      customerId: q.customer?.id || "",
      projectId: q.project?.id || "",
      taxRate: String(q.taxRate ?? 15),
      validUntil: q.validUntil ? q.validUntil.split("T")[0] : "",
      notes: q.notes || "",
      lineItems: items.length > 0 ? items : [{ description: "", qty: 1, unitPrice: 0 }],
    });
    setMsg("");
    setShowModal(true);
  }

  function addLineItem() {
    setForm({ ...form, lineItems: [...form.lineItems, { description: "", qty: 1, unitPrice: 0 }] });
  }

  function removeLineItem(i: number) {
    if (form.lineItems.length <= 1) return;
    setForm({ ...form, lineItems: form.lineItems.filter((_, idx) => idx !== i) });
  }

  function updateLineItem(i: number, field: keyof LineItem, value: string | number) {
    const items = [...form.lineItems];
    if (field === "description") items[i].description = value as string;
    else if (field === "qty") items[i].qty = Number(value) || 0;
    else if (field === "unitPrice") items[i].unitPrice = Number(value) || 0;
    setForm({ ...form, lineItems: items });
  }

  const subtotal = form.lineItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
  const tax = subtotal * (Number(form.taxRate) / 100);
  const total = subtotal + tax;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg("");

    const payload = {
      title: form.title,
      description: form.description || null,
      clientName: form.clientName || null,
      clientEmail: form.clientEmail,
      clientCompany: form.clientCompany || null,
      customerId: form.customerId || null,
      projectId: form.projectId || null,
      taxRate: Number(form.taxRate),
      validUntil: form.validUntil || null,
      notes: form.notes || null,
      lineItems: form.lineItems.filter((li) => li.description.trim()),
    };

    try {
      const url = editingQuote ? `/api/quotes/${editingQuote.id}` : "/api/quotes";
      const method = editingQuote ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save quote");
      setShowModal(false);
      fetchQuotes();
    } catch (err: unknown) {
      setMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSend(quoteId: string) {
    if (!confirm("Send this quote to the client via email?")) return;
    setSending(quoteId);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to send");
      fetchQuotes();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setSending(null);
    }
  }

  async function handleDelete(quoteId: string) {
    if (!confirm("Delete this quote? This cannot be undone.")) return;
    await fetch(`/api/quotes/${quoteId}`, { method: "DELETE" });
    fetchQuotes();
  }

  function copyQuoteLink(token: string | null) {
    if (!token) return;
    const url = `${window.location.origin}/quote?token=${token}`;
    navigator.clipboard.writeText(url);
    alert("Quote link copied to clipboard");
  }

  function formatCurrency(val: number | null) {
    if (val == null) return "R0.00";
    return `R${Number(val).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const filtered = quotes.filter((q) => {
    if (search) {
      const s = search.toLowerCase();
      if (
        !(q.quoteNo || "").toLowerCase().includes(s) &&
        !(q.title || "").toLowerCase().includes(s) &&
        !(q.clientName || "").toLowerCase().includes(s) &&
        !(q.clientEmail || "").toLowerCase().includes(s) &&
        !(q.clientCompany || "").toLowerCase().includes(s) &&
        !(q.customer?.company || "").toLowerCase().includes(s)
      ) {
        return false;
      }
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileEdit size={24} /> Quotes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Create, send, and track client quotes</p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm inline-flex items-center gap-1"
          >
            <Plus size={16} /> New Quote
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quotes..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          title="Filter by status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SENT">Sent</option>
          <option value="VIEWED">Viewed</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="DECLINED">Declined</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      {/* Quotes Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileEdit size={48} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">No quotes found. {isAdmin ? "Click \"New Quote\" to create one." : ""}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-gray-800">
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Quote #</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Title</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Client</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Date</th>
                {isAdmin && <th className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-300">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map((q) => {
                const badge = STATUS_BADGES[q.quoteStatus] || STATUS_BADGES.DRAFT;
                return (
                  <tr key={q.id} className="bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-gray-800 transition">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">{q.quoteNo || "—"}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewQuote(q)} className="text-blue-600 hover:underline text-left font-medium">
                        {q.title || "Untitled"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700 dark:text-slate-300 text-xs">
                        {q.clientCompany || q.customer?.company || "—"}
                        {q.clientName && <span className="text-slate-400 ml-1">({q.clientName})</span>}
                      </div>
                      <div className="text-slate-400 text-xs">{q.clientEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                      {formatCurrency(q.totalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.icon} {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(q.createdAt).toLocaleDateString("en-ZA")}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {q.quoteStatus === "DRAFT" && (
                            <>
                              <button onClick={() => openEdit(q)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Edit">
                                <Edit3 size={14} className="text-slate-500" />
                              </button>
                              <button
                                onClick={() => handleSend(q.id)}
                                disabled={sending === q.id}
                                className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition text-blue-600"
                                title="Send to client"
                              >
                                {sending === q.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                              </button>
                            </>
                          )}
                          {(q.quoteStatus === "SENT" || q.quoteStatus === "VIEWED") && (
                            <button
                              onClick={() => handleSend(q.id)}
                              disabled={sending === q.id}
                              className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition text-blue-600"
                              title="Resend to client"
                            >
                              {sending === q.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            </button>
                          )}
                          <button onClick={() => copyQuoteLink(q.token)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="Copy link">
                            <Copy size={14} className="text-slate-500" />
                          </button>
                          <button onClick={() => setViewQuote(q)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition" title="View">
                            <Eye size={14} className="text-slate-500" />
                          </button>
                          {q.quoteStatus === "DRAFT" && (
                            <button onClick={() => handleDelete(q.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition text-red-500" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* View Quote Detail Modal */}
      {viewQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{viewQuote.quoteNo}</h2>
                <p className="text-sm text-slate-500">{viewQuote.title}</p>
              </div>
              <button title="Close" onClick={() => setViewQuote(null)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Status */}
              <div className="flex items-center gap-3">
                {(() => {
                  const b = STATUS_BADGES[viewQuote.quoteStatus] || STATUS_BADGES.DRAFT;
                  return <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${b.color}`}>{b.icon} {b.label}</span>;
                })()}
                {viewQuote.sentAt && <span className="text-xs text-slate-400">Sent {new Date(viewQuote.sentAt).toLocaleString("en-ZA")}</span>}
              </div>

              {/* Client Info */}
              <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Client</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{viewQuote.clientName || "—"}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{viewQuote.clientEmail}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{viewQuote.clientCompany || viewQuote.customer?.company || ""}</p>
              </div>

              {/* Line Items */}
              {viewQuote.lineItems && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Line Items</h3>
                  <table className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <thead className="bg-slate-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-slate-600 dark:text-slate-300">Description</th>
                        <th className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">Qty</th>
                        <th className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">Price</th>
                        <th className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {(JSON.parse(viewQuote.lineItems) as LineItem[]).map((li, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{li.description}</td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{li.qty}</td>
                          <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">{formatCurrency(li.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-300">{formatCurrency(li.qty * li.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals */}
              <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-4 text-right space-y-1">
                <p className="text-sm text-slate-500">Subtotal: <span className="font-medium text-slate-700 dark:text-slate-300">{formatCurrency(viewQuote.amount)}</span></p>
                <p className="text-sm text-slate-500">VAT ({viewQuote.taxRate ?? 15}%): <span className="font-medium text-slate-700 dark:text-slate-300">{formatCurrency(viewQuote.taxAmount)}</span></p>
                <p className="text-lg font-bold text-blue-600">Total: {formatCurrency(viewQuote.totalAmount)}</p>
              </div>

              {/* Valid Until */}
              {viewQuote.validUntil && (
                <p className="text-sm text-slate-500">Valid until: <strong>{new Date(viewQuote.validUntil).toLocaleDateString("en-ZA")}</strong></p>
              )}

              {/* Notes */}
              {viewQuote.notes && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Notes</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{viewQuote.notes}</p>
                </div>
              )}

              {/* Decline Reason */}
              {viewQuote.declineReason && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Decline Reason</h3>
                  <p className="text-sm text-red-600 dark:text-red-300">{viewQuote.declineReason}</p>
                </div>
              )}

              {/* Client Signature */}
              {viewQuote.clientSignature && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">Client Signature</h3>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={viewQuote.clientSignature} alt="Signature" className="max-w-[300px] bg-white rounded border border-green-200" />
                  <p className="text-sm text-green-600 dark:text-green-300 mt-2">
                    Signed by <strong>{viewQuote.clientSignedName}</strong> on {new Date(viewQuote.clientSignedAt!).toLocaleString("en-ZA")}
                  </p>
                </div>
              )}

              {/* Copy Link */}
              {viewQuote.token && (
                <button
                  onClick={() => copyQuoteLink(viewQuote.token)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-300"
                >
                  <Copy size={14} /> Copy Client Link
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingQuote ? `Edit Quote ${editingQuote.quoteNo}` : "New Quote"}
              </h2>
              <button title="Close" onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {msg && <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{msg}</div>}

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Client Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Client Name</label>
                  <input
                    type="text"
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    placeholder="John Doe"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Client Email *</label>
                  <input
                    type="email"
                    value={form.clientEmail}
                    onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                    placeholder="client@example.com"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Client Company</label>
                  <input
                    type="text"
                    value={form.clientCompany}
                    onChange={(e) => setForm({ ...form, clientCompany: e.target.value })}
                    placeholder="Company Name"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
                  />
                </div>
              </div>

              {/* Linked Customer / Project */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Link to Customer</label>
                  <select
                    title="Customer"
                    value={form.customerId}
                    onChange={(e) => {
                      const cust = customers.find((c) => c.id === e.target.value);
                      setForm({
                        ...form,
                        customerId: e.target.value,
                        clientEmail: form.clientEmail || cust?.emailAddress || "",
                        clientCompany: form.clientCompany || cust?.company || "",
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
                  >
                    <option value="">None</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.company}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Link to Project</label>
                  <select
                    title="Project"
                    value={form.projectId}
                    onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
                  >
                    <option value="">None</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.projectName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quote Details */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Website Development"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Detailed description of services..."
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
                />
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Line Items</label>
                  <button type="button" onClick={addLineItem} className="text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1">
                    <Plus size={12} /> Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {form.lineItems.map((li, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={li.description}
                        onChange={(e) => updateLineItem(i, "description", e.target.value)}
                        placeholder="Description"
                        className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
                      />
                      <input
                        title="Quantity"
                        type="number"
                        value={li.qty || ""}
                        onChange={(e) => updateLineItem(i, "qty", e.target.value)}
                        placeholder="Qty"
                        className="w-20 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm text-right"
                        min={0}
                      />
                      <input
                        title="Unit price"
                        type="number"
                        value={li.unitPrice || ""}
                        onChange={(e) => updateLineItem(i, "unitPrice", e.target.value)}
                        placeholder="Price"
                        className="w-28 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm text-right"
                        min={0}
                        step={0.01}
                      />
                      <span className="w-24 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
                        {formatCurrency(li.qty * li.unitPrice)}
                      </span>
                      {form.lineItems.length > 1 && (
                        <button type="button" onClick={() => removeLineItem(i)} className="p-1 text-red-400 hover:text-red-600 transition" title="Remove">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tax & Totals */}
              <div className="flex items-center justify-end gap-6 bg-slate-50 dark:bg-gray-800 rounded-lg p-4">
                <div className="text-sm text-slate-500 space-y-1 text-right">
                  <p>Subtotal: <span className="font-medium text-slate-700 dark:text-slate-300">{formatCurrency(subtotal)}</span></p>
                  <div className="flex items-center gap-2 justify-end">
                    <span>VAT</span>
                    <input
                      type="number"
                      title="VAT rate percentage"
                      value={form.taxRate}
                      onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                      className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-center text-sm dark:bg-gray-700 dark:text-white"
                      min={0}
                      max={100}
                    />
                    <span>%: <span className="font-medium text-slate-700 dark:text-slate-300">{formatCurrency(tax)}</span></span>
                  </div>
                  <p className="text-lg font-bold text-blue-600">Total: {formatCurrency(total)}</p>
                </div>
              </div>

              {/* Valid Until & Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Valid Until</label>
                  <input
                    type="date"
                    title="Valid until date"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={1}
                    placeholder="Terms, conditions, or additional notes..."
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white dark:bg-gray-800 text-sm"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {editingQuote ? "Update Quote" : "Create Quote"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
