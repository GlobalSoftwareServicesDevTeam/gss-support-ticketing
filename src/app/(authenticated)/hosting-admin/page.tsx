"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import {
  Globe,
  Server,
  Package,
  CreditCard,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  FileQuestion,
  Trash2,
  Ban,
  DollarSign,
  Play,
  Pause,
  Edit3,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  User,
  AlertTriangle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface HostingProduct {
  id: string;
  name: string;
  type: string;
  description: string | null;
  monthlyPrice: number;
  setupFee: number;
  features: string | null;
  pleskPlanName: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface HostingOrder {
  id: string;
  orderType: string;
  status: string;
  domain: string | null;
  notes: string | null;
  amount: number | null;
  period: number;
  pleskSubscriptionId: string | null;
  invoiceNinjaInvoiceId: string | null;
  recurringInvoiceId: string | null;
  provisionedAt: string | null;
  createdAt: string;
  product: { name: string; type: string; monthlyPrice: number } | null;
  user?: { firstName: string; lastName: string; email: string };
}

// ─── Constants ──────────────────────────────────────────

type Tab = "orders" | "services" | "domains" | "products";

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

const ORDER_TYPE_LABELS: Record<string, string> = {
  HOSTING: "Hosting",
  DOMAIN_REGISTER: "Domain Registration",
  DOMAIN_TRANSFER: "Domain Transfer",
  SSL: "SSL Certificate",
  ADDITIONAL_HOSTING: "Additional Hosting",
  QUOTE_REQUEST: "Quote Request",
};

// ─── Component ──────────────────────────────────────────

export default function HostingAdminPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<HostingOrder[]>([]);
  const [products, setProducts] = useState<HostingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [creditModal, setCreditModal] = useState<{ orderId: string; userName: string } | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDescription, setCreditDescription] = useState("");
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<HostingProduct>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMessage = useCallback((type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, productsRes] = await Promise.all([
        fetch("/api/hosting/orders"),
        fetch("/api/hosting/products"),
      ]);
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (productsRes.ok) setProducts(await productsRes.json());
    } catch {
      showMessage("error", "Failed to load data");
    }
    setLoading(false);
  }, [showMessage]);

  useEffect(() => {
    if (session?.user) fetchData();
  }, [session, fetchData]);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">Admin access required.</p>
      </div>
    );
  }

  // ─── Filtered orders ─────────────────────────────────
  const filteredOrders = orders.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (typeFilter && o.orderType !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        o.domain?.toLowerCase().includes(q) ||
        o.user?.email?.toLowerCase().includes(q) ||
        o.user?.firstName?.toLowerCase().includes(q) ||
        o.user?.lastName?.toLowerCase().includes(q) ||
        o.product?.name?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const activeServices = filteredOrders.filter((o) => o.status === "ACTIVE");
  const domainOrders = filteredOrders.filter(
    (o) => o.orderType === "DOMAIN_REGISTER" || o.orderType === "DOMAIN_TRANSFER"
  );
  const allFilteredOrders = filteredOrders;

  // ─── Actions ──────────────────────────────────────────

  async function cancelOrderAndInvoice(orderId: string, suspendHosting = true, removeHosting = false) {
    if (!confirm("Cancel this order, invoice, and recurring billing? This cannot be undone easily.")) return;
    setActionLoading(orderId);
    try {
      const res = await fetch(`/api/hosting/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspendHosting, removeHosting }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", `Order cancelled. ${data.invoiceCancelled ? "Invoice cancelled. " : ""}${data.recurringInvoiceStopped ? "Recurring stopped. " : ""}${data.pleskSubscriptionSuspended ? "Hosting suspended." : ""}`);
        fetchData();
      } else {
        showMessage("error", data.error || "Failed to cancel");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  async function issueCredit(orderId: string) {
    if (!creditAmount || Number(creditAmount) <= 0) {
      showMessage("error", "Enter a valid credit amount");
      return;
    }
    setActionLoading(orderId);
    try {
      const res = await fetch(`/api/hosting/orders/${orderId}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(creditAmount),
          description: creditDescription || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage("success", `Credit note ${data.creditNumber} created for R${Number(creditAmount).toFixed(2)}`);
        setCreditModal(null);
        setCreditAmount("");
        setCreditDescription("");
      } else {
        showMessage("error", data.error || "Failed to create credit");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

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
        fetchData();
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
        fetchData();
      } else {
        showMessage("error", data.error || "Provisioning failed");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  async function updateProduct(productId: string) {
    setActionLoading(productId);
    try {
      const payload: Record<string, unknown> = { ...editForm };
      if (typeof editForm.features === "string") {
        payload.features = (editForm.features as string)
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean);
      }
      const res = await fetch(`/api/hosting/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showMessage("success", "Product updated");
        setEditingProduct(null);
        fetchData();
      } else {
        const data = await res.json();
        showMessage("error", data.error || "Failed to update");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  async function toggleProductActive(productId: string, isActive: boolean) {
    setActionLoading(productId);
    try {
      const res = await fetch(`/api/hosting/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        showMessage("success", isActive ? "Product activated" : "Product deactivated");
        fetchData();
      } else {
        const data = await res.json();
        showMessage("error", data.error || "Failed to update");
      }
    } catch {
      showMessage("error", "Network error");
    }
    setActionLoading("");
  }

  // ─── Tabs ─────────────────────────────────────────────

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "orders", label: "All Orders", icon: <Package size={16} />, count: orders.length },
    { key: "services", label: "Active Services", icon: <Server size={16} />, count: orders.filter((o) => o.status === "ACTIVE").length },
    { key: "domains", label: "Domain Requests", icon: <Globe size={16} />, count: orders.filter((o) => o.orderType === "DOMAIN_REGISTER" || o.orderType === "DOMAIN_TRANSFER").length },
    { key: "products", label: "Products", icon: <CreditCard size={16} />, count: products.length },
  ];

  const displayOrders = tab === "services" ? activeServices : tab === "domains" ? domainOrders : allFilteredOrders;

  // ─── Render ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Hosting Administration</h1>
          <p className="text-sm text-slate-500 mt-1">Manage hosting packages, services, invoices and domains</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition text-slate-700 dark:text-slate-300"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Orders", value: orders.length, color: "text-blue-600" },
          { label: "Active Services", value: orders.filter((o) => o.status === "ACTIVE").length, color: "text-green-600" },
          { label: "Pending", value: orders.filter((o) => o.status === "PENDING").length, color: "text-yellow-600" },
          { label: "Cancelled", value: orders.filter((o) => o.status === "CANCELLED").length, color: "text-slate-500" },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition whitespace-nowrap ${
              tab === t.key
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1 text-xs bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search / Filter (for orders, services, domains tabs) */}
      {tab !== "products" && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by domain, user email, or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
            />
          </div>
          <select
            title="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
          >
            <option value="">All Statuses</option>
            {Object.keys(ORDER_STATUS_STYLE).map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_STYLE[s].text}</option>
            ))}
          </select>
          {tab === "orders" && (
            <select
              title="Filter by type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
            >
              <option value="">All Types</option>
              {Object.entries(ORDER_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : (
        <>
          {/* ─── Orders / Services / Domains ─────────────── */}
          {tab !== "products" && (
            <div className="space-y-3">
              {displayOrders.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
                  <Package className="mx-auto h-12 w-12 text-slate-300" />
                  <p className="mt-3 text-sm text-slate-500">No orders found matching your filters.</p>
                </div>
              ) : (
                displayOrders.map((order) => {
                  const status = ORDER_STATUS_STYLE[order.status] || ORDER_STATUS_STYLE.PENDING;
                  const isExpanded = expandedOrder === order.id;
                  const isLoading = actionLoading === order.id;

                  return (
                    <div
                      key={order.id}
                      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                    >
                      {/* Order row */}
                      <div
                        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition"
                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.bg}`}>
                              {status.icon} {status.text}
                            </span>
                            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                              {ORDER_TYPE_LABELS[order.orderType] || order.orderType}
                            </span>
                            {order.domain && (
                              <span className="text-sm font-medium text-slate-900 dark:text-white">{order.domain}</span>
                            )}
                            {order.product && (
                              <span className="text-xs text-slate-500">{order.product.name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            {order.user && (
                              <span className="flex items-center gap-1">
                                <User size={12} />
                                {order.user.firstName} {order.user.lastName} ({order.user.email})
                              </span>
                            )}
                            <span>•</span>
                            <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                            {order.amount && (
                              <>
                                <span>•</span>
                                <span className="font-medium">R{Number(order.amount).toFixed(2)}/mo</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isLoading && <Loader2 size={16} className="animate-spin text-slate-400" />}
                          {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                        </div>
                      </div>

                      {/* Expanded details + actions */}
                      {isExpanded && (
                        <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
                          {/* Details grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                            <div>
                              <p className="text-xs text-slate-400 uppercase">Order ID</p>
                              <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{order.id.slice(0, 12)}...</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400 uppercase">Invoice ID</p>
                              <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{order.invoiceNinjaInvoiceId || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400 uppercase">Recurring ID</p>
                              <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{order.recurringInvoiceId || "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-400 uppercase">Plesk Sub ID</p>
                              <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{order.pleskSubscriptionId || "—"}</p>
                            </div>
                            {order.provisionedAt && (
                              <div>
                                <p className="text-xs text-slate-400 uppercase">Provisioned</p>
                                <p className="text-slate-700 dark:text-slate-300 text-xs mt-0.5">{new Date(order.provisionedAt).toLocaleString()}</p>
                              </div>
                            )}
                            {order.notes && (
                              <div className="col-span-2">
                                <p className="text-xs text-slate-400 uppercase">Notes</p>
                                <p className="text-slate-700 dark:text-slate-300 text-xs mt-0.5">{order.notes}</p>
                              </div>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2">
                            {/* Status transitions */}
                            {order.status === "PENDING" && (
                              <>
                                <button
                                  onClick={() => updateOrderStatus(order.id, "QUOTED")}
                                  disabled={isLoading}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                                >
                                  <FileQuestion size={12} /> Mark Quoted
                                </button>
                                <button
                                  onClick={() => updateOrderStatus(order.id, "PROFORMA_SENT")}
                                  disabled={isLoading}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
                                >
                                  <FileQuestion size={12} /> Mark Proforma Sent
                                </button>
                              </>
                            )}
                            {(order.status === "QUOTED" || order.status === "PROFORMA_SENT") && (
                              <button
                                onClick={() => updateOrderStatus(order.id, "PAID")}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                              >
                                <CheckCircle2 size={12} /> Mark Paid
                              </button>
                            )}
                            {(order.status === "PAID" || order.status === "PENDING" || order.status === "QUOTED") && (
                              <button
                                onClick={() => provisionOrder(order.id)}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                              >
                                <Play size={12} /> Provision
                              </button>
                            )}

                            {/* Cancel with invoice cancellation */}
                            {order.status !== "CANCELLED" && (
                              <>
                                <button
                                  onClick={() => cancelOrderAndInvoice(order.id, true, false)}
                                  disabled={isLoading}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                                >
                                  <Ban size={12} /> Cancel &amp; Suspend
                                </button>
                                {order.pleskSubscriptionId && (
                                  <button
                                    onClick={() => cancelOrderAndInvoice(order.id, false, true)}
                                    disabled={isLoading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-800 text-white rounded-lg hover:bg-red-900 transition disabled:opacity-50"
                                  >
                                    <Trash2 size={12} /> Cancel &amp; Remove Hosting
                                  </button>
                                )}
                              </>
                            )}

                            {/* Issue credit */}
                            {order.user && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCreditModal({
                                    orderId: order.id,
                                    userName: `${order.user!.firstName} ${order.user!.lastName}`,
                                  });
                                  setCreditAmount(order.amount ? String(order.amount) : "");
                                }}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
                              >
                                <DollarSign size={12} /> Issue Credit
                              </button>
                            )}

                            {/* Resume / reactivate */}
                            {order.status === "CANCELLED" && (
                              <button
                                onClick={() => updateOrderStatus(order.id, "PENDING")}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition disabled:opacity-50"
                              >
                                <Pause size={12} /> Reopen as Pending
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ─── Products Tab ──────────────────────────── */}
          {tab === "products" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Type</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Monthly</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Setup Fee</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Plesk Plan</th>
                      <th className="text-center px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Status</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        {editingProduct === p.id ? (
                          <>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={editForm.name || ""}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm dark:bg-slate-700 dark:text-white"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                title="Type"
                                value={editForm.type || "HOSTING"}
                                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                                className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm dark:bg-slate-700 dark:text-white"
                              >
                                <option value="HOSTING">Hosting</option>
                                <option value="SSL">SSL</option>
                                <option value="DOMAIN">Domain</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                value={editForm.monthlyPrice || ""}
                                onChange={(e) => setEditForm({ ...editForm, monthlyPrice: Number(e.target.value) })}
                                className="w-24 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm text-right dark:bg-slate-700 dark:text-white"
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                value={editForm.setupFee ?? ""}
                                onChange={(e) => setEditForm({ ...editForm, setupFee: Number(e.target.value) })}
                                className="w-24 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm text-right dark:bg-slate-700 dark:text-white"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={editForm.pleskPlanName || ""}
                                onChange={(e) => setEditForm({ ...editForm, pleskPlanName: e.target.value })}
                                className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm dark:bg-slate-700 dark:text-white"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">—</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => updateProduct(p.id)}
                                  disabled={actionLoading === p.id}
                                  className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition"
                                  title="Save"
                                >
                                  <Save size={14} />
                                </button>
                                <button
                                  onClick={() => setEditingProduct(null)}
                                  className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition"
                                  title="Cancel"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{p.name}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                p.type === "HOSTING" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                p.type === "SSL" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                              }`}>
                                {p.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">R{Number(p.monthlyPrice).toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">R{Number(p.setupFee).toFixed(2)}</td>
                            <td className="px-4 py-3 text-slate-500">{p.pleskPlanName || "—"}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                p.isActive !== false
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              }`}>
                                {p.isActive !== false ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    setEditingProduct(p.id);
                                    setEditForm({
                                      name: p.name,
                                      type: p.type,
                                      monthlyPrice: p.monthlyPrice,
                                      setupFee: p.setupFee,
                                      pleskPlanName: p.pleskPlanName || "",
                                      description: p.description,
                                      features: p.features ? JSON.parse(p.features).join("\n") : "",
                                    });
                                  }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition"
                                  title="Edit"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => toggleProductActive(p.id, p.isActive === false)}
                                  disabled={actionLoading === p.id}
                                  className={`p-1.5 rounded transition ${
                                    p.isActive !== false
                                      ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                      : "text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                                  }`}
                                  title={p.isActive !== false ? "Deactivate" : "Activate"}
                                >
                                  {p.isActive !== false ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {products.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">No products</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Credit Modal ────────────────────────────── */}
      {creditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreditModal(null)}>
          <div
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Issue Credit Note</h3>
            <p className="text-sm text-slate-500 mt-1">
              Create a credit for <span className="font-medium">{creditModal.userName}</span>
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Credit Amount (ZAR) *
                </label>
                <input
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  value={creditDescription}
                  onChange={(e) => setCreditDescription(e.target.value)}
                  placeholder="Reason for credit..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setCreditModal(null);
                    setCreditAmount("");
                    setCreditDescription("");
                  }}
                  className="px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => issueCredit(creditModal.orderId)}
                  disabled={!creditAmount || Number(creditAmount) <= 0 || actionLoading === creditModal.orderId}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
                >
                  {actionLoading === creditModal.orderId ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <DollarSign size={14} />
                  )}
                  Issue Credit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
