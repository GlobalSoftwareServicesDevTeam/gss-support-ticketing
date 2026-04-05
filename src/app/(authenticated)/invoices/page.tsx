"use client";

import { useEffect, useState } from "react";
import InvoicePaymentModal from "@/components/invoice-payment-modal";
import { Receipt, FileEdit, CreditCard, Banknote, RefreshCw } from "lucide-react";

type InvoiceType = "invoices" | "quotes" | "credits" | "payments" | "recurring_invoices";

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
  client?: { display_name?: string; name?: string };
  line_items?: Array<{ notes?: string; cost: number; quantity: number }>;
}

const FREQUENCY_LABELS: Record<string, string> = {
  "1": "Daily",
  "2": "Weekly",
  "3": "Bi-weekly",
  "4": "Monthly",
  "5": "Bi-monthly",
  "6": "Quarterly",
  "7": "Every 4 months",
  "8": "Semi-annually",
  "9": "Annually",
  "10": "Every 2 years",
  "11": "Every 3 years",
};

const TYPE_TABS: { key: InvoiceType; label: string; icon: React.ReactNode }[] = [
  { key: "invoices", label: "Invoices", icon: <Receipt size={16} /> },
  { key: "recurring_invoices", label: "Recurring", icon: <RefreshCw size={16} /> },
  { key: "quotes", label: "Quotes", icon: <FileEdit size={16} /> },
  { key: "credits", label: "Credit Notes", icon: <CreditCard size={16} /> },
  { key: "payments", label: "Payments", icon: <Banknote size={16} /> },
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
  const paymentStatuses: Record<string, { label: string; color: string }> = {
    "1": { label: "Pending", color: "bg-yellow-100 text-yellow-700" },
    "2": { label: "Voided", color: "bg-red-100 text-red-700" },
    "3": { label: "Failed", color: "bg-red-100 text-red-700" },
    "4": { label: "Completed", color: "bg-green-100 text-green-700" },
    "5": { label: "Partially Refunded", color: "bg-orange-100 text-orange-700" },
    "6": { label: "Refunded", color: "bg-purple-100 text-purple-700" },
  };
  const recurringStatuses: Record<string, { label: string; color: string }> = {
    "1": { label: "Draft", color: "bg-slate-100 text-slate-700" },
    "2": { label: "Active", color: "bg-green-100 text-green-700" },
    "3": { label: "Paused", color: "bg-yellow-100 text-yellow-700" },
    "4": { label: "Completed", color: "bg-blue-100 text-blue-700" },
    "-1": { label: "Pending", color: "bg-orange-100 text-orange-700" },
  };

  const map = type === "quotes" ? quoteStatuses : type === "payments" ? paymentStatuses : type === "recurring_invoices" ? recurringStatuses : invoiceStatuses;
  return map[statusId] || { label: `Status ${statusId}`, color: "bg-gray-100 text-gray-700" };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

export default function InvoicesPage() {
  const [type, setType] = useState<InvoiceType>("invoices");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");

  // Payment modal state
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<InvoiceItem | null>(null);
  const [depositMode, setDepositMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invoices?type=${type}`)
      .then(async (r) => {
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          throw new Error(`Server returned ${r.status} (non-JSON response)`);
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.configured === false) {
          setConfigured(false);
          setItems([]);
        } else if (data.error) {
          setError(data.error);
          setItems([]);
        } else {
          setConfigured(true);
          setItems(Array.isArray(data.data) ? data.data : []);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || "Failed to fetch data");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [type]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Invoices & Financial Documents</h1>

      {!configured && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">Invoice Ninja Not Configured</h2>
          <p className="text-sm text-yellow-700">
            To connect Invoice Ninja, add the following environment variables:
          </p>
          <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside">
            <li><code className="bg-yellow-100 px-1 rounded">INVOICE_NINJA_URL</code> - Your Invoice Ninja server URL (e.g., https://invoicing.example.com)</li>
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
              onClick={() => setType(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                type === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="inline-flex items-center gap-1">{t.icon} {t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">{error}</div>
      )}

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
                {type === "recurring_invoices" ? "Next Send" : type === "payments" ? "Applied" : "Balance"}
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
              {type === "invoices" && (
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={type === "invoices" ? 7 : 6} className="px-6 py-8 text-center text-slate-400">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={type === "invoices" ? 7 : 6} className="px-6 py-8 text-center text-slate-400">No {type} found.</td></tr>
            ) : (
              items.map((item) => {
                const status = getStatusLabel(type, item.status_id);
                const hasBalance = item.balance > 0;
                const isPayable = type === "invoices" && hasBalance && !["4", "5"].includes(item.status_id);
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.number || "—"}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {item.client?.display_name || item.client?.name || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {type === "recurring_invoices"
                        ? (FREQUENCY_LABELS[item.frequency_id || ""] || `Freq ${item.frequency_id}`)
                        : (item.date ? new Date(item.date).toLocaleDateString() : "—")}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {type === "recurring_invoices"
                        ? (item.next_send_date ? new Date(item.next_send_date).toLocaleDateString() : "—")
                        : formatCurrency(item.balance)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    {type === "invoices" && (
                      <td className="px-6 py-4">
                        {isPayable ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => {
                                setPayInvoice(item);
                                setDepositMode(false);
                                setPayModalOpen(true);
                              }}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-xs font-medium"
                            >
                              Pay Now
                            </button>
                            <button
                              onClick={() => {
                                setPayInvoice(item);
                                setDepositMode(true);
                                setPayModalOpen(true);
                              }}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-xs font-medium"
                            >
                              40% Deposit
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {item.status_id === "4" ? "Paid" : item.status_id === "5" ? "Cancelled" : "—"}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Payment modal */}
      {payInvoice && (
        <InvoicePaymentModal
          key={`${payInvoice.id}-${depositMode}`}
          isOpen={payModalOpen}
          onClose={() => {
            setPayModalOpen(false);
            setPayInvoice(null);
          }}
          invoiceNumber={payInvoice.number}
          invoiceAmount={payInvoice.amount}
          invoiceBalance={payInvoice.balance}
          clientName={payInvoice.client?.display_name || payInvoice.client?.name || ""}
          depositMode={depositMode}
        />
      )}
    </div>
  );
}
