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
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
        >
          <Plus size={16} />
          Add App
        </button>
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
                  <input
                    type="text"
                    value={formData.bundleId}
                    onChange={(e) => setFormData({ ...formData, bundleId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                    placeholder="com.example.app"
                  />
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
