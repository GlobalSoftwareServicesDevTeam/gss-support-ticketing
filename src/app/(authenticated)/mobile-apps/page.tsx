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
      if (!builds[appId]) loadBuilds(appId);
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

              {/* Expanded: Build History */}
              {expandedApp === app.id && (
                <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-gray-800/50 p-4">
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
