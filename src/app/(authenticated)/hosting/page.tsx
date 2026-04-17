"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";

const DomainsManager = dynamic(() => import("../domains/page"), {
  loading: () => <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" /></div>,
});

import {
  Globe,
  Server,
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
  Edit3,
  Save,
  X,
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

type Tab = "orders" | "domain" | "dns" | "domains" | "quote" | "products" | "performance" | "domaintools";

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

  // Inline product editing
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductForm, setEditProductForm] = useState({ name: "", type: "HOSTING", monthlyPrice: "", setupFee: "", pleskPlanName: "" });
  const [editProductSaving, setEditProductSaving] = useState(false);

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

  // DNS Manager state
  const [dnsDomains, setDnsDomains] = useState<{ id: string; domain: string; orderType: string; status: string }[]>([]);
  const [dnsSelectedDomain, setDnsSelectedDomain] = useState("");
  const [dnsCustomDomain, setDnsCustomDomain] = useState("");
  const [dnsRecords, setDnsRecords] = useState<{ id?: number; type: string; host: string; value: string; opt?: string }[]>([]);
  const [dnsSource, setDnsSource] = useState<"plesk" | "dns" | "">("");
  const [dnsLoading, setDnsLoading] = useState(false);
  const [dnsFilterType, setDnsFilterType] = useState("");
  const [dnsNameservers, setDnsNameservers] = useState<string[]>([]);
  const [dnsNsLoading, setDnsNsLoading] = useState(false);
  const [dnsNsEditing, setDnsNsEditing] = useState(false);
  const [dnsNsForm, setDnsNsForm] = useState(["", "", "", ""]);
  const [dnsNsSubmitting, setDnsNsSubmitting] = useState(false);
  const [dnsShowAddForm, setDnsShowAddForm] = useState(false);
  const [dnsEditingRecord, setDnsEditingRecord] = useState<{ id?: number; type: string; host: string; value: string; opt?: string } | null>(null);
  const [dnsForm, setDnsForm] = useState({ type: "A", host: "", value: "", opt: "" });
  const [dnsSubmitting, setDnsSubmitting] = useState(false);
  const [dnsMessage, setDnsMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dnsActiveSection, setDnsActiveSection] = useState<"dns" | "nameservers">("dns");

  const dnsActiveDomain = dnsCustomDomain || dnsSelectedDomain;

  const dnsShowMsg = (type: "success" | "error", text: string) => {
    setDnsMessage({ type, text });
    setTimeout(() => setDnsMessage(null), 5000);
  };

  const fetchDnsRecords = useCallback(async () => {
    if (!dnsActiveDomain) return;
    setDnsLoading(true);
    try {
      const res = await fetch(`/api/hosting/dns?domain=${encodeURIComponent(dnsActiveDomain)}`);
      if (!res.ok) {
        const data = await res.json();
        dnsShowMsg("error", data.error || "Failed to fetch DNS records");
        setDnsRecords([]);
        setDnsSource("");
      } else {
        const data = await res.json();
        setDnsRecords(data.records || []);
        setDnsSource(data.source || "dns");
      }
    } catch {
      dnsShowMsg("error", "Failed to fetch DNS records");
    }
    setDnsLoading(false);
  }, [dnsActiveDomain]);

  const fetchDnsNameservers = useCallback(async () => {
    if (!dnsActiveDomain) return;
    setDnsNsLoading(true);
    try {
      const res = await fetch(`/api/hosting/nameservers?domain=${encodeURIComponent(dnsActiveDomain)}`);
      const data = await res.json();
      setDnsNameservers(data.nameservers || []);
    } catch {
      setDnsNameservers([]);
    }
    setDnsNsLoading(false);
  }, [dnsActiveDomain]);

  useEffect(() => {
    if (dnsActiveDomain) {
      fetchDnsRecords();
      fetchDnsNameservers();
    }
  }, [dnsActiveDomain, fetchDnsRecords, fetchDnsNameservers]);

  // Load DNS domains when DNS tab is active
  useEffect(() => {
    if (tab === "dns" && dnsDomains.length === 0) {
      fetch("/api/hosting/orders?status=ACTIVE")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            const doms = data.filter(
              (o: { domain?: string; orderType: string }) =>
                o.domain && ["DOMAIN_REGISTER", "DOMAIN_TRANSFER", "HOSTING"].includes(o.orderType)
            );
            setDnsDomains(doms);
            if (doms.length > 0 && !dnsSelectedDomain) {
              setDnsSelectedDomain(doms[0].domain);
            }
          }
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function dnsHandleAddRecord() {
    if (!dnsForm.type || !dnsForm.host || !dnsForm.value) {
      dnsShowMsg("error", "Type, host, and value are required");
      return;
    }
    setDnsSubmitting(true);
    try {
      const res = await fetch("/api/hosting/dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: dnsActiveDomain, type: dnsForm.type, host: dnsForm.host, value: dnsForm.value, opt: dnsForm.opt || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        dnsShowMsg("error", data.error || "Failed to add record");
      } else {
        dnsShowMsg("success", `${dnsForm.type} record added successfully`);
        setDnsForm({ type: "A", host: "", value: "", opt: "" });
        setDnsShowAddForm(false);
        fetchDnsRecords();
      }
    } catch { dnsShowMsg("error", "Failed to add record"); }
    setDnsSubmitting(false);
  }

  async function dnsHandleUpdateRecord() {
    if (!dnsEditingRecord?.id) return;
    setDnsSubmitting(true);
    try {
      const res = await fetch("/api/hosting/dns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: dnsEditingRecord.id, domain: dnsActiveDomain, type: dnsForm.type, host: dnsForm.host, value: dnsForm.value, opt: dnsForm.opt || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        dnsShowMsg("error", data.error || "Failed to update record");
      } else {
        dnsShowMsg("success", "Record updated successfully");
        setDnsEditingRecord(null);
        setDnsForm({ type: "A", host: "", value: "", opt: "" });
        fetchDnsRecords();
      }
    } catch { dnsShowMsg("error", "Failed to update record"); }
    setDnsSubmitting(false);
  }

  async function dnsHandleDeleteRecord(recordId: number) {
    if (!confirm("Delete this DNS record?")) return;
    try {
      const res = await fetch(`/api/hosting/dns?recordId=${recordId}&domain=${encodeURIComponent(dnsActiveDomain)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        dnsShowMsg("error", data.error || "Failed to delete record");
      } else {
        dnsShowMsg("success", "Record deleted");
        fetchDnsRecords();
      }
    } catch { dnsShowMsg("error", "Failed to delete record"); }
  }

  async function dnsHandleSubmitNameservers() {
    const filtered = dnsNsForm.filter((ns) => ns.trim());
    if (filtered.length < 1) { dnsShowMsg("error", "At least 1 nameserver is required"); return; }
    setDnsNsSubmitting(true);
    try {
      const res = await fetch("/api/hosting/nameservers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: dnsActiveDomain, nameservers: filtered }),
      });
      const data = await res.json();
      if (!res.ok) { dnsShowMsg("error", data.error || "Failed to submit"); }
      else { dnsShowMsg("success", data.message || "Nameserver change submitted"); setDnsNsEditing(false); }
    } catch { dnsShowMsg("error", "Failed to submit"); }
    setDnsNsSubmitting(false);
  }

  const dnsFilteredRecords = dnsFilterType ? dnsRecords.filter((r) => r.type === dnsFilterType) : dnsRecords;
  const dnsRecordTypeCounts = dnsRecords.reduce<Record<string, number>>((acc, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc; }, {});

  const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];
  const DNS_RECORD_TYPE_COLORS: Record<string, string> = {
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
  const DNS_RECORD_DESCRIPTIONS: Record<string, string> = {
    A: "Points domain to an IPv4 address",
    AAAA: "Points domain to an IPv6 address",
    CNAME: "Alias for another domain name",
    MX: "Mail server for the domain (set priority in Opt)",
    TXT: "Text record (SPF, DKIM, verification)",
    NS: "Nameserver for the domain",
    SRV: "Service location record",
    CAA: "Certificate Authority Authorization",
  };

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

  function startEditingProduct(p: HostingProduct) {
    setEditingProductId(p.id);
    setEditProductForm({
      name: p.name,
      type: p.type,
      monthlyPrice: String(p.monthlyPrice),
      setupFee: String(p.setupFee),
      pleskPlanName: p.pleskPlanName || "",
    });
  }

  async function updateProduct() {
    if (!editingProductId) return;
    setEditProductSaving(true);
    try {
      const res = await fetch(`/api/hosting/products/${editingProductId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editProductForm.name,
          type: editProductForm.type,
          monthlyPrice: parseFloat(editProductForm.monthlyPrice),
          setupFee: parseFloat(editProductForm.setupFee) || 0,
          pleskPlanName: editProductForm.pleskPlanName || null,
        }),
      });
      if (res.ok) {
        setEditingProductId(null);
        await fetchProducts();
      }
    } catch { /* ignore */ }
    setEditProductSaving(false);
  }

  const hostingProducts = products.filter((p) => p.type === "HOSTING");
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
    { id: "domain", label: "New Domain", icon: <Globe size={16} /> },
    { id: "domains", label: "Domains Manager", icon: <Globe size={16} /> },
    { id: "dns", label: "DNS Manager", icon: <Globe size={16} /> },
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
              <p className="mt-3 text-sm text-slate-500">No orders yet. Get started by requesting a domain or a quote.</p>
              <button
                onClick={() => setTab("domain")}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
              >
                Browse Domains
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

      {/* ─── DNS Manager ──────── */}
      {tab === "dns" && (
        <div className="space-y-6">
          {/* Message */}
          {dnsMessage && (
            <div className={`p-4 rounded-xl text-sm font-medium ${dnsMessage.type === "success" ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
              {dnsMessage.text}
            </div>
          )}

          {/* Domain Selector */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Select Domain</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                title="Select domain"
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                value={dnsSelectedDomain}
                onChange={(e) => { setDnsSelectedDomain(e.target.value); setDnsCustomDomain(""); }}
              >
                <option value="">Select a domain...</option>
                {dnsDomains.map((d) => (
                  <option key={d.id} value={d.domain}>{d.domain}</option>
                ))}
              </select>
              <span className="text-slate-400 self-center text-sm">or</span>
              <input
                type="text"
                placeholder="Enter custom domain..."
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                value={dnsCustomDomain}
                onChange={(e) => setDnsCustomDomain(e.target.value)}
              />
            </div>
          </div>

          {dnsActiveDomain ? (
            <>
              {/* Section Tabs */}
              <div className="flex gap-2">
                <button onClick={() => setDnsActiveSection("dns")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dnsActiveSection === "dns" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"}`}>DNS Records</button>
                <button onClick={() => setDnsActiveSection("nameservers")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dnsActiveSection === "nameservers" ? "bg-blue-600 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"}`}>Nameservers</button>
              </div>

              {/* DNS Records Section */}
              {dnsActiveSection === "dns" && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  {/* Toolbar */}
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white">DNS Records for {dnsActiveDomain}</h3>
                      <p className="text-sm text-slate-500 mt-0.5">{dnsRecords.length} records • Source: <span className="font-medium">{dnsSource || "unknown"}</span></p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => fetchDnsRecords()} className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700">
                        <RefreshCw size={14} className={`inline mr-1 ${dnsLoading ? "animate-spin" : ""}`} />Refresh
                      </button>
                      <button onClick={() => { setDnsShowAddForm(true); setDnsEditingRecord(null); setDnsForm({ type: "A", host: "", value: "", opt: "" }); }} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <Plus size={14} className="inline mr-1" />Add Record
                      </button>
                    </div>
                  </div>

                  {/* Filter */}
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 flex flex-wrap gap-2">
                    <button onClick={() => setDnsFilterType("")} className={`px-3 py-1 text-xs rounded-full transition-colors ${!dnsFilterType ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"}`}>All ({dnsRecords.length})</button>
                    {Object.entries(dnsRecordTypeCounts).sort().map(([type, count]) => (
                      <button key={type} onClick={() => setDnsFilterType(type)} className={`px-3 py-1 text-xs rounded-full transition-colors ${dnsFilterType === type ? DNS_RECORD_TYPE_COLORS[type] || "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"}`}>{type} ({count})</button>
                    ))}
                  </div>

                  {/* Add/Edit Form */}
                  {(dnsShowAddForm || dnsEditingRecord) && (
                    <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-slate-900 dark:text-white">{dnsEditingRecord ? "Edit Record" : "Add New Record"}</h4>
                        <button title="Close form" onClick={() => { setDnsShowAddForm(false); setDnsEditingRecord(null); setDnsForm({ type: "A", host: "", value: "", opt: "" }); }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                        <select title="Record type" value={dnsForm.type} onChange={(e) => setDnsForm({ ...dnsForm, type: e.target.value })} className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white">
                          {DNS_RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input type="text" placeholder="Host (e.g. @ or sub)" value={dnsForm.host} onChange={(e) => setDnsForm({ ...dnsForm, host: e.target.value })} className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white" />
                        <input type="text" placeholder="Value" value={dnsForm.value} onChange={(e) => setDnsForm({ ...dnsForm, value: e.target.value })} className="sm:col-span-2 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white" />
                        <input type="text" placeholder="Priority / Opt" value={dnsForm.opt} onChange={(e) => setDnsForm({ ...dnsForm, opt: e.target.value })} className="px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-900 dark:text-white" />
                      </div>
                      {dnsForm.type && DNS_RECORD_DESCRIPTIONS[dnsForm.type] && (
                        <p className="text-xs text-slate-500 mt-2">{DNS_RECORD_DESCRIPTIONS[dnsForm.type]}</p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={dnsEditingRecord ? dnsHandleUpdateRecord : dnsHandleAddRecord} disabled={dnsSubmitting} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          {dnsSubmitting ? "Saving..." : dnsEditingRecord ? "Update" : "Add"}
                        </button>
                        <button onClick={() => { setDnsShowAddForm(false); setDnsEditingRecord(null); setDnsForm({ type: "A", host: "", value: "", opt: "" }); }} className="px-4 py-2 border border-slate-200 dark:border-slate-600 text-sm rounded-lg text-slate-600 dark:text-slate-400">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Records Table */}
                  {dnsLoading ? (
                    <div className="p-8 text-center text-slate-500">Loading DNS records...</div>
                  ) : dnsFilteredRecords.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No records found{dnsFilterType ? ` for type ${dnsFilterType}` : ""}.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-700">
                            <th className="text-left p-3 text-slate-500 font-medium">Type</th>
                            <th className="text-left p-3 text-slate-500 font-medium">Host</th>
                            <th className="text-left p-3 text-slate-500 font-medium">Value</th>
                            <th className="text-left p-3 text-slate-500 font-medium">Opt</th>
                            <th className="text-right p-3 text-slate-500 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dnsFilteredRecords.map((r, i) => (
                            <tr key={`${r.type}-${r.host}-${i}`} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                              <td className="p-3"><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${DNS_RECORD_TYPE_COLORS[r.type] || "bg-slate-100 text-slate-600"}`}>{r.type}</span></td>
                              <td className="p-3 font-mono text-xs text-slate-700 dark:text-slate-300">{r.host}</td>
                              <td className="p-3 font-mono text-xs text-slate-700 dark:text-slate-300 max-w-[300px] truncate" title={r.value}>{r.value}</td>
                              <td className="p-3 text-slate-500">{r.opt || "—"}</td>
                              <td className="p-3 text-right">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => { setDnsEditingRecord(r); setDnsForm({ type: r.type, host: r.host, value: r.value, opt: r.opt || "" }); setDnsShowAddForm(false); }} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Edit"><Edit3 size={14} /></button>
                                  {r.id && <button onClick={() => dnsHandleDeleteRecord(r.id!)} className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete"><Trash2 size={14} /></button>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Nameservers Section */}
              {dnsActiveSection === "nameservers" && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900 dark:text-white">Nameservers for {dnsActiveDomain}</h3>
                    {!dnsNsEditing && (
                      <button onClick={() => { setDnsNsEditing(true); const ns = [...dnsNameservers]; while (ns.length < 4) ns.push(""); setDnsNsForm(ns.slice(0, 4)); }} className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700">
                        <Edit3 size={14} className="inline mr-1" />Edit
                      </button>
                    )}
                  </div>

                  {dnsNsLoading ? (
                    <p className="text-slate-500 text-sm">Loading nameservers...</p>
                  ) : !dnsNsEditing ? (
                    <div className="space-y-2">
                      {dnsNameservers.length > 0 ? dnsNameservers.map((ns, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                          <span className="text-xs font-medium text-slate-400 w-6">NS{i + 1}</span>
                          <span className="font-mono text-sm text-slate-700 dark:text-slate-300">{ns}</span>
                        </div>
                      )) : <p className="text-slate-500 text-sm">No nameservers found.</p>}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {dnsNsForm.map((ns, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-400 w-8">NS{i + 1}</span>
                            <input type="text" value={ns} onChange={(e) => { const arr = [...dnsNsForm]; arr[i] = e.target.value; setDnsNsForm(arr); }} placeholder={`ns${i + 1}.example.com`} className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm font-mono text-slate-900 dark:text-white" />
                          </div>
                        ))}
                      </div>
                      {/* Common Presets */}
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2">Common Presets:</p>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: "Cloudflare", ns: ["ada.ns.cloudflare.com", "ivan.ns.cloudflare.com", "", ""] },
                            { label: "Google DNS", ns: ["ns-cloud-a1.googledomains.com", "ns-cloud-a2.googledomains.com", "ns-cloud-a3.googledomains.com", "ns-cloud-a4.googledomains.com"] },
                            { label: "GSS Hosting", ns: ["ns1.gsoftwareservices.com", "ns2.gsoftwareservices.com", "", ""] },
                          ].map((preset) => (
                            <button key={preset.label} onClick={() => setDnsNsForm(preset.ns)} className="px-3 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700">{preset.label}</button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={dnsHandleSubmitNameservers} disabled={dnsNsSubmitting} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          <Save size={14} className="inline mr-1" />{dnsNsSubmitting ? "Submitting..." : "Save Nameservers"}
                        </button>
                        <button onClick={() => setDnsNsEditing(false)} className="px-4 py-2 border border-slate-200 dark:border-slate-600 text-sm rounded-lg text-slate-600 dark:text-slate-400">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <Globe size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Select a Domain</h3>
              <p className="text-slate-500">Choose a domain above or enter a custom domain to manage its DNS records and nameservers.</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Domains Manager ──────── */}
      {tab === "domains" && <DomainsManager />}

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
                    <option value="MAIL">Mail Hosting</option>
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
                  <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    {editingProductId === p.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            title="Product name"
                            value={editProductForm.name}
                            onChange={(e) => setEditProductForm({ ...editProductForm, name: e.target.value })}
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            title="Product type"
                            value={editProductForm.type}
                            onChange={(e) => setEditProductForm({ ...editProductForm, type: e.target.value })}
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                          >
                            <option value="HOSTING">Hosting</option>
                            <option value="MAIL">Mail Hosting</option>
                            <option value="SSL">SSL Certificate</option>
                            <option value="DOMAIN">Domain</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            title="Monthly price"
                            value={editProductForm.monthlyPrice}
                            onChange={(e) => setEditProductForm({ ...editProductForm, monthlyPrice: e.target.value })}
                            className="w-24 ml-auto px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm text-right text-slate-900 dark:text-white dark:bg-slate-700"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            title="Setup fee"
                            value={editProductForm.setupFee}
                            onChange={(e) => setEditProductForm({ ...editProductForm, setupFee: e.target.value })}
                            className="w-24 ml-auto px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm text-right text-slate-900 dark:text-white dark:bg-slate-700"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            title="Plesk plan name"
                            value={editProductForm.pleskPlanName}
                            onChange={(e) => setEditProductForm({ ...editProductForm, pleskPlanName: e.target.value })}
                            className="w-full px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white dark:bg-slate-700"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title="Save"
                              onClick={updateProduct}
                              disabled={editProductSaving || !editProductForm.name || !editProductForm.monthlyPrice}
                              className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50"
                            >
                              {editProductSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            </button>
                            <button
                              title="Cancel"
                              onClick={() => setEditingProductId(null)}
                              className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
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
                            p.type === "HOSTING" ? "bg-blue-100 text-blue-700" :
                            p.type === "MAIL" ? "bg-orange-100 text-orange-700" :
                            p.type === "SSL" ? "bg-green-100 text-green-700" :
                            "bg-purple-100 text-purple-700"
                          }`}>
                            {p.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">R{Number(p.monthlyPrice).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">R{Number(p.setupFee).toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-500">{p.pleskPlanName || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            title="Edit product"
                            onClick={() => startEditingProduct(p)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                          >
                            <Edit3 size={14} />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No products yet</td>
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
