"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import InvoicePaymentModal from "@/components/invoice-payment-modal";
import { Receipt, FileEdit, CreditCard, Banknote, CalendarClock, RefreshCw, Plus, Send, ArrowRightLeft, X, Trash2, Ban } from "lucide-react";
import PaymentsPage from "../payments/page";
import PaymentArrangementsPage from "../payment-arrangements/page";
import {
  exportRowsAsCSV,
  exportRowsAsExcel,
  exportRowsAsPDF,
  exportRowsToGoogleSheets,
} from "@/lib/reports-export";

type InvoiceType = "invoices" | "quotes" | "credits" | "recurring_invoices";
type FinanceTab = InvoiceType | "make-payment" | "payment-history" | "eft-bank-details" | "pay-arrangements";

interface InvoiceItem {
  id: string;
  number: string;
  date: string;
  due_date?: string;
  amount: number;
  balance: number;
  status_id: string;
  frequency_id?: string;
  next_send_date?: string;
  client?: { display_name?: string; name?: string; id?: string };
  line_items?: Array<{ product_key?: string; notes?: string; cost: number; quantity: number; line_total?: number }>;
}

interface NinjaClient {
  id: string;
  name: string;
  display_name: string;
  contacts: { email: string; first_name: string; last_name: string }[];
}

interface LineItemRow {
  productKey: string;
  notes: string;
  cost: number;
  quantity: number;
}

type CreateMode = "quote" | "invoice" | "credit" | null;

const FREQUENCY_LABELS: Record<string, string> = {
  "1": "Daily", "2": "Weekly", "3": "Bi-weekly", "4": "Monthly",
  "5": "Bi-monthly", "6": "Quarterly", "7": "Every 4 months",
  "8": "Semi-annually", "9": "Annually", "10": "Every 2 years", "11": "Every 3 years",
};

const TYPE_TABS: { key: FinanceTab; label: string; icon: React.ReactNode }[] = [
  { key: "invoices", label: "Invoices", icon: <Receipt size={16} /> },
  { key: "recurring_invoices", label: "Recurring", icon: <RefreshCw size={16} /> },
  { key: "quotes", label: "Quotes", icon: <FileEdit size={16} /> },
  { key: "credits", label: "Credit Notes", icon: <CreditCard size={16} /> },
  { key: "make-payment", label: "Make Payment", icon: <CreditCard size={16} /> },
  { key: "payment-history", label: "Payment History", icon: <Banknote size={16} /> },
  { key: "pay-arrangements", label: "Pay Arrangements", icon: <CalendarClock size={16} /> },
  { key: "eft-bank-details", label: "EFT Bank Details", icon: <Banknote size={16} /> },
];

function getStatusLabel(type: InvoiceType, statusId: string): { label: string; color: string } {
  const invoiceStatuses: Record<string, { label: string; color: string }> = {
    "1": { label: "Draft", color: "bg-slate-100 text-slate-700" },
    "2": { label: "Sent", color: "bg-blue-100 text-blue-700" },
    "3": { label: "Partial", color: "bg-yellow-100 text-yellow-700" },
    "4": { label: "Paid", color: "bg-green-100 text-green-700" },
    "5": { label: "Cancelled", color: "bg-red-100 text-red-700" },
    "6": { label: "Overdue", color: "bg-orange-100 text-orange-700" },
  };
  const quoteStatuses: Record<string, { label: string; color: string }> = {
    "1": { label: "Draft", color: "bg-slate-100 text-slate-700" },
    "2": { label: "Sent", color: "bg-blue-100 text-blue-700" },
    "3": { label: "Approved", color: "bg-green-100 text-green-700" },
    "4": { label: "Converted", color: "bg-teal-100 text-teal-700" },
    "5": { label: "Expired", color: "bg-red-100 text-red-700" },
  };
  const recurringStatuses: Record<string, { label: string; color: string }> = {
    "1": { label: "Draft", color: "bg-slate-100 text-slate-700" },
    "2": { label: "Active", color: "bg-green-100 text-green-700" },
    "3": { label: "Paused", color: "bg-yellow-100 text-yellow-700" },
    "4": { label: "Completed", color: "bg-blue-100 text-blue-700" },
    "-1": { label: "Pending", color: "bg-orange-100 text-orange-700" },
  };
  const map = type === "quotes" ? quoteStatuses : type === "recurring_invoices" ? recurringStatuses : invoiceStatuses;
  return map[statusId] || { label: `Status ${statusId}`, color: "bg-gray-100 text-gray-700" };
}

function isInvoiceType(tab: FinanceTab): tab is InvoiceType {
  return tab === "invoices" || tab === "quotes" || tab === "credits" || tab === "recurring_invoices";
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

const emptyLineItem = (): LineItemRow => ({ productKey: "", notes: "", cost: 0, quantity: 1 });

export default function InvoicesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [type, setType] = useState<InvoiceType>("invoices");
  const [activeTab, setActiveTab] = useState<FinanceTab>("invoices");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  // Payment modal state
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<InvoiceItem | null>(null);
  const [depositMode, setDepositMode] = useState(false);

  // Admin create modal state
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [clients, setClients] = useState<NinjaClient[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLineItem()]);
  const [dueDate, setDueDate] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [publicNotes, setPublicNotes] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchItems = useCallback(() => {
    setLoading(true);
    setError("");
    fetch(`/api/invoices?type=${type}`)
      .then(async (r) => {
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) throw new Error(`Server returned ${r.status} (non-JSON response)`);
        return r.json();
      })
      .then((data) => {
        if (data.configured === false) { setConfigured(false); setItems([]); }
        else if (data.error) { setError(data.error); setItems([]); }
        else { setConfigured(true); setItems(Array.isArray(data.data) ? data.data : []); }
        setLoading(false);
      })
      .catch((e) => { setError(e.message || "Failed to fetch data"); setLoading(false); });
  }, [type]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const loadClients = useCallback(async () => {
    if (clientsLoaded) return;
    try {
      const res = await fetch("/api/invoices/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_clients" }),
      });
      const data = await res.json();
      setClients(data.clients || []);
      setClientsLoaded(true);
    } catch { /* ignore */ }
  }, [clientsLoaded]);

  function openCreateModal(mode: CreateMode) {
    setCreateMode(mode);
    setSelectedClientId("");
    setLineItems([emptyLineItem()]);
    setDueDate("");
    setValidUntil("");
    setPublicNotes("");
    setPrivateNotes("");
    setCreateError("");
    loadClients();
  }

  function updateLineItem(index: number, field: keyof LineItemRow, value: string | number) {
    setLineItems((prev) => prev.map((li, i) => i === index ? { ...li, [field]: value } : li));
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  }

  const lineItemTotal = lineItems.reduce((s, li) => s + li.cost * li.quantity, 0);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId) { setCreateError("Please select a client"); return; }
    const validItems = lineItems.filter((li) => li.productKey && li.cost > 0);
    if (validItems.length === 0) { setCreateError("Add at least one line item with a name and cost"); return; }

    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/invoices/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: createMode === "quote" ? "create_quote" : createMode === "invoice" ? "create_invoice" : "create_credit",
          clientId: selectedClientId,
          lineItems: validItems,
          dueDate: dueDate || undefined,
          validUntil: createMode === "quote" ? (validUntil || undefined) : undefined,
          publicNotes: publicNotes || undefined,
          privateNotes: privateNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || "Failed"); setCreating(false); return; }
      setCreateMode(null);
      setSuccessMsg(`${createMode === "quote" ? "Quote" : createMode === "invoice" ? "Invoice" : "Credit Note"} created successfully!`);
      setTimeout(() => setSuccessMsg(""), 4000);
      // Switch to the relevant tab and reload
      if (createMode === "quote") setType("quotes");
      else if (createMode === "invoice") setType("invoices");
      else setType("credits");
      fetchItems();
    } catch (err) {
      setCreateError(String(err));
    }
    setCreating(false);
  }

  async function invoiceAction(action: string, params: Record<string, string>) {
    const key = `${action}-${Object.values(params)[0]}`;
    setActionLoading(key);
    try {
      const res = await fetch("/api/invoices/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...params }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Action failed"); setActionLoading(null); return; }
      if (action === "convert_quote") {
        setSuccessMsg(`Quote converted to invoice ${data.invoice?.number || ""}!`);
        setTimeout(() => setSuccessMsg(""), 4000);
      } else if (action === "send_quote" || action === "send_invoice") {
        setSuccessMsg("Email sent successfully!");
        setTimeout(() => setSuccessMsg(""), 4000);
      } else if (action === "approve_quote") {
        setSuccessMsg("Quote approved!");
        setTimeout(() => setSuccessMsg(""), 4000);
      } else if (action === "cancel_invoice") {
        setSuccessMsg("Invoice cancelled.");
        setTimeout(() => setSuccessMsg(""), 4000);
      }
      fetchItems();
    } catch (err) {
      alert(String(err));
    }
    setActionLoading(null);
  }

  const hasActions = type === "invoices" || (isAdmin && (type === "quotes" || type === "credits"));
  const colCount = hasActions ? 7 : 6;

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const clientQ = clientFilter.trim().toLowerCase();
    const projectQ = projectFilter.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    return items.filter((item) => {
      const text = [
        item.number,
        item.client?.display_name,
        item.client?.name,
        item.line_items?.map((li) => `${li.product_key || ""} ${li.notes || ""}`).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (q && !text.includes(q)) return false;
      if (clientQ && !(item.client?.display_name || item.client?.name || "").toLowerCase().includes(clientQ)) return false;
      if (projectQ && !(item.line_items?.some((li) => `${li.product_key || ""} ${li.notes || ""}`.toLowerCase().includes(projectQ)))) return false;

      const dateText = item.date || item.next_send_date;
      if ((from || to) && dateText) {
        const d = new Date(dateText);
        if (from && d < from) return false;
        if (to && d > to) return false;
      } else if (from || to) {
        return false;
      }

      return true;
    });
  }, [items, search, clientFilter, projectFilter, fromDate, toDate]);

  async function exportInvoices(format: "csv" | "excel" | "pdf" | "gsheets") {
    const rows = filteredItems.map((item) => {
      const status = getStatusLabel(type, item.status_id);
      return {
        Type: type,
        Number: item.number || "",
        Client: item.client?.display_name || item.client?.name || "",
        Date: item.date ? new Date(item.date).toLocaleDateString("en-ZA") : "",
        DueDate: item.due_date ? new Date(item.due_date).toLocaleDateString("en-ZA") : "",
        Amount: item.amount,
        Balance: item.balance,
        Status: status.label,
      };
    });

    const filename = `financial-${type}-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") await exportRowsAsCSV(rows, filename);
    if (format === "excel") await exportRowsAsExcel(rows, filename);
    if (format === "pdf") await exportRowsAsPDF(rows, filename, `Financial Report (${type})`);
    if (format === "gsheets") await exportRowsToGoogleSheets(rows, filename);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Invoices & Financial Documents</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => openCreateModal("quote")} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
              <Plus size={16} /> Quote
            </button>
            <button onClick={() => openCreateModal("invoice")} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium">
              <Plus size={16} /> Invoice
            </button>
            <button onClick={() => openCreateModal("credit")} className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium">
              <Plus size={16} /> Credit Note
            </button>
          </div>
        )}
      </div>

      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{successMsg}</div>
      )}

      {!configured && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">Invoice Ninja Not Configured</h2>
          <p className="text-sm text-yellow-700">
            To connect Invoice Ninja, add the following environment variables:
          </p>
          <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside">
            <li><code className="bg-yellow-100 px-1 rounded">INVOICE_NINJA_URL</code> - Your Invoice Ninja server URL</li>
            <li><code className="bg-yellow-100 px-1 rounded">INVOICE_NINJA_TOKEN</code> - Your Invoice Ninja API token</li>
          </ul>
        </div>
      )}

      {/* Type tabs */}
      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-6">
          {TYPE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                if (isInvoiceType(t.key)) setType(t.key);
              }}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                activeTab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="inline-flex items-center gap-1">{t.icon} {t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "make-payment" && <PaymentsPage embeddedTab="pay" hideHeader hideTabs />}
      {activeTab === "payment-history" && <PaymentsPage embeddedTab="history" hideHeader hideTabs />}
      {activeTab === "pay-arrangements" && <PaymentArrangementsPage hideHeader compact />}
      {activeTab === "eft-bank-details" && <PaymentsPage embeddedTab="eft-settings" hideHeader hideTabs />}

      {isInvoiceType(activeTab) && (
      <>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search number/client/item..."
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
        />
        {isAdmin && (
          <input
            type="text"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            placeholder="Client filter"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
          />
        )}
        <input
          type="text"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          placeholder="Project filter"
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
        />
        <input
          type="date"
          title="From date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
        />
        <input
          type="date"
          title="To date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
        />
        <button onClick={() => exportInvoices("csv")} className="px-3 py-2 text-xs border border-slate-300 rounded text-slate-700">CSV</button>
        <button onClick={() => exportInvoices("excel")} className="px-3 py-2 text-xs border border-slate-300 rounded text-slate-700">Excel</button>
        <button onClick={() => exportInvoices("pdf")} className="px-3 py-2 text-xs border border-slate-300 rounded text-slate-700">PDF</button>
        <button onClick={() => exportInvoices("gsheets")} className="px-3 py-2 text-xs border border-slate-300 rounded text-slate-700">GSheets</button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Number</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Client</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">
                {type === "recurring_invoices" ? "Frequency" : "Date"}
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Amount</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">
                {type === "recurring_invoices" ? "Next Send" : "Balance"}
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
              {hasActions && (
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={colCount} className="px-6 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : filteredItems.length === 0 ? (
              <tr><td colSpan={colCount} className="px-6 py-8 text-center text-slate-400">No {type.replace("_", " ")} found.</td></tr>
            ) : (
              filteredItems.map((item) => {
                const status = getStatusLabel(type, item.status_id);
                const hasBalance = item.balance > 0;
                const isPayable = type === "invoices" && hasBalance && !["4", "5"].includes(item.status_id);

                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.number || "â€”"}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {item.client?.display_name || item.client?.name || "â€”"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {type === "recurring_invoices"
                        ? (FREQUENCY_LABELS[item.frequency_id || ""] || `Freq ${item.frequency_id}`)
                        : (item.date ? new Date(item.date).toLocaleDateString() : "â€”")}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{formatCurrency(item.amount)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {type === "recurring_invoices"
                        ? (item.next_send_date ? new Date(item.next_send_date).toLocaleDateString() : "â€”")
                        : formatCurrency(item.balance)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>

                    {/* Invoice actions */}
                    {type === "invoices" && (
                      <td className="px-6 py-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {isPayable && (
                            <>
                              <button
                                onClick={() => { setPayInvoice(item); setDepositMode(false); setPayModalOpen(true); }}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-xs font-medium"
                              >
                                Pay Now
                              </button>
                              <button
                                onClick={() => { setPayInvoice(item); setDepositMode(true); setPayModalOpen(true); }}
                                className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-xs font-medium"
                              >
                                40% Deposit
                              </button>
                            </>
                          )}
                          {isAdmin && ["1", "2", "6"].includes(item.status_id) && (
                            <button
                              onClick={() => invoiceAction("send_invoice", { invoiceId: item.id })}
                              disabled={actionLoading === `send_invoice-${item.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-100 text-sky-700 rounded-md hover:bg-sky-200 transition text-xs font-medium disabled:opacity-50"
                            >
                              <Send size={11} /> {actionLoading === `send_invoice-${item.id}` ? "..." : "Send"}
                            </button>
                          )}
                          {isAdmin && ["1", "2", "3", "6"].includes(item.status_id) && (
                            <button
                              onClick={() => { if (confirm(`Cancel invoice ${item.number}?`)) invoiceAction("cancel_invoice", { invoiceId: item.id }); }}
                              disabled={actionLoading === `cancel_invoice-${item.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition text-xs font-medium disabled:opacity-50"
                            >
                              <Ban size={11} /> Cancel
                            </button>
                          )}
                          {!isPayable && !isAdmin && (
                            <span className="text-xs text-slate-400">
                              {item.status_id === "4" ? "Paid" : item.status_id === "5" ? "Cancelled" : "â€”"}
                            </span>
                          )}
                        </div>
                      </td>
                    )}

                    {/* Quote actions (admin) */}
                    {type === "quotes" && isAdmin && (
                      <td className="px-6 py-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {["1", "2"].includes(item.status_id) && (
                            <button
                              onClick={() => invoiceAction("send_quote", { quoteId: item.id })}
                              disabled={actionLoading === `send_quote-${item.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-100 text-sky-700 rounded-md hover:bg-sky-200 transition text-xs font-medium disabled:opacity-50"
                            >
                              <Send size={11} /> {actionLoading === `send_quote-${item.id}` ? "..." : "Send"}
                            </button>
                          )}
                          {["1", "2"].includes(item.status_id) && (
                            <button
                              onClick={() => invoiceAction("approve_quote", { quoteId: item.id })}
                              disabled={actionLoading === `approve_quote-${item.id}`}
                              className="px-2.5 py-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition text-xs font-medium disabled:opacity-50"
                            >
                              {actionLoading === `approve_quote-${item.id}` ? "..." : "Approve"}
                            </button>
                          )}
                          {["1", "2", "3"].includes(item.status_id) && (
                            <button
                              onClick={() => { if (confirm(`Convert quote ${item.number} to invoice?`)) invoiceAction("convert_quote", { quoteId: item.id }); }}
                              disabled={actionLoading === `convert_quote-${item.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition text-xs font-medium disabled:opacity-50"
                            >
                              <ArrowRightLeft size={11} /> {actionLoading === `convert_quote-${item.id}` ? "..." : "â†’ Invoice"}
                            </button>
                          )}
                          {item.status_id === "4" && (
                            <span className="text-xs text-teal-600 font-medium">Converted</span>
                          )}
                        </div>
                      </td>
                    )}

                    {/* Credit notes â€” no actions needed but keep column */}
                    {type === "credits" && isAdmin && (
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-400">â€”</span>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </>
      )}

      {/* Payment modal */}
      {payInvoice && (
        <InvoicePaymentModal
          key={`${payInvoice.id}-${depositMode}`}
          isOpen={payModalOpen}
          onClose={() => { setPayModalOpen(false); setPayInvoice(null); }}
          invoiceNumber={payInvoice.number}
          invoiceAmount={payInvoice.amount}
          invoiceBalance={payInvoice.balance}
          clientName={payInvoice.client?.display_name || payInvoice.client?.name || ""}
          depositMode={depositMode}
        />
      )}

      {/* Create Quote / Invoice / Credit Note Modal */}
      {createMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {createMode === "quote" ? "Create Quote" : createMode === "invoice" ? "Create Invoice" : "Create Credit Note"}
              </h2>
              <button title="Close" onClick={() => setCreateMode(null)} className="p-1 hover:bg-slate-100 rounded"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 overflow-y-auto flex-1 space-y-5">
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{createError}</div>
              )}

              {/* Client selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                <select
                  title="Select client"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  required
                >
                  <option value="">â€” Select a client â€”</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.display_name || c.name}</option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {createMode !== "credit" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                    <input type="date" title="Due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900" />
                  </div>
                )}
                {createMode === "quote" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Valid Until</label>
                    <input type="date" title="Valid until" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900" />
                  </div>
                )}
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Line Items *</label>
                  <button type="button" onClick={() => setLineItems([...lineItems, emptyLineItem()])} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    + Add Item
                  </button>
                </div>
                <div className="space-y-2">
                  {lineItems.map((li, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <input
                        type="text"
                        placeholder="Item name"
                        value={li.productKey}
                        onChange={(e) => updateLineItem(idx, "productKey", e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Description"
                        value={li.notes}
                        onChange={(e) => updateLineItem(idx, "notes", e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                      />
                      <input
                        type="number"
                        title="Unit price"
                        placeholder="Price"
                        value={li.cost || ""}
                        onChange={(e) => updateLineItem(idx, "cost", parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                        className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                        required
                      />
                      <input
                        type="number"
                        title="Quantity"
                        placeholder="Qty"
                        value={li.quantity || ""}
                        onChange={(e) => updateLineItem(idx, "quantity", parseInt(e.target.value) || 1)}
                        min="1"
                        className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                      />
                      <span className="w-24 text-sm text-slate-700 font-medium py-2 text-right">
                        {formatCurrency(li.cost * li.quantity)}
                      </span>
                      {lineItems.length > 1 && (
                        <button type="button" title="Remove line item" onClick={() => removeLineItem(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right text-sm font-semibold text-slate-900">
                  Total: {formatCurrency(lineItemTotal)}
                </div>
              </div>

              {/* Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Public Notes</label>
                  <textarea
                    value={publicNotes}
                    onChange={(e) => setPublicNotes(e.target.value)}
                    placeholder="Visible to client..."
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Private Notes</label>
                  <textarea
                    value={privateNotes}
                    onChange={(e) => setPrivateNotes(e.target.value)}
                    placeholder="Internal only..."
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                  />
                </div>
              </div>
            </form>

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-sm text-slate-500">Total: <span className="font-semibold text-slate-900">{formatCurrency(lineItemTotal)}</span></span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCreateMode(null)} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition">Cancel</button>
                <button
                  type="submit"
                  onClick={handleCreate}
                  disabled={creating}
                  className={`px-4 py-2 text-white rounded-lg transition text-sm font-medium disabled:opacity-50 ${
                    createMode === "quote" ? "bg-blue-600 hover:bg-blue-700" :
                    createMode === "invoice" ? "bg-indigo-600 hover:bg-indigo-700" :
                    "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  {creating ? "Creating..." : `Create ${createMode === "quote" ? "Quote" : createMode === "invoice" ? "Invoice" : "Credit Note"}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
