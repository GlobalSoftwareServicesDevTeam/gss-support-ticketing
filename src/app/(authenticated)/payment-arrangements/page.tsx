"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  CalendarClock,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  FileText,
  Ban,
  Check,
  X,
  CircleDot,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface Installment {
  id: string;
  installmentNo: number;
  amount: string;
  dueDate: string;
  status: string;
  paidAt: string | null;
  gatewayRef: string | null;
}

interface Arrangement {
  id: string;
  invoiceNumber: string;
  invoiceId: string | null;
  totalAmount: string;
  numberOfMonths: number;
  monthlyAmount: string;
  reason: string | null;
  status: string;
  adminNotes: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string };
  installments: Installment[];
}

// ─── Constants ──────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  PENDING: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: <Clock size={14} />, label: "Pending" },
  APPROVED: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: <CheckCircle2 size={14} />, label: "Approved" },
  ACTIVE: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: <CircleDot size={14} />, label: "Active" },
  COMPLETED: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", icon: <CheckCircle2 size={14} />, label: "Completed" },
  DEFAULTED: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: <AlertTriangle size={14} />, label: "Defaulted" },
  REJECTED: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <XCircle size={14} />, label: "Rejected" },
  CANCELLED: { color: "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400", icon: <Ban size={14} />, label: "Cancelled" },
};

const INSTALLMENT_STATUS: Record<string, { color: string; label: string }> = {
  PENDING: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Pending" },
  PAID: { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", label: "Paid" },
  OVERDUE: { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", label: "Overdue" },
  WAIVED: { color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", label: "Waived" },
};

function formatCurrency(amount: number | string): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(amount));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Component ──────────────────────────────────────────

export default function PaymentArrangementsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [arrangements, setArrangements] = useState<Arrangement[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // New arrangement form
  const [newForm, setNewForm] = useState({
    invoiceNumber: "",
    invoiceId: "",
    totalAmount: "",
    numberOfMonths: "3",
    reason: "",
  });

  // Admin mark paid form
  const [markPaidRef, setMarkPaidRef] = useState<Record<string, string>>({});

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const fetchArrangements = useCallback(async () => {
    try {
      const url = statusFilter
        ? `/api/payment-arrangements?status=${statusFilter}`
        : `/api/payment-arrangements`;
      const res = await fetch(url);
      if (res.ok) {
        setArrangements(await res.json());
      }
    } catch {
      showMessage("error", "Failed to load payment arrangements");
    }
    setLoading(false);
  }, [statusFilter, showMessage]);

  useEffect(() => {
    if (session?.user) fetchArrangements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleCreate = async () => {
    if (!newForm.invoiceNumber || !newForm.totalAmount || !newForm.numberOfMonths) {
      showMessage("error", "Please fill in all required fields");
      return;
    }
    setActionLoading("create");
    try {
      const res = await fetch("/api/payment-arrangements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: newForm.invoiceNumber,
          invoiceId: newForm.invoiceId || null,
          totalAmount: Number(newForm.totalAmount),
          numberOfMonths: Number(newForm.numberOfMonths),
          reason: newForm.reason || null,
        }),
      });
      if (res.ok) {
        showMessage("success", "Payment arrangement request submitted successfully");
        setNewForm({ invoiceNumber: "", invoiceId: "", totalAmount: "", numberOfMonths: "3", reason: "" });
        setShowNewForm(false);
        fetchArrangements();
      } else {
        const err = await res.json();
        showMessage("error", err.error || "Failed to create arrangement");
      }
    } catch {
      showMessage("error", "Failed to create arrangement");
    }
    setActionLoading(null);
  };

  const handleAction = async (arrangementId: string, action: string, extra: Record<string, string> = {}) => {
    setActionLoading(`${action}-${arrangementId}`);
    try {
      const res = await fetch(`/api/payment-arrangements/${arrangementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (res.ok) {
        showMessage("success", `Arrangement ${action}${action === "mark_paid" ? " — installment paid" : ""} successfully`);
        fetchArrangements();
      } else {
        const err = await res.json();
        showMessage("error", err.error || `Failed to ${action}`);
      }
    } catch {
      showMessage("error", `Failed to ${action}`);
    }
    setActionLoading(null);
  };

  // ─── Monthly amount preview ─────────────────────
  const previewMonthly = () => {
    const total = Number(newForm.totalAmount);
    const months = Number(newForm.numberOfMonths);
    if (!total || !months || total <= 0) return null;
    return Math.ceil((total / months) * 100) / 100;
  };

  // ─── Render ──────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CalendarClock className="text-brand-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Payment Arrangements</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Request a payment plan for outstanding invoices (max 3 months)
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          New Arrangement
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* New Arrangement Form */}
      {showNewForm && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <FileText size={18} />
            Request Payment Arrangement
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pa-invoice" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Invoice Number *
              </label>
              <input
                id="pa-invoice"
                type="text"
                value={newForm.invoiceNumber}
                onChange={(e) => setNewForm({ ...newForm, invoiceNumber: e.target.value })}
                placeholder="e.g. INV-0042"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="pa-amount" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Outstanding Amount (ZAR) *
              </label>
              <input
                id="pa-amount"
                type="number"
                min="1"
                step="0.01"
                value={newForm.totalAmount}
                onChange={(e) => setNewForm({ ...newForm, totalAmount: e.target.value })}
                placeholder="e.g. 3000.00"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="pa-months" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Number of Months *
              </label>
              <select
                id="pa-months"
                value={newForm.numberOfMonths}
                onChange={(e) => setNewForm({ ...newForm, numberOfMonths: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
              >
                <option value="1">1 Month (full payment)</option>
                <option value="2">2 Months</option>
                <option value="3">3 Months</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Monthly Installment
              </label>
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-semibold text-brand-600 dark:text-brand-400">
                {previewMonthly() ? formatCurrency(previewMonthly()!) : "—"}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="pa-reason" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Reason for Arrangement
            </label>
            <textarea
              id="pa-reason"
              value={newForm.reason}
              onChange={(e) => setNewForm({ ...newForm, reason: e.target.value })}
              placeholder="Briefly explain why you need a payment arrangement..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={actionLoading === "create"}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 text-sm font-medium"
            >
              {actionLoading === "create" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Submit Request
            </button>
            <button
              onClick={() => setShowNewForm(false)}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-sm"
            >
              Cancel
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Your request will be reviewed by an admin. Once approved, installment due dates will be set.
          </p>
        </div>
      )}

      {/* Filter */}
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="pa-status-filter" className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Filter:
        </label>
        <select
          id="pa-status-filter"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setLoading(true); }}
          className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
        >
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="DEFAULTED">Defaulted</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Arrangements List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-brand-500" />
        </div>
      ) : arrangements.length === 0 ? (
        <div className="text-center py-20 text-slate-500 dark:text-slate-400">
          <CalendarClock size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No payment arrangements found</p>
          <p className="text-sm mt-1">Click &quot;New Arrangement&quot; to request a payment plan</p>
        </div>
      ) : (
        <div className="space-y-4">
          {arrangements.map((arr) => {
            const statusCfg = STATUS_CONFIG[arr.status] || STATUS_CONFIG.PENDING;
            const isExpanded = expandedId === arr.id;
            const paidCount = arr.installments.filter((i) => i.status === "PAID" || i.status === "WAIVED").length;
            const progress = arr.installments.length > 0 ? (paidCount / arr.installments.length) * 100 : 0;

            return (
              <div
                key={arr.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
              >
                {/* Header Row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : arr.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <DollarSign size={20} className="text-brand-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {arr.invoiceNumber}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
                          {statusCfg.icon} {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span>{formatCurrency(arr.totalAmount)} over {arr.numberOfMonths} month{arr.numberOfMonths > 1 ? "s" : ""}</span>
                        <span>•</span>
                        <span>{formatCurrency(arr.monthlyAmount)}/mo</span>
                        {isAdmin && (
                          <>
                            <span>•</span>
                            <span>{arr.user.firstName} {arr.user.lastName}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{formatDate(arr.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Progress bar */}
                    {["ACTIVE", "COMPLETED"].includes(arr.status) && (
                      <div className="hidden sm:flex items-center gap-2">
                        <div className="w-24 h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {paidCount}/{arr.installments.length}
                        </span>
                      </div>
                    )}
                    {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-4">
                    {/* Reason */}
                    {arr.reason && (
                      <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Reason</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300">{arr.reason}</p>
                      </div>
                    )}

                    {/* Admin Notes */}
                    {arr.adminNotes && (
                      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Admin Notes</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">{arr.adminNotes}</p>
                      </div>
                    )}

                    {/* Installments Table */}
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Installments</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                              <th className="pb-2 pr-4">#</th>
                              <th className="pb-2 pr-4">Amount</th>
                              <th className="pb-2 pr-4">Due Date</th>
                              <th className="pb-2 pr-4">Status</th>
                              <th className="pb-2 pr-4">Paid</th>
                              {isAdmin && arr.status === "ACTIVE" && <th className="pb-2">Actions</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {arr.installments.map((inst) => {
                              const instStatus = INSTALLMENT_STATUS[inst.status] || INSTALLMENT_STATUS.PENDING;
                              return (
                                <tr key={inst.id} className="text-slate-700 dark:text-slate-300">
                                  <td className="py-2 pr-4 font-medium">{inst.installmentNo}</td>
                                  <td className="py-2 pr-4">{formatCurrency(inst.amount)}</td>
                                  <td className="py-2 pr-4">{formatDate(inst.dueDate)}</td>
                                  <td className="py-2 pr-4">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${instStatus.color}`}>
                                      {instStatus.label}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-4 text-xs text-slate-500">
                                    {inst.paidAt ? formatDate(inst.paidAt) : "—"}
                                    {inst.gatewayRef && <span className="ml-1 text-slate-400">({inst.gatewayRef})</span>}
                                  </td>
                                  {isAdmin && arr.status === "ACTIVE" && (
                                    <td className="py-2">
                                      {inst.status === "PENDING" || inst.status === "OVERDUE" ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="text"
                                            title="Payment reference"
                                            placeholder="Ref"
                                            value={markPaidRef[inst.id] || ""}
                                            onChange={(e) =>
                                              setMarkPaidRef({ ...markPaidRef, [inst.id]: e.target.value })
                                            }
                                            className="w-20 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded dark:bg-slate-700 dark:text-white"
                                          />
                                          <button
                                            onClick={() =>
                                              handleAction(arr.id, "mark_paid", {
                                                installmentId: inst.id,
                                                gatewayRef: markPaidRef[inst.id] || "",
                                              })
                                            }
                                            disabled={actionLoading === `mark_paid-${arr.id}`}
                                            className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:opacity-50"
                                          >
                                            {actionLoading === `mark_paid-${arr.id}` ? (
                                              <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                              <Check size={12} />
                                            )}
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-xs text-green-600">✓</span>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                      {/* Admin actions */}
                      {isAdmin && arr.status === "PENDING" && (
                        <>
                          <button
                            onClick={() => handleAction(arr.id, "approve")}
                            disabled={!!actionLoading}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 disabled:opacity-50"
                          >
                            <Check size={14} /> Approve
                          </button>
                          <button
                            onClick={() => {
                              const notes = prompt("Reason for rejection (optional):");
                              handleAction(arr.id, "reject", notes ? { adminNotes: notes } : {});
                            }}
                            disabled={!!actionLoading}
                            className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50"
                          >
                            <X size={14} /> Reject
                          </button>
                        </>
                      )}
                      {isAdmin && arr.status === "ACTIVE" && (
                        <button
                          onClick={() => {
                            const notes = prompt("Reason for defaulting:");
                            if (notes !== null) handleAction(arr.id, "default", { adminNotes: notes });
                          }}
                          disabled={!!actionLoading}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50"
                        >
                          <AlertTriangle size={14} /> Mark Defaulted
                        </button>
                      )}

                      {/* User cancel */}
                      {!isAdmin && arr.status === "PENDING" && (
                        <button
                          onClick={() => handleAction(arr.id, "cancel")}
                          disabled={!!actionLoading}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200 rounded-lg text-xs font-medium hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-50"
                        >
                          <Ban size={14} /> Cancel Request
                        </button>
                      )}

                      {/* Timestamps */}
                      <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
                        {arr.approvedAt && <span>Approved {formatDate(arr.approvedAt)}</span>}
                        {arr.completedAt && <span>Completed {formatDate(arr.completedAt)}</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
