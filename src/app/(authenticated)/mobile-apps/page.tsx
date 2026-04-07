"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import {
  Smartphone,
  Plus,
  Search,
  RefreshCw,
  Loader2,
  Trash2,
  Edit2,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
  Download,
  AlertCircle,
  Star,
  Bug,
  ShieldCheck,
  Package,
  CreditCard,
  Gamepad2,
  Tags,
  MessageSquare,
} from "lucide-react";

interface Customer {
  id: string;
  company: string;
}

interface MobileApp {
  id: string;
  name: string;
  bundleId: string;
  platform: "GOOGLE_PLAY" | "APPLE";
  storeUrl: string | null;
  packageName: string | null;
  appleId: string | null;
  iconUrl: string | null;
  isActive: boolean;
  customer: { id: string; company: string };
  _count: { stats: number; builds: number };
}

interface AppBuild {
  id: string;
  version: string;
  buildNumber: string;
  status: string;
  trackOrChannel: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  releasedAt: string | null;
  releaseNotes: string | null;
  rejectionReason: string | null;
  notifiedAt: string | null;
  createdAt: string;
}

export default function MobileAppsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [apps, setApps] = useState<MobileApp[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingApp, setEditingApp] = useState<MobileApp | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    bundleId: "",
    platform: "GOOGLE_PLAY" as "GOOGLE_PLAY" | "APPLE",
    storeUrl: "",
    packageName: "",
    appleId: "",
    iconUrl: "",
    customerId: "",
  });

  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [builds, setBuilds] = useState<Record<string, AppBuild[]>>({});
  const [loadingBuilds, setLoadingBuilds] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Import from Play Store state
  const [showImport, setShowImport] = useState(false);
  const [importPackageNames, setImportPackageNames] = useState("");
  const [importCustomerId, setImportCustomerId] = useState("");
  const [importPreviewing, setImportPreviewing] = useState(false);
  const [importImporting, setImportImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ packageName: string; title: string; iconUrl?: string; storeUrl: string }[]>([]);
  const [importNotFound, setImportNotFound] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ created: string[]; skipped: string[]; errors: string[]; notFound: string[] } | null>(null);
  const [importError, setImportError] = useState("");

  // Auto-fetch from Play Store for Add App form
  const [fetchingPackage, setFetchingPackage] = useState(false);

  // Detail tabs (new API panels)
  type DetailTab = "builds" | "reporting" | "reviews" | "products" | "subscriptions" | "integrity" | "games" | "grouping";
  const [activeTab, setActiveTab] = useState<DetailTab>("builds");
  const [tabData, setTabData] = useState<Record<string, unknown>>({});
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState("");

  // Integrity check form
  const [integrityToken, setIntegrityToken] = useState("");
  const [integrityPkg, setIntegrityPkg] = useState("");
  const [integrityResult, setIntegrityResult] = useState<Record<string, unknown> | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);

  // Games config form
  const [gamesAppId, setGamesAppId] = useState("");

  // Grouping form
  const [groupingPkg, setGroupingPkg] = useState("");
  const [groupingToken, setGroupingToken] = useState("");
  const [groupingTag, setGroupingTag] = useState("");
  const [groupingValue, setGroupingValue] = useState("");

  const loadApps = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (platformFilter) params.set("platform", platformFilter);
    if (customerFilter) params.set("customerId", customerFilter);
    try {
      const res = await fetch(`/api/mobile-apps?${params}`);
      if (res.ok) setApps(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, platformFilter, customerFilter]);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/customers?limit=500");
      if (res.ok) {
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : data.customers || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    startTransition(() => {
      loadApps();
      if (isAdmin) loadCustomers();
    });
  }, [loadApps, loadCustomers, isAdmin]);

  async function loadBuilds(appId: string) {
    setLoadingBuilds(appId);
    try {
      const res = await fetch(`/api/mobile-apps/${appId}/builds`);
      if (res.ok) {
        const data = await res.json();
        setBuilds((prev) => ({ ...prev, [appId]: data }));
      }
    } catch { /* ignore */ }
    setLoadingBuilds(null);
  }

  function toggleExpand(appId: string) {
    if (expandedApp === appId) {
      setExpandedApp(null);
    } else {
      setExpandedApp(appId);
      setActiveTab("builds");
      setTabData({});
      setTabError("");
      if (!builds[appId]) loadBuilds(appId);
    }
  }

  function switchTab(appId: string, tab: DetailTab, app: MobileApp) {
    setActiveTab(tab);
    setTabData({});
    setTabError("");
    setIntegrityResult(null);
    if (tab === "builds") {
      if (!builds[appId]) loadBuilds(appId);
    } else if (["reporting", "reviews", "products", "subscriptions"].includes(tab)) {
      loadTabData(appId, tab);
    }
    if (tab === "integrity") {
      setIntegrityPkg(app.packageName || app.bundleId);
    }
    if (tab === "grouping") {
      setGroupingPkg(app.packageName || app.bundleId);
    }
  }

  async function handleSync(appId: string) {
    setSyncing(appId);
    try {
      const res = await fetch(`/api/mobile-apps/${appId}/sync`, { method: "POST" });
      if (res.ok) {
        await loadBuilds(appId);
      }
    } catch { /* ignore */ }
    setSyncing(null);
  }

  function openCreate() {
    setEditingApp(null);
    setFormData({ name: "", bundleId: "", platform: "GOOGLE_PLAY", storeUrl: "", packageName: "", appleId: "", iconUrl: "", customerId: "" });
    setShowForm(true);
  }

  function openEdit(app: MobileApp) {
    setEditingApp(app);
    setFormData({
      name: app.name,
      bundleId: app.bundleId,
      platform: app.platform,
      storeUrl: app.storeUrl || "",
      packageName: app.packageName || "",
      appleId: app.appleId || "",
      iconUrl: app.iconUrl || "",
      customerId: app.customer.id,
    });
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingApp ? `/api/mobile-apps/${editingApp.id}` : "/api/mobile-apps";
      const method = editingApp ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowForm(false);
        loadApps();
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(appId: string) {
    if (!confirm("Delete this app and all its statistics/build history?")) return;
    try {
      const res = await fetch(`/api/mobile-apps/${appId}`, { method: "DELETE" });
      if (res.ok) loadApps();
    } catch { /* ignore */ }
  }

  // ─── Import from Play Store ─────────────────────────

  function openImport() {
    setImportPackageNames("");
    setImportCustomerId("");
    setImportPreview([]);
    setImportNotFound([]);
    setImportResult(null);
    setImportError("");
    setShowImport(true);
  }

  async function handleImportPreview() {
    const names = importPackageNames
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    if (names.length === 0) {
      setImportError("Enter at least one package name");
      return;
    }

    setImportPreviewing(true);
    setImportError("");
    setImportPreview([]);
    setImportNotFound([]);
    setImportResult(null);

    try {
      const res = await fetch("/api/mobile-apps/import-playstore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageNames: names, action: "preview" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Failed to fetch from Play Store");
      } else {
        setImportPreview(data.apps || []);
        setImportNotFound(data.notFound || []);
      }
    } catch {
      setImportError("Network error");
    }
    setImportPreviewing(false);
  }

  async function handleImportConfirm() {
    if (!importCustomerId) {
      setImportError("Select a customer");
      return;
    }

    const names = importPreview.map((a) => a.packageName);
    if (names.length === 0) {
      setImportError("No apps to import");
      return;
    }

    setImportImporting(true);
    setImportError("");

    try {
      const res = await fetch("/api/mobile-apps/import-playstore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageNames: names,
          customerId: importCustomerId,
          action: "import",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Import failed");
      } else {
        setImportResult(data);
        loadApps();
      }
    } catch {
      setImportError("Network error");
    }
    setImportImporting(false);
  }

  // ─── Auto-fetch from Play Store ─────────────────────

  async function autoFetchPackage(packageName: string) {
    if (!packageName || packageName.length < 3 || formData.platform !== "GOOGLE_PLAY") return;
    setFetchingPackage(true);
    try {
      const res = await fetch(`/api/mobile-apps/import-playstore?packageName=${encodeURIComponent(packageName)}`);
      if (res.ok) {
        const data = await res.json();
        setFormData((prev) => ({
          ...prev,
          name: data.title || prev.name,
          storeUrl: data.storeUrl || prev.storeUrl,
          packageName: data.packageName || prev.packageName,
          iconUrl: data.iconUrl || prev.iconUrl,
        }));
      }
    } catch { /* ignore */ }
    setFetchingPackage(false);
  }

  async function loadTabData(appId: string, tab: DetailTab) {
    setTabLoading(true);
    setTabError("");
    setTabData({});
    try {
      let res: Response;
      switch (tab) {
        case "reporting":
          res = await fetch(`/api/mobile-apps/${appId}/reporting?type=overview`);
          break;
        case "reviews":
          res = await fetch(`/api/mobile-apps/${appId}/reviews?maxResults=20`);
          break;
        case "products":
          res = await fetch(`/api/mobile-apps/${appId}/products`);
          break;
        case "subscriptions":
          res = await fetch(`/api/mobile-apps/${appId}/subscriptions`);
          break;
        default:
          setTabLoading(false);
          return;
      }
      if (res.ok) {
        setTabData(await res.json());
      } else {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setTabError(err.error || "Request failed");
      }
    } catch {
      setTabError("Network error");
    }
    setTabLoading(false);
  }

  async function handleIntegrityCheck() {
    if (!integrityPkg || !integrityToken) return;
    setIntegrityLoading(true);
    setIntegrityResult(null);
    setTabError("");
    try {
      const res = await fetch("/api/mobile-apps/integrity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageName: integrityPkg, integrityToken }),
      });
      const data = await res.json();
      if (res.ok) {
        setIntegrityResult(data);
      } else {
        setTabError(data.error || "Verification failed");
      }
    } catch {
      setTabError("Network error");
    }
    setIntegrityLoading(false);
  }

  async function loadGamesData(applicationId: string) {
    setTabLoading(true);
    setTabError("");
    setTabData({});
    try {
      const res = await fetch(`/api/mobile-apps/games?applicationId=${encodeURIComponent(applicationId)}`);
      if (res.ok) {
        setTabData(await res.json());
      } else {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setTabError(err.error || "Failed to load game data");
      }
    } catch {
      setTabError("Network error");
    }
    setTabLoading(false);
  }

  async function loadGroupingTags() {
    if (!groupingPkg || !groupingToken) return;
    setTabLoading(true);
    setTabError("");
    setTabData({});
    try {
      const res = await fetch(`/api/mobile-apps/grouping?appPackage=${encodeURIComponent(groupingPkg)}&token=${encodeURIComponent(groupingToken)}`);
      if (res.ok) {
        setTabData(await res.json());
      } else {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setTabError(err.error || "Failed to load tags");
      }
    } catch {
      setTabError("Network error");
    }
    setTabLoading(false);
  }

  async function handleGroupingAction(action: "verify" | "tag") {
    setTabLoading(true);
    setTabError("");
    try {
      const res = await fetch("/api/mobile-apps/grouping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          appPackage: groupingPkg,
          token: groupingToken,
          ...(action === "tag" ? { tag: groupingTag, value: groupingValue } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTabData(data);
      } else {
        setTabError(data.error || "Action failed");
      }
    } catch {
      setTabError("Network error");
    }
    setTabLoading(false);
  }

  async function handleGameReset(action: "resetAchievements" | "resetEvents" | "resetLeaderboard", leaderboardId?: string) {
    if (!confirm(`Are you sure you want to ${action.replace("reset", "reset ")}? This cannot be undone.`)) return;
    setTabLoading(true);
    setTabError("");
    try {
      const res = await fetch("/api/mobile-apps/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, leaderboardId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTabError(data.error || "Reset failed");
      }
    } catch {
      setTabError("Network error");
    }
    setTabLoading(false);
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-500 dark:text-slate-400">Admin access required.</p>
      </div>
    );
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "RELEASED": return <CheckCircle2 size={14} className="text-green-500" />;
      case "APPROVED": return <CheckCircle2 size={14} className="text-blue-500" />;
      case "REJECTED": return <XCircle size={14} className="text-red-500" />;
      case "IN_REVIEW": return <Clock size={14} className="text-orange-500" />;
      case "SUBMITTED": return <Upload size={14} className="text-slate-400" />;
      default: return <Clock size={14} className="text-slate-400" />;
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      RELEASED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      APPROVED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      IN_REVIEW: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      SUBMITTED: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.SUBMITTED}`}>
        {statusIcon(status)}
        {status.replace("_", " ")}
      </span>
    );
  };

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Smartphone className="text-blue-600" size={28} />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Mobile Apps</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openImport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
          >
            <Download size={16} />
            Import from Play Store
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            <Plus size={16} />
            Add App
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
          title="Filter by platform"
        >
          <option value="">All Platforms</option>
          <option value="GOOGLE_PLAY">Google Play</option>
          <option value="APPLE">Apple</option>
        </select>
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
          title="Filter by customer"
        >
          <option value="">All Customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.company}</option>
          ))}
        </select>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {editingApp ? "Edit App" : "Add Mobile App"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">App Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                  placeholder="My Awesome App"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Bundle ID *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.bundleId}
                      onChange={(e) => setFormData({ ...formData, bundleId: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                      placeholder="com.example.app"
                    />
                    {formData.platform === "GOOGLE_PLAY" && !editingApp && (
                      <button
                        type="button"
                        onClick={() => autoFetchPackage(formData.bundleId)}
                        disabled={fetchingPackage || !formData.bundleId}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 text-xs flex items-center gap-1"
                        title="Fetch app info from Play Store"
                      >
                        {fetchingPackage ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Fetch
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Platform *</label>
                  <select
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value as "GOOGLE_PLAY" | "APPLE" })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                    title="Platform"
                  >
                    <option value="GOOGLE_PLAY">Google Play</option>
                    <option value="APPLE">Apple</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Customer *</label>
                <select
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                  title="Customer"
                >
                  <option value="">Select customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.company}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Store URL</label>
                <input
                  type="url"
                  value={formData.storeUrl}
                  onChange={(e) => setFormData({ ...formData, storeUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                  placeholder="https://play.google.com/store/apps/details?id=..."
                />
              </div>
              {formData.platform === "GOOGLE_PLAY" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Package Name</label>
                  <input
                    type="text"
                    value={formData.packageName}
                    onChange={(e) => setFormData({ ...formData, packageName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                    placeholder="com.example.app (defaults to Bundle ID)"
                  />
                </div>
              )}
              {formData.platform === "APPLE" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Apple App ID</label>
                  <input
                    type="text"
                    value={formData.appleId}
                    onChange={(e) => setFormData({ ...formData, appleId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                    placeholder="123456789"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Icon URL</label>
                <input
                  type="url"
                  value={formData.iconUrl}
                  onChange={(e) => setFormData({ ...formData, iconUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name || !formData.bundleId || !formData.customerId}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingApp ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import from Play Store Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              Import from Google Play Store
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Enter package names to fetch app details from your Play Store developer account.
            </p>

            {importError && (
              <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                <AlertCircle size={16} />
                {importError}
              </div>
            )}

            {importResult ? (
              /* Import Results */
              <div className="space-y-3">
                {importResult.created.length > 0 && (
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      <CheckCircle2 size={14} className="inline mr-1" />
                      Imported {importResult.created.length} app(s):
                    </p>
                    <ul className="text-xs text-green-600 dark:text-green-500 mt-1 ml-5 list-disc">
                      {importResult.created.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  </div>
                )}
                {importResult.skipped.length > 0 && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                      Skipped {importResult.skipped.length} (already exist):
                    </p>
                    <ul className="text-xs text-yellow-600 dark:text-yellow-500 mt-1 ml-5 list-disc">
                      {importResult.skipped.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  </div>
                )}
                {importResult.notFound.length > 0 && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Not found: {importResult.notFound.join(", ")}
                    </p>
                  </div>
                )}
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => setShowImport(false)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : importPreview.length > 0 ? (
              /* Preview fetched apps */
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Assign to Customer *</label>
                  <select
                    value={importCustomerId}
                    onChange={(e) => setImportCustomerId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                    title="Customer"
                  >
                    <option value="">Select customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.company}</option>
                    ))}
                  </select>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-gray-800">
                      <tr className="text-left text-slate-600 dark:text-slate-400">
                        <th className="px-3 py-2 font-medium">Icon</th>
                        <th className="px-3 py-2 font-medium">App Name</th>
                        <th className="px-3 py-2 font-medium">Package Name</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {importPreview.map((app) => (
                        <tr key={app.packageName} className="text-slate-700 dark:text-slate-300">
                          <td className="px-3 py-2">
                            {app.iconUrl ? (
                              <Image src={app.iconUrl} alt="" width={32} height={32} className="w-8 h-8 rounded-lg" unoptimized />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Smartphone size={16} className="text-slate-400" />
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium">{app.title}</td>
                          <td className="px-3 py-2 text-xs font-mono text-slate-500">{app.packageName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {importNotFound.length > 0 && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-700 dark:text-yellow-400">
                      <AlertCircle size={14} className="inline mr-1" />
                      Not found or not accessible: {importNotFound.join(", ")}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => { setImportPreview([]); setImportNotFound([]); }}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleImportConfirm}
                    disabled={importImporting || !importCustomerId}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 text-sm"
                  >
                    {importImporting && <Loader2 size={14} className="animate-spin" />}
                    Import {importPreview.length} App(s)
                  </button>
                </div>
              </div>
            ) : (
              /* Input package names */
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Package Names (one per line)
                  </label>
                  <textarea
                    value={importPackageNames}
                    onChange={(e) => setImportPackageNames(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white font-mono"
                    placeholder={"com.example.app1\ncom.example.app2\ncom.example.app3"}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Enter the Android package names from your Google Play Console. Separate with new lines or commas.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowImport(false)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImportPreview}
                    disabled={importPreviewing || !importPackageNames.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 text-sm"
                  >
                    {importPreviewing && <Loader2 size={14} className="animate-spin" />}
                    <Search size={14} />
                    Fetch from Play Store
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* App List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="animate-spin text-blue-500" size={24} />
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-16 text-slate-500 dark:text-slate-400">
          <Smartphone size={48} className="mx-auto mb-4 opacity-30" />
          <p>No mobile apps registered yet.</p>
          <p className="text-sm mt-1">Click &quot;Add App&quot; to register your first app.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <div key={app.id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="flex items-center gap-4 p-4">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {app.iconUrl ? (
                    <Image src={app.iconUrl} alt="" width={48} height={48} className="w-12 h-12 object-cover rounded-xl" unoptimized />
                  ) : (
                    <Smartphone size={24} className="text-slate-400" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate">{app.name}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      app.platform === "GOOGLE_PLAY"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                    }`}>
                      {app.platform === "GOOGLE_PLAY" ? "Android" : "iOS"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{app.bundleId}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{app.customer.company}</p>
                </div>

                {/* Stats counts */}
                <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1" title="Statistics entries">
                    <BarChart3 size={14} />
                    <span>{app._count.stats}</span>
                  </div>
                  <div className="flex items-center gap-1" title="Builds">
                    <Upload size={14} />
                    <span>{app._count.builds}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {app.storeUrl && (
                    <a
                      href={app.storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-slate-400 hover:text-blue-500 transition"
                      title="Open in store"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                  <button
                    onClick={() => handleSync(app.id)}
                    disabled={syncing === app.id}
                    className="p-2 text-slate-400 hover:text-green-500 transition disabled:opacity-50"
                    title="Sync from store"
                  >
                    {syncing === app.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  </button>
                  <button onClick={() => openEdit(app)} className="p-2 text-slate-400 hover:text-blue-500 transition" title="Edit">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(app.id)} className="p-2 text-slate-400 hover:text-red-500 transition" title="Delete">
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => toggleExpand(app.id)}
                    className="p-2 text-slate-400 hover:text-slate-600 transition"
                    title="Toggle builds"
                  >
                    {expandedApp === app.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              {/* Expanded: Tabbed Detail View */}
              {expandedApp === app.id && (
                <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-gray-800/50">
                  {/* Tab Bar */}
                  <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-700 px-4">
                    {([
                      { key: "builds", label: "Builds", icon: Upload },
                      ...(app.platform === "GOOGLE_PLAY" ? [
                        { key: "reporting", label: "Vitals", icon: Bug },
                        { key: "reviews", label: "Reviews", icon: MessageSquare },
                        { key: "products", label: "Products", icon: Package },
                        { key: "subscriptions", label: "Subscriptions", icon: CreditCard },
                        { key: "integrity", label: "Integrity", icon: ShieldCheck },
                        { key: "games", label: "Games", icon: Gamepad2 },
                        { key: "grouping", label: "Grouping", icon: Tags },
                      ] : []),
                    ] as { key: DetailTab; label: string; icon: typeof Upload }[]).map((t) => (
                      <button
                        key={t.key}
                        onClick={() => switchTab(app.id, t.key, app)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition ${
                          activeTab === t.key
                            ? "border-blue-500 text-blue-600 dark:text-blue-400"
                            : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                        }`}
                      >
                        <t.icon size={14} />
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="p-4">
                    {/* Tab Error */}
                    {tabError && (
                      <div className="flex items-center gap-2 p-3 mb-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                        <AlertCircle size={14} />
                        {tabError}
                      </div>
                    )}

                    {/* BUILDS TAB */}
                    {activeTab === "builds" && (
                      <>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Build History</h4>
                        {loadingBuilds === app.id ? (
                          <div className="text-center py-4">
                            <Loader2 size={16} className="animate-spin text-slate-400 mx-auto" />
                          </div>
                        ) : (builds[app.id] || []).length === 0 ? (
                          <p className="text-sm text-slate-400 py-2">No builds recorded. Click sync to fetch from the store.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-slate-500 dark:text-slate-400">
                                  <th className="pb-2 pr-4 font-medium">Version</th>
                                  <th className="pb-2 pr-4 font-medium">Build</th>
                                  <th className="pb-2 pr-4 font-medium">Status</th>
                                  <th className="pb-2 pr-4 font-medium">Track</th>
                                  <th className="pb-2 pr-4 font-medium">Submitted</th>
                                  <th className="pb-2 pr-4 font-medium">Released</th>
                                  <th className="pb-2 font-medium">Notified</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {(builds[app.id] || []).map((build) => (
                                  <tr key={build.id} className="text-slate-600 dark:text-slate-300">
                                    <td className="py-2 pr-4 font-medium">{build.version}</td>
                                    <td className="py-2 pr-4 font-mono text-xs">{build.buildNumber}</td>
                                    <td className="py-2 pr-4">{statusBadge(build.status)}</td>
                                    <td className="py-2 pr-4 text-xs">{build.trackOrChannel || "—"}</td>
                                    <td className="py-2 pr-4 text-xs">
                                      {build.submittedAt ? new Date(build.submittedAt).toLocaleDateString() : "—"}
                                    </td>
                                    <td className="py-2 pr-4 text-xs">
                                      {build.releasedAt ? new Date(build.releasedAt).toLocaleDateString() : "—"}
                                    </td>
                                    <td className="py-2 text-xs">
                                      {build.notifiedAt ? (
                                        <span className="text-green-500" title={new Date(build.notifiedAt).toLocaleString()}>Sent</span>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}

                    {/* REPORTING / VITALS TAB */}
                    {activeTab === "reporting" && (
                      <>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                          <Bug size={16} />
                          App Vitals (Developer Reporting API)
                        </h4>
                        {tabLoading ? (
                          <div className="text-center py-8"><Loader2 size={20} className="animate-spin text-slate-400 mx-auto" /></div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Crash Rate */}
                            <div className="bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                              <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Crash Rate</h5>
                              {((tabData as Record<string, { rows?: unknown[] }>)?.crashes?.rows || []).length === 0 ? (
                                <p className="text-sm text-slate-400">No crash data available</p>
                              ) : (
                                <div className="space-y-1">
                                  {((tabData as Record<string, { rows: { metrics: Record<string, { decimalValue?: { value: string } }> }[] }>)?.crashes?.rows || []).slice(0, 5).map((row, i) => (
                                    <div key={i} className="flex items-center justify-between text-sm">
                                      <span className="text-slate-600 dark:text-slate-300">
                                        API {row.metrics?.apiLevel?.decimalValue?.value || "—"}
                                      </span>
                                      <span className="font-mono text-red-600 dark:text-red-400">
                                        {row.metrics?.crashRate?.decimalValue?.value
                                          ? `${(parseFloat(row.metrics.crashRate.decimalValue.value) * 100).toFixed(3)}%`
                                          : "—"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* ANR Rate */}
                            <div className="bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                              <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">ANR Rate</h5>
                              {((tabData as Record<string, { rows?: unknown[] }>)?.anrs?.rows || []).length === 0 ? (
                                <p className="text-sm text-slate-400">No ANR data available</p>
                              ) : (
                                <div className="space-y-1">
                                  {((tabData as Record<string, { rows: { metrics: Record<string, { decimalValue?: { value: string } }> }[] }>)?.anrs?.rows || []).slice(0, 5).map((row, i) => (
                                    <div key={i} className="flex items-center justify-between text-sm">
                                      <span className="text-slate-600 dark:text-slate-300">
                                        API {row.metrics?.apiLevel?.decimalValue?.value || "—"}
                                      </span>
                                      <span className="font-mono text-orange-600 dark:text-orange-400">
                                        {row.metrics?.anrRate?.decimalValue?.value
                                          ? `${(parseFloat(row.metrics.anrRate.decimalValue.value) * 100).toFixed(3)}%`
                                          : "—"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Excessive Wakeups */}
                            <div className="bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                              <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Excessive Wakeups</h5>
                              {((tabData as Record<string, { rows?: unknown[] }>)?.wakeups?.rows || []).length === 0 ? (
                                <p className="text-sm text-slate-400">No wakeup data available</p>
                              ) : (
                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                  {((tabData as Record<string, { rows: unknown[] }>)?.wakeups?.rows || []).length} data points
                                </p>
                              )}
                            </div>
                            {/* Stuck Wakelocks */}
                            <div className="bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                              <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Stuck Wakelocks</h5>
                              {((tabData as Record<string, { rows?: unknown[] }>)?.wakelocks?.rows || []).length === 0 ? (
                                <p className="text-sm text-slate-400">No wakelock data available</p>
                              ) : (
                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                  {((tabData as Record<string, { rows: unknown[] }>)?.wakelocks?.rows || []).length} data points
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* REVIEWS TAB */}
                    {activeTab === "reviews" && (
                      <>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                          <MessageSquare size={16} />
                          Play Store Reviews
                        </h4>
                        {tabLoading ? (
                          <div className="text-center py-8"><Loader2 size={20} className="animate-spin text-slate-400 mx-auto" /></div>
                        ) : ((tabData as { reviews?: unknown[] })?.reviews || []).length === 0 ? (
                          <p className="text-sm text-slate-400 py-2">No reviews found</p>
                        ) : (
                          <div className="space-y-3">
                            {((tabData as { reviews: { reviewId: string; authorName: string; comments: { userComment?: { text: string; starRating: number; lastModified: { seconds: string } } }[] }[] }).reviews || []).map((review) => {
                              const uc = review.comments?.[0]?.userComment;
                              if (!uc) return null;
                              return (
                                <div key={review.reviewId} className="bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{review.authorName || "Anonymous"}</span>
                                    <div className="flex items-center gap-0.5">
                                      {Array.from({ length: 5 }, (_, i) => (
                                        <Star key={i} size={12} className={i < uc.starRating ? "text-yellow-400 fill-yellow-400" : "text-slate-300 dark:text-slate-600"} />
                                      ))}
                                    </div>
                                  </div>
                                  <p className="text-sm text-slate-600 dark:text-slate-400">{uc.text}</p>
                                  <p className="text-xs text-slate-400 mt-1">
                                    {uc.lastModified?.seconds ? new Date(parseInt(uc.lastModified.seconds) * 1000).toLocaleDateString() : ""}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}

                    {/* IN-APP PRODUCTS TAB */}
                    {activeTab === "products" && (
                      <>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                          <Package size={16} />
                          In-App Products
                        </h4>
                        {tabLoading ? (
                          <div className="text-center py-8"><Loader2 size={20} className="animate-spin text-slate-400 mx-auto" /></div>
                        ) : ((tabData as { inappproduct?: unknown[] })?.inappproduct || []).length === 0 ? (
                          <p className="text-sm text-slate-400 py-2">No in-app products found</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-slate-500 dark:text-slate-400">
                                  <th className="pb-2 pr-4 font-medium">SKU</th>
                                  <th className="pb-2 pr-4 font-medium">Title</th>
                                  <th className="pb-2 pr-4 font-medium">Type</th>
                                  <th className="pb-2 pr-4 font-medium">Price</th>
                                  <th className="pb-2 font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {((tabData as { inappproduct: { sku: string; purchaseType: string; status: string; defaultPrice?: { priceMicros: string; currency: string }; listings?: Record<string, { title: string }> }[] }).inappproduct || []).map((p) => {
                                  const listing = Object.values(p.listings || {})[0];
                                  const price = p.defaultPrice ? (parseInt(p.defaultPrice.priceMicros) / 1_000_000).toFixed(2) : "—";
                                  return (
                                    <tr key={p.sku} className="text-slate-600 dark:text-slate-300">
                                      <td className="py-2 pr-4 font-mono text-xs">{p.sku}</td>
                                      <td className="py-2 pr-4">{listing?.title || "—"}</td>
                                      <td className="py-2 pr-4">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                          p.purchaseType === "subscription"
                                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                        }`}>
                                          {p.purchaseType === "subscription" ? "Subscription" : "Managed"}
                                        </span>
                                      </td>
                                      <td className="py-2 pr-4">{p.defaultPrice?.currency} {price}</td>
                                      <td className="py-2">{p.status}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}

                    {/* SUBSCRIPTIONS TAB */}
                    {activeTab === "subscriptions" && (
                      <>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                          <CreditCard size={16} />
                          Subscriptions
                        </h4>
                        {tabLoading ? (
                          <div className="text-center py-8"><Loader2 size={20} className="animate-spin text-slate-400 mx-auto" /></div>
                        ) : ((tabData as { subscriptions?: unknown[] })?.subscriptions || []).length === 0 ? (
                          <p className="text-sm text-slate-400 py-2">No subscriptions found</p>
                        ) : (
                          <div className="space-y-3">
                            {((tabData as { subscriptions: { productId: string; basePlans: { basePlanId: string; state: string; renewalType: string; autoRenewingBasePlanType?: { billingPeriodDuration: string }; prices?: { currencyCode: string; priceMicros: string }[] }[]; listings?: { languageCode: string; title: string; benefits?: string[] }[] }[] }).subscriptions || []).map((sub) => {
                              const listing = sub.listings?.[0];
                              return (
                                <div key={sub.productId} className="bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{listing?.title || sub.productId}</h5>
                                      <p className="text-xs text-slate-400 font-mono">{sub.productId}</p>
                                    </div>
                                  </div>
                                  {sub.basePlans?.map((plan) => {
                                    const price = plan.prices?.[0];
                                    return (
                                      <div key={plan.basePlanId} className="flex items-center gap-3 mt-2 text-sm">
                                        <span className="font-mono text-xs text-slate-500">{plan.basePlanId}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                                          plan.state === "ACTIVE" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                        }`}>{plan.state}</span>
                                        <span className="text-slate-600 dark:text-slate-400">
                                          {plan.autoRenewingBasePlanType?.billingPeriodDuration || plan.renewalType}
                                        </span>
                                        {price && (
                                          <span className="font-medium">{price.currencyCode} {(parseInt(price.priceMicros) / 1_000_000).toFixed(2)}</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {listing?.benefits && listing.benefits.length > 0 && (
                                    <ul className="mt-2 text-xs text-slate-500 dark:text-slate-400 list-disc list-inside">
                                      {listing.benefits.map((b, i) => <li key={i}>{b}</li>)}
                                    </ul>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}

                    {/* INTEGRITY TAB */}
                    {activeTab === "integrity" && (
                      <>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                          <ShieldCheck size={16} />
                          Play Integrity API
                        </h4>
                        <p className="text-xs text-slate-400 mb-4">Decode and verify integrity tokens sent from your Android app to check device &amp; app authenticity.</p>
                        <div className="space-y-3 max-w-xl">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Package Name</label>
                            <input
                              type="text"
                              value={integrityPkg}
                              onChange={(e) => setIntegrityPkg(e.target.value)}
                              placeholder="com.example.app"
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Integrity Token</label>
                            <textarea
                              value={integrityToken}
                              onChange={(e) => setIntegrityToken(e.target.value)}
                              rows={3}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white font-mono"
                              placeholder="Paste integrity token from your Android app..."
                            />
                          </div>
                          <button
                            onClick={handleIntegrityCheck}
                            disabled={integrityLoading || !integrityPkg || !integrityToken}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                          >
                            {integrityLoading && <Loader2 size={14} className="animate-spin" />}
                            <ShieldCheck size={14} />
                            Verify Token
                          </button>
                          {integrityResult && (
                            <div className="mt-3 bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                              <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Verdict</h5>
                              {(() => {
                                const payload = (integrityResult as { tokenPayloadExternal?: Record<string, unknown> })?.tokenPayloadExternal;
                                if (!payload) return <p className="text-sm text-slate-400">No payload data</p>;
                                return (
                                  <div className="space-y-2 text-sm">
                                    {/* App Integrity */}
                                    {(payload.appIntegrity as { appRecognitionVerdict?: string; packageName?: string; versionCode?: string }) && (
                                      <div>
                                        <span className="font-medium text-slate-700 dark:text-slate-300">App: </span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                          (payload.appIntegrity as { appRecognitionVerdict: string }).appRecognitionVerdict === "PLAY_RECOGNIZED"
                                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                        }`}>
                                          {(payload.appIntegrity as { appRecognitionVerdict: string }).appRecognitionVerdict}
                                        </span>
                                        <span className="text-xs text-slate-400 ml-2">
                                          v{(payload.appIntegrity as { versionCode?: string }).versionCode}
                                        </span>
                                      </div>
                                    )}
                                    {/* Device Integrity */}
                                    {(payload.deviceIntegrity as { deviceRecognitionVerdict?: string[] }) && (
                                      <div>
                                        <span className="font-medium text-slate-700 dark:text-slate-300">Device: </span>
                                        {((payload.deviceIntegrity as { deviceRecognitionVerdict: string[] }).deviceRecognitionVerdict || []).map((v) => (
                                          <span key={v} className={`px-2 py-0.5 rounded-full text-xs font-medium mr-1 ${
                                            v.includes("MEETS") ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                          }`}>{v}</span>
                                        ))}
                                      </div>
                                    )}
                                    {/* Account */}
                                    {(payload.accountDetails as { appLicensingVerdict?: string }) && (
                                      <div>
                                        <span className="font-medium text-slate-700 dark:text-slate-300">License: </span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                          (payload.accountDetails as { appLicensingVerdict: string }).appLicensingVerdict === "LICENSED"
                                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                        }`}>
                                          {(payload.accountDetails as { appLicensingVerdict: string }).appLicensingVerdict}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* GAMES TAB */}
                    {activeTab === "games" && (
                      <>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                          <Gamepad2 size={16} />
                          Games Services
                        </h4>
                        <p className="text-xs text-slate-400 mb-3">View achievement &amp; leaderboard configurations and manage game data.</p>
                        <div className="flex items-center gap-2 mb-4">
                          <input
                            type="text"
                            value={gamesAppId}
                            onChange={(e) => setGamesAppId(e.target.value)}
                            placeholder="Games Application ID"
                            className="flex-1 max-w-xs px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                          />
                          <button
                            onClick={() => gamesAppId && loadGamesData(gamesAppId)}
                            disabled={tabLoading || !gamesAppId}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                          >
                            {tabLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                            Load
                          </button>
                        </div>

                        {tabLoading ? (
                          <div className="text-center py-8"><Loader2 size={20} className="animate-spin text-slate-400 mx-auto" /></div>
                        ) : (
                          <div className="space-y-4">
                            {/* Achievements */}
                            {((tabData as { achievements?: unknown[] })?.achievements || []).length > 0 && (
                              <div>
                                <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">
                                  Achievements ({((tabData as { achievements: unknown[] }).achievements).length})
                                </h5>
                                <div className="space-y-2">
                                  {((tabData as { achievements: { id: string; achievementType: string; initialState: string; stepsToUnlock?: number; published?: { name?: { translations?: { locale: string; value: string }[] }; pointValue?: number } }[] }).achievements || []).map((a) => {
                                    const name = a.published?.name?.translations?.[0]?.value || a.id;
                                    return (
                                      <div key={a.id} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm">
                                        <div>
                                          <span className="font-medium text-slate-700 dark:text-slate-300">{name}</span>
                                          <span className="text-xs text-slate-400 ml-2">{a.achievementType}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-slate-500">{a.published?.pointValue || 0} pts</span>
                                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                                            a.initialState === "REVEALED" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                            : a.initialState === "UNLOCKED" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                            : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                          }`}>{a.initialState}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Leaderboards */}
                            {((tabData as { leaderboards?: unknown[] })?.leaderboards || []).length > 0 && (
                              <div>
                                <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">
                                  Leaderboards ({((tabData as { leaderboards: unknown[] }).leaderboards).length})
                                </h5>
                                <div className="space-y-2">
                                  {((tabData as { leaderboards: { id: string; scoreOrder: string; published?: { name?: { translations?: { locale: string; value: string }[] } } }[] }).leaderboards || []).map((lb) => {
                                    const name = lb.published?.name?.translations?.[0]?.value || lb.id;
                                    return (
                                      <div key={lb.id} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-sm">
                                        <span className="font-medium text-slate-700 dark:text-slate-300">{name}</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-slate-500">{lb.scoreOrder}</span>
                                          <button
                                            onClick={() => lb.id && handleGameReset("resetLeaderboard", lb.id)}
                                            className="text-xs text-red-500 hover:text-red-700 transition"
                                          >
                                            Reset
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Management Actions */}
                            {Object.keys(tabData).length > 0 && (
                              <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                                <span className="text-xs text-slate-400">Management:</span>
                                <button
                                  onClick={() => handleGameReset("resetAchievements")}
                                  className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition"
                                >
                                  Reset All Achievements
                                </button>
                                <button
                                  onClick={() => handleGameReset("resetEvents")}
                                  className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition"
                                >
                                  Reset All Events
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* GROUPING TAB */}
                    {activeTab === "grouping" && (
                      <>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                          <Tags size={16} />
                          Play Grouping API
                        </h4>
                        <p className="text-xs text-slate-400 mb-4">Verify grouping tokens and manage user group tags.</p>
                        <div className="space-y-3 max-w-xl">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Package Name</label>
                              <input
                                type="text"
                                value={groupingPkg}
                                onChange={(e) => setGroupingPkg(e.target.value)}
                                placeholder="com.example.app"
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Token</label>
                              <input
                                type="text"
                                value={groupingToken}
                                onChange={(e) => setGroupingToken(e.target.value)}
                                placeholder="User grouping token"
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleGroupingAction("verify")}
                              disabled={tabLoading || !groupingPkg || !groupingToken}
                              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                            >
                              {tabLoading && <Loader2 size={14} className="animate-spin" />}
                              Verify Token
                            </button>
                            <button
                              onClick={loadGroupingTags}
                              disabled={tabLoading || !groupingPkg || !groupingToken}
                              className="flex items-center gap-2 px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition disabled:opacity-50 text-sm"
                            >
                              List Tags
                            </button>
                          </div>
                          <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                            <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Create/Update Tag</h5>
                            <div className="grid grid-cols-2 gap-3 mb-2">
                              <input
                                type="text"
                                value={groupingTag}
                                onChange={(e) => setGroupingTag(e.target.value)}
                                placeholder="Tag name"
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                              />
                              <input
                                type="text"
                                value={groupingValue}
                                onChange={(e) => setGroupingValue(e.target.value)}
                                placeholder="Tag value"
                                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                              />
                            </div>
                            <button
                              onClick={() => handleGroupingAction("tag")}
                              disabled={tabLoading || !groupingPkg || !groupingToken || !groupingTag || !groupingValue}
                              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 text-sm"
                            >
                              Save Tag
                            </button>
                          </div>
                          {/* Show tags result */}
                          {((tabData as { tags?: { tag: string; stringValue?: string; booleanValue?: boolean; int64Value?: string }[] })?.tags || []).length > 0 && (
                            <div className="mt-3">
                              <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Tags</h5>
                              <div className="space-y-1">
                                {((tabData as { tags: { tag: string; stringValue?: string; booleanValue?: boolean; int64Value?: string }[] }).tags).map((t) => (
                                  <div key={t.tag} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">
                                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{t.tag}</span>
                                    <span className="text-slate-500 dark:text-slate-400">{t.stringValue || t.int64Value || String(t.booleanValue ?? "")}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
