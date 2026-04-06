"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Globe,
  Server,
  ShieldCheck,
  FileQuestion,
  Plus,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  ArrowRight,
  Package,
  Trash2,
  Play,
  Settings,
  Gauge,
  Wrench,
  AlertTriangle,
  Info,
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

type Tab = "orders" | "hosting" | "domain" | "ssl" | "quote" | "products" | "performance" | "domaintools";

const ORDER_STATUS_STYLE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  PENDING: { bg: "bg-yellow-50 text-yellow-700", text: "Pending", icon: <Clock size={14} /> },
  QUOTED: { bg: "bg-blue-50 text-blue-700", text: "Quoted", icon: <FileQuestion size={14} /> },
  PROFORMA_SENT: { bg: "bg-indigo-50 text-indigo-700", text: "Proforma Sent", icon: <FileQuestion size={14} /> },
  PAID: { bg: "bg-green-50 text-green-700", text: "Paid", icon: <CheckCircle2 size={14} /> },
  PROVISIONING: { bg: "bg-purple-50 text-purple-700", text: "Provisioning", icon: <Loader2 size={14} className="animate-spin" /> },
  ACTIVE: { bg: "bg-green-50 text-green-700", text: "Active", icon: <CheckCircle2 size={14} /> },
  FAILED: { bg: "bg-red-50 text-red-700", text: "Failed", icon: <XCircle size={14} /> },
  CANCELLED: { bg: "bg-slate-100 text-slate-500", text: "Cancelled", icon: <XCircle size={14} /> },
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  HOSTING: "New Hosting",
  DOMAIN_REGISTER: "Domain Registration",
  DOMAIN_TRANSFER: "Domain Transfer",
  SSL: "SSL Certificate",
  ADDITIONAL_HOSTING: "Additional Hosting",
  QUOTE_REQUEST: "Quote Request",
};

// ─── Component ──────────────────────────────────────────

export default function HostingPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<HostingOrder[]>([]);
  const [products, setProducts] = useState<HostingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  // Domain check state
  const [domainQuery, setDomainQuery] = useState("");
  const [domainResult, setDomainResult] = useState<{
    domain: string;
    available: boolean;
    message: string;
    results?: {
      domain: string;
      tld: string;
      available: boolean;
      registered: boolean;
      price: number | null;
      productId: string | null;
      productName: string | null;
      message: string;
    }[];
  } | null>(null);
  const [domainChecking, setDomainChecking] = useState(false);
  const [domainAction, setDomainAction] = useState<"register" | "transfer">("register");

  // New order form state
  const [orderDomain, setOrderDomain] = useState("");
  const [orderProduct, setOrderProduct] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  // Admin product form
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    type: "HOSTING",
    description: "",
    monthlyPrice: "",
    setupFee: "0",
    pleskPlanName: "",
    features: "",
  });

  // PageSpeed Insights state
  const [psUrl, setPsUrl] = useState("");
  const [psStrategy, setPsStrategy] = useState<"mobile" | "desktop">("mobile");
  const [psLoading, setPsLoading] = useState(false);
  const [psResult, setPsResult] = useState<{
    url: string;
    strategy: string;
    scores: { performance: number; accessibility: number; bestPractices: number; seo: number };
    metrics: Record<string, string | null>;
    opportunities: { title: string; description: string; displayValue: string | null }[];
    diagnostics: { title: string; description: string; displayValue: string | null }[];
  } | null>(null);
  const [psError, setPsError] = useState("");

  // Domain Tools state
  const [dtDomain, setDtDomain] = useState("");
  const [dtActiveTool, setDtActiveTool] = useState<"whois" | "dns">("whois");
  const [dtLoading, setDtLoading] = useState(false);
  const [dtError, setDtError] = useState("");
  const [whoisResult, setWhoisResult] = useState<{
    domain: string;
    status: string[];
    registrationDate: string | null;
    expirationDate: string | null;
    lastChanged: string | null;
    registrar: { name?: string; handle?: string; organization?: string } | null;
    registrant: { name?: string; organization?: string; email?: string } | null;
    nameservers: string[];
    secureDNS: { delegationSigned?: boolean } | null;
  } | null>(null);
  const [dnsResult, setDnsResult] = useState<{
    domain: string;
    records: Record<string, unknown>;
    reverseDns: string[] | null;
    timestamp: string;
  } | null>(null);

  async function fetchOrders() {
    try {
      const res = await fetch("/api/hosting/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function fetchProducts() {
    try {
      const res = await fetch("/api/hosting/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/hosting/orders").then((r) => r.ok ? r.json() : []),
      fetch("/api/hosting/products").then((r) => r.ok ? r.json() : []),
    ]).then(([ordersData, productsData]) => {
      if (!cancelled) {
        setOrders(ordersData);
        setProducts(productsData);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function checkDomain() {
    if (!domainQuery.trim()) return;
    setDomainChecking(true);
    setDomainResult(null);
    try {
      const res = await fetch("/api/hosting/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainQuery.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setDomainResult(data);
      } else {
        setDomainResult({ domain: domainQuery, available: false, message: data.error });
      }
    } catch {
      setDomainResult({ domain: domainQuery, available: false, message: "Failed to check domain" });
    }
    setDomainChecking(false);
  }

  async function submitOrder(type: string, domain?: string, productId?: string, notes?: string) {
    setOrderSubmitting(true);
    try {
      const res = await fetch("/api/hosting/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderType: type,
          domain: domain || orderDomain || undefined,
          productId: productId || orderProduct || undefined,
          notes: notes || orderNotes || undefined,
        }),
      });
      if (res.ok) {
        setOrderDomain("");
        setOrderProduct("");
        setOrderNotes("");
        setDomainResult(null);
        setDomainQuery("");
        await fetchOrders();
        setTab("orders");
      }
    } catch { /* ignore */ }
    setOrderSubmitting(false);
  }

  async function provisionOrder(orderId: string) {
    setActionLoading(orderId);
    try {
      await fetch("/api/hosting/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      await fetchOrders();
    } catch { /* ignore */ }
    setActionLoading("");
  }

  async function updateOrderStatus(orderId: string, status: string) {
    setActionLoading(orderId);
    try {
      await fetch(`/api/hosting/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await fetchOrders();
    } catch { /* ignore */ }
    setActionLoading("");
  }

  async function cancelOrder(orderId: string) {
    if (!confirm("Cancel this order?")) return;
    setActionLoading(orderId);
    try {
      await fetch(`/api/hosting/orders/${orderId}`, { method: "DELETE" });
      await fetchOrders();
    } catch { /* ignore */ }
    setActionLoading("");
  }

  async function createProduct() {
    setOrderSubmitting(true);
    try {
      const features = productForm.features
        ? productForm.features.split("\n").map((f) => f.trim()).filter(Boolean)
        : [];
      const res = await fetch("/api/hosting/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productForm.name,
          type: productForm.type,
          description: productForm.description || null,
          monthlyPrice: parseFloat(productForm.monthlyPrice),
          setupFee: parseFloat(productForm.setupFee) || 0,
          pleskPlanName: productForm.pleskPlanName || null,
          features,
        }),
      });
      if (res.ok) {
        setProductForm({ name: "", type: "HOSTING", description: "", monthlyPrice: "", setupFee: "0", pleskPlanName: "", features: "" });
        setShowProductForm(false);
        await fetchProducts();
      }
    } catch { /* ignore */ }
    setOrderSubmitting(false);
  }

  const hostingProducts = products.filter((p) => p.type === "HOSTING");
  const sslProducts = products.filter((p) => p.type === "SSL");
  const domainProducts = products.filter((p) => p.type === "DOMAIN");

  // ─── PageSpeed handler ──────────────────────────────
  async function runPageSpeed() {
    if (!psUrl.trim()) return;
    setPsLoading(true);
    setPsResult(null);
    setPsError("");
    try {
      const res = await fetch("/api/hosting/pagespeed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: psUrl.trim(), strategy: psStrategy }),
      });
      const data = await res.json();
      if (res.ok) {
        setPsResult(data);
      } else {
        setPsError(data.error || "Analysis failed");
      }
    } catch {
      setPsError("Failed to run analysis");
    }
    setPsLoading(false);
  }

  // ─── Domain Tools handlers ──────────────────────────
  async function runWhois() {
    if (!dtDomain.trim()) return;
    setDtLoading(true);
    setWhoisResult(null);
    setDtError("");
    try {
      const res = await fetch("/api/hosting/whois", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: dtDomain.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setWhoisResult(data);
      } else {
        setDtError(data.error || "WHOIS lookup failed");
      }
    } catch {
      setDtError("Failed to perform WHOIS lookup");
    }
    setDtLoading(false);
  }

  async function runDnsLookup() {
    if (!dtDomain.trim()) return;
    setDtLoading(true);
    setDnsResult(null);
    setDtError("");
    try {
      const res = await fetch("/api/hosting/dns-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: dtDomain.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setDnsResult(data);
      } else {
        setDtError(data.error || "DNS lookup failed");
      }
    } catch {
      setDtError("Failed to perform DNS lookup");
    }
    setDtLoading(false);
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: "orders", label: "My Orders", icon: <Package size={16} /> },
    { id: "hosting", label: "New Hosting", icon: <Server size={16} /> },
    { id: "domain", label: "Domains", icon: <Globe size={16} /> },
    { id: "ssl", label: "SSL Certificates", icon: <ShieldCheck size={16} /> },
    { id: "performance", label: "Performance", icon: <Gauge size={16} /> },
    { id: "domaintools", label: "Domain Tools", icon: <Wrench size={16} /> },
    { id: "quote", label: "Request Quote", icon: <FileQuestion size={16} /> },
    { id: "products", label: "Manage Products", icon: <Settings size={16} />, adminOnly: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Hosting & Services
        </h1>
        <button
          onClick={() => { fetchOrders(); fetchProducts(); }}
          title="Refresh"
          className="p-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
        >
          <RefreshCw size={16} className="text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-1 overflow-x-auto">
          {tabs
            .filter((t) => !t.adminOnly || isAdmin)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  tab === t.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
        </nav>
      </div>

      {/* ─── My Orders ─────────────────────────────── */}
      {tab === "orders" && (
        <div>
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <Package className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No orders yet. Get started by requesting new hosting or a domain.</p>
              <button
                onClick={() => setTab("hosting")}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
              >
                Browse Hosting Plans
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const statusInfo = ORDER_STATUS_STYLE[order.status] || ORDER_STATUS_STYLE.PENDING;
                return (
                  <div
                    key={order.id}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {ORDER_TYPE_LABELS[order.orderType] || order.orderType}
                          </h3>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.bg}`}>
                            {statusInfo.icon} {statusInfo.text}
                          </span>
                        </div>
                        {order.domain && (
                          <p className="text-sm text-blue-600 mt-1">{order.domain}</p>
                        )}
                        {order.product && (
                          <p className="text-xs text-slate-500 mt-1">
                            Plan: {order.product.name} — R{Number(order.product.monthlyPrice).toFixed(2)}/mo
                          </p>
                        )}
                        {order.notes && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{order.notes}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-2">
                          {new Date(order.createdAt).toLocaleDateString("en-ZA")}
                          {isAdmin && order.user && ` — ${order.user.firstName} ${order.user.lastName} (${order.user.email})`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {order.amount && (
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            R{Number(order.amount).toFixed(2)}
                          </span>
                        )}
                        {/* Admin actions */}
                        {isAdmin && order.status !== "ACTIVE" && order.status !== "CANCELLED" && (
                          <>
                            {(order.status === "PENDING" || order.status === "QUOTED") && (
                              <button
                                onClick={() => updateOrderStatus(order.id, "PROFORMA_SENT")}
                                disabled={actionLoading === order.id}
                                title="Mark Proforma Sent"
                                className="p-1.5 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition"
                              >
                                <ArrowRight size={14} />
                              </button>
                            )}
                            {order.status === "PROFORMA_SENT" && (
                              <button
                                onClick={() => updateOrderStatus(order.id, "PAID")}
                                disabled={actionLoading === order.id}
                                title="Mark as Paid"
                                className="p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100 transition"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                            {order.status === "PAID" && (
                              <button
                                onClick={() => provisionOrder(order.id)}
                                disabled={actionLoading === order.id}
                                title="Provision on Plesk"
                                className="p-1.5 rounded bg-purple-50 text-purple-600 hover:bg-purple-100 transition"
                              >
                                <Play size={14} />
                              </button>
                            )}
                          </>
                        )}
                        {order.status === "PENDING" && (
                          <button
                            onClick={() => cancelOrder(order.id)}
                            disabled={actionLoading === order.id}
                            title="Cancel order"
                            className="p-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── New Hosting ───────────────────────────── */}
      {tab === "hosting" && (
        <div>
          {hostingProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <Server className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No hosting plans available yet. Please check back soon or request a quote.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {hostingProducts.map((product) => {
                  const features: string[] = product.features ? JSON.parse(product.features) : [];
                  return (
                    <div
                      key={product.id}
                      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 flex flex-col"
                    >
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{product.name}</h3>
                      {product.description && (
                        <p className="text-sm text-slate-500 mt-1">{product.description}</p>
                      )}
                      <div className="mt-4">
                        <span className="text-3xl font-bold text-slate-900 dark:text-white">
                          R{Number(product.monthlyPrice).toFixed(0)}
                        </span>
                        <span className="text-sm text-slate-500">/month</span>
                      </div>
                      {Number(product.setupFee) > 0 && (
                        <p className="text-xs text-slate-400 mt-1">
                          + R{Number(product.setupFee).toFixed(0)} setup fee
                        </p>
                      )}
                      {features.length > 0 && (
                        <ul className="mt-4 space-y-2 flex-1">
                          {features.map((f, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                              <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        onClick={() => {
                          setOrderProduct(product.id);
                          setTab("domain");
                        }}
                        className="mt-6 w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
                      >
                        Select Plan <ArrowRight size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Domain Check / Order ──────────────────── */}
      {tab === "domain" && (
        <div className="space-y-6">
          {/* Domain Availability Check */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Check Domain Availability</h2>
            <p className="text-sm text-slate-500 mb-4">
              Enter a domain name to check availability across all extensions.
              {domainProducts.length === 0 && " Configure domain products in Hosting Admin to show pricing."}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={domainQuery}
                onChange={(e) => setDomainQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && checkDomain()}
                placeholder="e.g. mybusiness or mybusiness.co.za"
                className="flex-1 px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
              />
              <button
                onClick={checkDomain}
                disabled={domainChecking || !domainQuery.trim()}
                className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {domainChecking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Check
              </button>
            </div>

            {/* Multi-TLD Results */}
            {domainResult?.results && domainResult.results.length > 0 && (
              <div className="mt-4 space-y-2">
                {domainResult.results.map((r) => (
                  <div
                    key={r.domain}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      r.available
                        ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                        : "bg-slate-50 border-slate-200 dark:bg-slate-700/30 dark:border-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {r.available ? (
                        <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                      ) : (
                        <XCircle size={18} className="text-slate-400 shrink-0" />
                      )}
                      <div>
                        <p className={`text-sm font-medium ${r.available ? "text-green-800 dark:text-green-300" : "text-slate-500 dark:text-slate-400"}`}>
                          {r.domain}
                        </p>
                        <p className={`text-xs ${r.available ? "text-green-600 dark:text-green-400" : "text-slate-400"}`}>
                          {r.available ? "Available" : "Already registered"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.price !== null && (
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          R{r.price.toFixed(2)}<span className="text-xs font-normal text-slate-400">/yr</span>
                        </span>
                      )}
                      {r.available ? (
                        <button
                          onClick={() => submitOrder("DOMAIN_REGISTER", r.domain, r.productId || orderProduct || undefined)}
                          disabled={orderSubmitting}
                          className="px-4 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                        >
                          {orderSubmitting ? "..." : "Register"}
                        </button>
                      ) : (
                        <button
                          onClick={() => submitOrder("DOMAIN_TRANSFER", r.domain, r.productId || orderProduct || undefined)}
                          disabled={orderSubmitting}
                          className="px-4 py-1.5 border border-slate-300 dark:border-slate-500 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition disabled:opacity-50"
                        >
                          Transfer
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Backward-compat single result (no multi results) */}
            {domainResult && !domainResult.results && (
              <div className={`mt-4 p-4 rounded-lg border ${
                domainResult.available
                  ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
                  : "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
              }`}>
                <div className="flex items-center gap-2">
                  {domainResult.available ? (
                    <CheckCircle2 size={18} className="text-green-600" />
                  ) : (
                    <XCircle size={18} className="text-red-600" />
                  )}
                  <p className={`text-sm font-medium ${domainResult.available ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                    {domainResult.message}
                  </p>
                </div>
                {domainResult.available && (
                  <button
                    onClick={() => submitOrder("DOMAIN_REGISTER", domainResult.domain, orderProduct || undefined)}
                    disabled={orderSubmitting}
                    className="mt-3 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {orderSubmitting ? "Submitting..." : "Register This Domain"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Domain Pricing Table */}
          {domainProducts.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Domain Pricing</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {domainProducts.map((product) => {
                  const features: string[] = product.features ? (() => { try { return JSON.parse(product.features!); } catch { return []; } })() : [];
                  return (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{product.name}</p>
                        {product.description && (
                          <p className="text-xs text-slate-400 mt-0.5">{product.description}</p>
                        )}
                        {features.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {features.slice(0, 2).map((f, i) => (
                              <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded">{f}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right ml-3">
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          R{Number(product.monthlyPrice).toFixed(0)}
                        </p>
                        <p className="text-[10px] text-slate-400">/year</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Order: domain + hosting */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {orderProduct ? "Complete Your Hosting Order" : "Order Domain with Hosting"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Domain Name *</label>
                <input
                  type="text"
                  value={orderDomain}
                  onChange={(e) => setOrderDomain(e.target.value)}
                  placeholder="yourdomain.co.za"
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Action</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="radio"
                      name="domainAction"
                      checked={domainAction === "register"}
                      onChange={() => setDomainAction("register")}
                      className="text-blue-600"
                    />
                    Register new domain
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="radio"
                      name="domainAction"
                      checked={domainAction === "transfer"}
                      onChange={() => setDomainAction("transfer")}
                      className="text-blue-600"
                    />
                    Transfer existing domain
                  </label>
                </div>
              </div>
              {!orderProduct && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Add Hosting Plan (optional)</label>
                  <select
                    title="Select hosting plan"
                    value={orderProduct}
                    onChange={(e) => setOrderProduct(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                  >
                    <option value="">Domain only</option>
                    {hostingProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — R{Number(p.monthlyPrice).toFixed(0)}/mo
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {orderProduct && (
                <p className="text-sm text-blue-600">
                  Selected plan: {products.find((p) => p.id === orderProduct)?.name}
                  <button onClick={() => setOrderProduct("")} className="ml-2 text-xs text-slate-400 hover:text-red-500">(remove)</button>
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Additional Notes</label>
                <textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Any special requirements..."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                />
              </div>
              <button
                onClick={() => {
                  const type = orderProduct
                    ? "HOSTING"
                    : domainAction === "register"
                    ? "DOMAIN_REGISTER"
                    : "DOMAIN_TRANSFER";
                  submitOrder(type, orderDomain, orderProduct || undefined, orderNotes || undefined);
                }}
                disabled={orderSubmitting || !orderDomain.trim()}
                className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {orderSubmitting ? "Submitting..." : "Submit Order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SSL Certificates ──────────────────────── */}
      {tab === "ssl" && (
        <div>
          {sslProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <ShieldCheck className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No SSL products configured yet. Use &ldquo;Request Quote&rdquo; to ask about SSL certificates.</p>
              <button
                onClick={() => setTab("quote")}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
              >
                Request SSL Quote
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sslProducts.map((product) => {
                const features: string[] = product.features ? JSON.parse(product.features) : [];
                return (
                  <div
                    key={product.id}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 flex flex-col"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={20} className="text-green-500" />
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{product.name}</h3>
                    </div>
                    {product.description && (
                      <p className="text-sm text-slate-500 mt-2">{product.description}</p>
                    )}
                    <div className="mt-4">
                      <span className="text-3xl font-bold text-slate-900 dark:text-white">
                        R{Number(product.monthlyPrice).toFixed(0)}
                      </span>
                      <span className="text-sm text-slate-500">/month</span>
                    </div>
                    {features.length > 0 && (
                      <ul className="mt-4 space-y-2 flex-1">
                        {features.map((f, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-6 space-y-2">
                      <input
                        type="text"
                        placeholder="Domain for SSL..."
                        value={orderDomain}
                        onChange={(e) => setOrderDomain(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                      />
                      <button
                        onClick={() => submitOrder("SSL", orderDomain || undefined, product.id)}
                        disabled={orderSubmitting}
                        className="w-full px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                      >
                        {orderSubmitting ? "Submitting..." : "Order SSL Certificate"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Request Quote ─────────────────────────── */}
      {tab === "quote" && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Request a Quote</h2>
          <p className="text-sm text-slate-500 mb-6">
            Tell us what you need and we&apos;ll get back to you with a customised quote.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">What do you need?</label>
              <select
                title="Service type"
                value={orderProduct}
                onChange={(e) => setOrderProduct(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
              >
                <option value="">General hosting enquiry</option>
                <option value="hosting">Web Hosting</option>
                <option value="ssl">SSL Certificate</option>
                <option value="domain">Domain Registration</option>
                <option value="email">Email Hosting</option>
                <option value="vps">VPS / Dedicated Server</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Domain (if applicable)</label>
              <input
                type="text"
                value={orderDomain}
                onChange={(e) => setOrderDomain(e.target.value)}
                placeholder="yourdomain.co.za"
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Details *</label>
              <textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Describe what you need — hosting specs, number of emails, expected traffic, etc."
                rows={5}
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
              />
            </div>
            <button
              onClick={() => submitOrder("QUOTE_REQUEST", orderDomain || undefined, undefined, orderNotes)}
              disabled={orderSubmitting || !orderNotes.trim()}
              className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {orderSubmitting ? "Submitting..." : "Submit Quote Request"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Performance (PageSpeed Insights) ──────── */}
      {tab === "performance" && (
        <div className="space-y-6">
          {/* Input */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">PageSpeed Insights</h2>
            <p className="text-sm text-slate-500 mb-4">Analyze your website&apos;s performance, accessibility, SEO, and best practices using Google Lighthouse.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={psUrl}
                onChange={(e) => setPsUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runPageSpeed()}
                placeholder="Enter website URL (e.g. example.co.za)"
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <select
                value={psStrategy}
                onChange={(e) => setPsStrategy(e.target.value as "mobile" | "desktop")}
                title="Analysis strategy"
                className="px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-sm"
              >
                <option value="mobile">Mobile</option>
                <option value="desktop">Desktop</option>
              </select>
              <button
                onClick={runPageSpeed}
                disabled={psLoading || !psUrl.trim()}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                {psLoading ? <Loader2 size={16} className="animate-spin" /> : <Gauge size={16} />}
                {psLoading ? "Analyzing..." : "Analyze"}
              </button>
            </div>
          </div>

          {psError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertTriangle size={18} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{psError}</p>
            </div>
          )}

          {psLoading && (
            <div className="text-center py-16">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
              <p className="mt-3 text-sm text-slate-500">Running Lighthouse analysis... This may take 15-30 seconds.</p>
            </div>
          )}

          {psResult && !psLoading && (
            <div className="space-y-6">
              {/* Scores */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {([
                  { key: "performance", label: "Performance", color: "blue" },
                  { key: "accessibility", label: "Accessibility", color: "purple" },
                  { key: "bestPractices", label: "Best Practices", color: "green" },
                  { key: "seo", label: "SEO", color: "orange" },
                ] as const).map(({ key, label }) => {
                  const score = psResult.scores[key];
                  const scoreColor = score >= 90 ? "text-green-600" : score >= 50 ? "text-orange-500" : "text-red-500";
                  const ringColor = score >= 90 ? "border-green-500" : score >= 50 ? "border-orange-400" : "border-red-500";
                  return (
                    <div key={key} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 text-center">
                      <div className={`mx-auto w-20 h-20 rounded-full border-4 ${ringColor} flex items-center justify-center mb-3`}>
                        <span className={`text-2xl font-bold ${scoreColor}`}>{score}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Core Web Vitals */}
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Core Web Vitals & Metrics</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {([
                    { key: "firstContentfulPaint", label: "First Contentful Paint" },
                    { key: "largestContentfulPaint", label: "Largest Contentful Paint" },
                    { key: "totalBlockingTime", label: "Total Blocking Time" },
                    { key: "cumulativeLayoutShift", label: "Cumulative Layout Shift" },
                    { key: "speedIndex", label: "Speed Index" },
                    { key: "timeToInteractive", label: "Time to Interactive" },
                  ] as const).map(({ key, label }) => (
                    <div key={key} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
                      <p className="text-lg font-semibold text-slate-900 dark:text-white">
                        {psResult.metrics[key] || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Opportunities */}
              {psResult.opportunities.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Opportunities for Improvement</h3>
                  <div className="space-y-3">
                    {psResult.opportunities.map((opp, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20">
                        <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{opp.title}</p>
                          {opp.displayValue && (
                            <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">{opp.displayValue}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diagnostics */}
              {psResult.diagnostics.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Diagnostics</h3>
                  <div className="space-y-2">
                    {psResult.diagnostics.map((d, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30">
                        <Info size={16} className="text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{d.title}</p>
                          {d.displayValue && (
                            <p className="text-xs text-slate-500 mt-0.5">{d.displayValue}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 text-center">
                Analyzed {psResult.url} ({psResult.strategy}) — Powered by Google Lighthouse
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Domain Tools (WHOIS + DNS) ────────────── */}
      {tab === "domaintools" && (
        <div className="space-y-6">
          {/* Input */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Domain Troubleshooting Tools</h2>
            <p className="text-sm text-slate-500 mb-4">Look up WHOIS registration data or check DNS records for any domain.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={dtDomain}
                onChange={(e) => setDtDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (dtActiveTool === "whois") runWhois();
                    else runDnsLookup();
                  }
                }}
                placeholder="Enter domain (e.g. example.co.za)"
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setDtActiveTool("whois"); if (dtDomain.trim()) runWhois(); }}
                  disabled={dtLoading || !dtDomain.trim()}
                  className={`px-4 py-2.5 text-sm rounded-lg transition flex items-center gap-2 ${
                    dtActiveTool === "whois"
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                  } disabled:opacity-50`}
                >
                  {dtLoading && dtActiveTool === "whois" ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  WHOIS
                </button>
                <button
                  onClick={() => { setDtActiveTool("dns"); if (dtDomain.trim()) runDnsLookup(); }}
                  disabled={dtLoading || !dtDomain.trim()}
                  className={`px-4 py-2.5 text-sm rounded-lg transition flex items-center gap-2 ${
                    dtActiveTool === "dns"
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                  } disabled:opacity-50`}
                >
                  {dtLoading && dtActiveTool === "dns" ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                  DNS Lookup
                </button>
              </div>
            </div>
          </div>

          {dtError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertTriangle size={18} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{dtError}</p>
            </div>
          )}

          {dtLoading && (
            <div className="text-center py-12">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
              <p className="mt-3 text-sm text-slate-500">Looking up {dtActiveTool === "whois" ? "WHOIS" : "DNS"} data...</p>
            </div>
          )}

          {/* WHOIS Results */}
          {whoisResult && !dtLoading && dtActiveTool === "whois" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    WHOIS — {whoisResult.domain}
                  </h3>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {/* Status */}
                  {whoisResult.status.length > 0 && (
                    <div className="px-6 py-3 flex flex-wrap gap-2">
                      <span className="text-xs font-medium text-slate-500 w-32 py-0.5">Status</span>
                      <div className="flex flex-wrap gap-1.5">
                        {whoisResult.status.map((s, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dates */}
                  {whoisResult.registrationDate && (
                    <div className="px-6 py-3 flex items-center">
                      <span className="text-xs font-medium text-slate-500 w-32">Registered</span>
                      <span className="text-sm text-slate-900 dark:text-white">
                        {new Date(whoisResult.registrationDate).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}
                      </span>
                    </div>
                  )}
                  {whoisResult.expirationDate && (
                    <div className="px-6 py-3 flex items-center">
                      <span className="text-xs font-medium text-slate-500 w-32">Expires</span>
                      <span className="text-sm text-slate-900 dark:text-white">
                        {new Date(whoisResult.expirationDate).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}
                      </span>
                    </div>
                  )}
                  {whoisResult.lastChanged && (
                    <div className="px-6 py-3 flex items-center">
                      <span className="text-xs font-medium text-slate-500 w-32">Last Updated</span>
                      <span className="text-sm text-slate-900 dark:text-white">
                        {new Date(whoisResult.lastChanged).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}
                      </span>
                    </div>
                  )}

                  {/* Registrar */}
                  {whoisResult.registrar && (
                    <div className="px-6 py-3 flex items-start">
                      <span className="text-xs font-medium text-slate-500 w-32 pt-0.5">Registrar</span>
                      <div className="text-sm text-slate-900 dark:text-white">
                        <p>{whoisResult.registrar.name || whoisResult.registrar.handle || "Unknown"}</p>
                        {whoisResult.registrar.organization && <p className="text-xs text-slate-500">{whoisResult.registrar.organization}</p>}
                      </div>
                    </div>
                  )}

                  {/* Registrant */}
                  {whoisResult.registrant && (
                    <div className="px-6 py-3 flex items-start">
                      <span className="text-xs font-medium text-slate-500 w-32 pt-0.5">Registrant</span>
                      <div className="text-sm text-slate-900 dark:text-white">
                        <p>{whoisResult.registrant.name || whoisResult.registrant.organization || "Redacted"}</p>
                        {whoisResult.registrant.email && <p className="text-xs text-slate-500">{whoisResult.registrant.email}</p>}
                      </div>
                    </div>
                  )}

                  {/* Nameservers */}
                  {whoisResult.nameservers.length > 0 && (
                    <div className="px-6 py-3 flex items-start">
                      <span className="text-xs font-medium text-slate-500 w-32 pt-0.5">Nameservers</span>
                      <div className="space-y-1">
                        {whoisResult.nameservers.map((ns, i) => (
                          <p key={i} className="text-sm text-slate-900 dark:text-white font-mono">{ns}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* DNSSEC */}
                  {whoisResult.secureDNS && (
                    <div className="px-6 py-3 flex items-center">
                      <span className="text-xs font-medium text-slate-500 w-32">DNSSEC</span>
                      <span className={`text-sm font-medium ${whoisResult.secureDNS.delegationSigned ? "text-green-600" : "text-slate-500"}`}>
                        {whoisResult.secureDNS.delegationSigned ? "Signed" : "Unsigned"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DNS Lookup Results */}
          {dnsResult && !dtLoading && dtActiveTool === "dns" && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    DNS Records — {dnsResult.domain}
                  </h3>
                  <span className="text-xs text-slate-400">{new Date(dnsResult.timestamp).toLocaleString()}</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {Object.entries(dnsResult.records).map(([type, records]) => {
                    const typeColors: Record<string, string> = {
                      A: "bg-blue-100 text-blue-700",
                      AAAA: "bg-cyan-100 text-cyan-700",
                      MX: "bg-purple-100 text-purple-700",
                      NS: "bg-green-100 text-green-700",
                      TXT: "bg-yellow-100 text-yellow-700",
                      CNAME: "bg-orange-100 text-orange-700",
                      SOA: "bg-pink-100 text-pink-700",
                      SRV: "bg-indigo-100 text-indigo-700",
                      CAA: "bg-red-100 text-red-700",
                    };

                    if (!records || (records as Record<string, unknown>).error) {
                      return (
                        <div key={type} className="px-6 py-3 flex items-center gap-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${typeColors[type] || "bg-slate-100 text-slate-700"}`}>{type}</span>
                          <span className="text-xs text-slate-400">
                            {(records as Record<string, unknown>)?.error ? `Error: ${(records as Record<string, string>).error}` : "No records"}
                          </span>
                        </div>
                      );
                    }

                    if (Array.isArray(records) && records.length === 0) {
                      return (
                        <div key={type} className="px-6 py-3 flex items-center gap-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${typeColors[type] || "bg-slate-100 text-slate-700"}`}>{type}</span>
                          <span className="text-xs text-slate-400">No records found</span>
                        </div>
                      );
                    }

                    return (
                      <div key={type} className="px-6 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${typeColors[type] || "bg-slate-100 text-slate-700"}`}>{type}</span>
                          <span className="text-xs text-slate-400">{Array.isArray(records) ? records.length : 1} record{Array.isArray(records) && records.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="space-y-1 ml-1">
                          {Array.isArray(records) && records.map((rec, i) => {
                            if (type === "SOA") {
                              const soa = rec as Record<string, unknown>;
                              return (
                                <div key={i} className="text-xs font-mono bg-slate-50 dark:bg-slate-700/30 rounded p-2 space-y-0.5">
                                  <p><span className="text-slate-500">Primary NS:</span> {soa.nsname as string}</p>
                                  <p><span className="text-slate-500">Hostmaster:</span> {soa.hostmaster as string}</p>
                                  <p><span className="text-slate-500">Serial:</span> {soa.serial as string}</p>
                                  <p><span className="text-slate-500">Refresh:</span> {soa.refresh as string}s / <span className="text-slate-500">Retry:</span> {soa.retry as string}s / <span className="text-slate-500">Expire:</span> {soa.expire as string}s</p>
                                </div>
                              );
                            }
                            const r = rec as Record<string, unknown>;
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs font-mono">
                                <span className="text-slate-900 dark:text-white break-all">{r.value as string || r.exchange as string}</span>
                                {r.priority !== undefined && (
                                  <span className="text-slate-400">(priority: {r.priority as string})</span>
                                )}
                                {r.port !== undefined && (
                                  <span className="text-slate-400">(port: {r.port as string})</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reverse DNS */}
                {dnsResult.reverseDns && dnsResult.reverseDns.length > 0 && (
                  <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-700">PTR</span>
                      <span className="text-xs text-slate-400">Reverse DNS</span>
                    </div>
                    {dnsResult.reverseDns.map((ptr, i) => (
                      <p key={i} className="text-xs font-mono text-slate-900 dark:text-white ml-1">{ptr}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Manage Products (Admin) ───────────────── */}
      {tab === "products" && isAdmin && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Hosting Products</h2>
            <button
              onClick={() => setShowProductForm(!showProductForm)}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
            >
              <Plus size={14} /> Add Product
            </button>
          </div>

          {showProductForm && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">New Product</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name *</label>
                  <input
                    type="text"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    placeholder="e.g. Starter Hosting"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Type *</label>
                  <select
                    title="Product type"
                    value={productForm.type}
                    onChange={(e) => setProductForm({ ...productForm, type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                  >
                    <option value="HOSTING">Hosting</option>
                    <option value="SSL">SSL Certificate</option>
                    <option value="DOMAIN">Domain</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Monthly Price (ZAR) *</label>
                  <input
                    type="number"
                    value={productForm.monthlyPrice}
                    onChange={(e) => setProductForm({ ...productForm, monthlyPrice: e.target.value })}
                    placeholder="99.00"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Setup Fee (ZAR)</label>
                  <input
                    type="number"
                    value={productForm.setupFee}
                    onChange={(e) => setProductForm({ ...productForm, setupFee: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Plesk Plan Name</label>
                  <input
                    type="text"
                    value={productForm.pleskPlanName}
                    onChange={(e) => setProductForm({ ...productForm, pleskPlanName: e.target.value })}
                    placeholder="e.g. Default Domain"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={productForm.description}
                    onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                    placeholder="Short description"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Features (one per line)</label>
                  <textarea
                    value={productForm.features}
                    onChange={(e) => setProductForm({ ...productForm, features: e.target.value })}
                    placeholder={"10GB SSD Storage\n5 Email Accounts\nFree SSL Certificate\n24/7 Support"}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={createProduct}
                  disabled={orderSubmitting || !productForm.name || !productForm.monthlyPrice}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {orderSubmitting ? "Creating..." : "Create Product"}
                </button>
                <button
                  onClick={() => setShowProductForm(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Products Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Type</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Monthly</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Setup</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Plesk Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{p.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.type === "HOSTING" ? "bg-blue-100 text-blue-700" :
                        p.type === "SSL" ? "bg-green-100 text-green-700" :
                        "bg-purple-100 text-purple-700"
                      }`}>
                        {p.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">R{Number(p.monthlyPrice).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">R{Number(p.setupFee).toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-500">{p.pleskPlanName || "—"}</td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No products yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
