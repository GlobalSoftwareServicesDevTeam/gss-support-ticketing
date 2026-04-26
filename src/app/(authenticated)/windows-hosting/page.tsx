
"use client";
import * as React from "react";

// ...existing code...
import { useSession } from "next-auth/react";
import {
  Monitor,
  Play,
  Square,
  RefreshCw,
  Loader2,
  Search,
  Globe,
  HardDrive,
  Link2,
  Unlink,
  AlertCircle,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Layers,
  ExternalLink,
  Users,
  Settings,
} from "lucide-react";

interface SiteBinding {
  protocol: string;
  binding_information: string;
  hostname?: string;
  port?: number;
  ip_address?: string;
}

interface IisSite {
  id: string;
  name: string;
  status: string;
  physicalPath: string;
  autoStart: boolean;
  bindings: SiteBinding[];
  hostname: string;
  port: number;
  protocol: string;
  dbId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  notes: string | null;
}

interface AppPool {
  id: string;
  name: string;
  status: string;
  pipeline_mode?: string;
  managed_runtime_version?: string;
  auto_start?: boolean;
}

interface Customer {
  id: string;
  company: string;
  contactPerson: string;
  emailAddress: string;
}

export default function IisManagerPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [sites, setSites] = React.useState<IisSite[]>([]);
  const [pools, setPools] = React.useState<AppPool[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingPools, setLoadingPools] = React.useState(false);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<"sites" | "pools">("sites");
  const [filter, setFilter] = React.useState<"all" | "linked" | "unlinked">("all");

  // Action states
  const [actionLoading, setActionLoading] = React.useState<Record<string, boolean>>({});

  // Link modal
  const [linkTarget, setLinkTarget] = React.useState<IisSite | null>(null);
  const [linkCustomerId, setLinkCustomerId] = React.useState("");
  const [linkNotes, setLinkNotes] = React.useState("");
  const [linking, setLinking] = React.useState(false);

  // Expanded site
  const [expandedSite, setExpandedSite] = React.useState<string | null>(null);

  const fetchSites = React.useCallback(async () => {
    try {
      const res = await fetch("/api/hosting/iis");
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load IIS sites");
        return;
      }
      const data = await res.json();
      setSites(data.sites || []);
    } catch {
      setError("Failed to load IIS sites");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPools = React.useCallback(async () => {
    setLoadingPools(true);
    try {
      const res = await fetch("/api/hosting/iis/pools");
      if (res.ok) {
        const data = await res.json();
        setPools(data.pools || []);
      }
    } finally {
      setLoadingPools(false);
    }
  }, []);

  const fetchCustomers = React.useCallback(async () => {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || data || []);
      }
    } catch {
      // non-critical
    }
  }, []);

  React.useEffect(() => {
    fetchSites();
    fetchCustomers();
  }, [fetchSites, fetchCustomers]);

  React.useEffect(() => {
    if (activeTab === "pools" && pools.length === 0) {
      fetchPools();
    }
  }, [activeTab, pools.length, fetchPools]);

  const handleSiteAction = async (siteId: string, siteName: string, action: "start" | "stop") => {
    setActionLoading((prev) => ({ ...prev, [siteId]: true }));
    setError("");
    try {
      const res = await fetch("/api/hosting/iis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, siteName, action }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || `Failed to ${action} site`);
      } else {
        // Update local state
        setSites((prev) =>
          prev.map((s) =>
            s.id === siteId ? { ...s, status: action === "start" ? "started" : "stopped" } : s
          )
        );
      }
    } catch {
      setError(`Failed to ${action} site`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [siteId]: false }));
    }
  };

  const handlePoolAction = async (poolId: string, poolName: string, action: "start" | "stop" | "recycle") => {
    setActionLoading((prev) => ({ ...prev, [poolId]: true }));
    try {
      const res = await fetch("/api/hosting/iis/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId, poolName, action }),
      });
      if (res.ok) {
        setPools((prev) =>
          prev.map((p) =>
            p.id === poolId
              ? { ...p, status: action === "stop" ? "stopped" : "started" }
              : p
          )
        );
      }
    } finally {
      setActionLoading((prev) => ({ ...prev, [poolId]: false }));
    }
  };

  const handleLinkSite = async () => {
    if (!linkTarget) return;
    setLinking(true);
    setError("");
    try {
      const res = await fetch("/api/hosting/iis/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iisSiteId: linkTarget.id,
          siteName: linkTarget.name,
          domain: linkTarget.hostname,
          physicalPath: linkTarget.physicalPath,
          customerId: linkCustomerId || null,
          notes: linkNotes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to link site");
        return;
      }
      setLinkTarget(null);
      setLinkCustomerId("");
      setLinkNotes("");
      fetchSites();
    } catch {
      setError("Failed to link site");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkSite = async (site: IisSite) => {
    setActionLoading((prev) => ({ ...prev, [`unlink-${site.id}`]: true }));
    try {
      await fetch(`/api/hosting/iis/link?iisSiteId=${encodeURIComponent(site.id)}`, {
        method: "DELETE",
      });
      fetchSites();
    } finally {
      setActionLoading((prev) => ({ ...prev, [`unlink-${site.id}`]: false }));
    }
  };

  const filteredSites = sites.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.hostname.toLowerCase().includes(search.toLowerCase()) ||
      (s.customerName || "").toLowerCase().includes(search.toLowerCase());
    if (filter === "linked") return matchesSearch && s.customerId;
    if (filter === "unlinked") return matchesSearch && !s.customerId;
    return matchesSearch;
  });

  const filteredPools = pools.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: sites.length,
    started: sites.filter((s) => s.status === "started").length,
    stopped: sites.filter((s) => s.status !== "started").length,
    linked: sites.filter((s) => s.customerId).length,
    unlinked: sites.filter((s) => !s.customerId).length,
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-500">Admin access required.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Monitor className="w-7 h-7" />
            IIS Server Manager
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage Windows IIS websites, application pools, and link sites to customer accounts
          </p>
        </div>
        <button
          onClick={() => { fetchSites(); if (activeTab === "pools") fetchPools(); }}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-red-700 dark:text-red-300 text-sm">{error}</span>
          <button onClick={() => setError("")} className="ml-auto">
            <X className="w-4 h-4 text-red-400" />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Sites", value: stats.total, color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" },
          { label: "Running", value: stats.started, color: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" },
          { label: "Stopped", value: stats.stopped, color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" },
          { label: "Linked", value: stats.linked, color: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300" },
          { label: "Unlinked", value: stats.unlinked, color: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-xs font-medium opacity-80">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("sites")}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition ${
            activeTab === "sites"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Globe className="w-4 h-4 inline mr-1" />
          Websites ({sites.length})
        </button>
        <button
          onClick={() => setActiveTab("pools")}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition ${
            activeTab === "pools"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Layers className="w-4 h-4 inline mr-1" />
          App Pools ({pools.length})
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={activeTab === "sites" ? "Search sites, domains, customers..." : "Search app pools..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          />
        </div>
        {activeTab === "sites" && (
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {(["all", "linked", "unlinked"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  filter === f
                    ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f === "all" ? "All" : f === "linked" ? "Linked" : "Unlinked"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sites List */}
      {activeTab === "sites" && (
        <div className="space-y-3">
          {filteredSites.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
              <Monitor className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                {sites.length === 0 ? "No IIS Sites Found" : "No matching sites"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {sites.length === 0
                  ? "Configure IIS API in System Settings, or no sites exist on the server."
                  : "Try a different search or filter."}
              </p>
            </div>
          ) : (
            filteredSites.map((site) => (
              <div
                key={site.id}
                className={`bg-white dark:bg-gray-800 rounded-xl border ${
                  site.status === "started"
                    ? "border-gray-200 dark:border-gray-700"
                    : "border-red-200 dark:border-red-900"
                } hover:shadow-md transition-shadow`}
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedSite(expandedSite === site.id ? null : site.id)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedSite === site.id ? (
                        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          site.status === "started"
                            ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                            : "bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400"
                        }`}
                      >
                        <Globe className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white truncate">
                            {site.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              site.status === "started"
                                ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                                : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                            }`}
                          >
                            {site.status === "started" ? "Running" : "Stopped"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {site.hostname && (
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {site.protocol}://{site.hostname}{site.port !== 80 && site.port !== 443 ? `:${site.port}` : ""}
                            </span>
                          )}
                          {site.customerId ? (
                            <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                              <Link2 className="w-3 h-3" />
                              {site.customerName}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <Unlink className="w-3 h-3" />
                              Not linked
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {site.hostname && (
                        <a
                          href={`${site.protocol}://${site.hostname}${site.port !== 80 && site.port !== 443 ? `:${site.port}` : ""}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400"
                          title="Open in browser"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      {site.status === "started" ? (
                        <button
                          onClick={() => handleSiteAction(site.id, site.name, "stop")}
                          disabled={actionLoading[site.id]}
                          className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-red-500 disabled:opacity-50"
                          title="Stop site"
                        >
                          {actionLoading[site.id] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSiteAction(site.id, site.name, "start")}
                          disabled={actionLoading[site.id]}
                          className="p-2 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg text-green-600 disabled:opacity-50"
                          title="Start site"
                        >
                          {actionLoading[site.id] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setLinkTarget(site);
                          setLinkCustomerId(site.customerId || "");
                          setLinkNotes(site.notes || "");
                        }}
                        className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400"
                        title={site.customerId ? "Change link" : "Link to customer"}
                      >
                        <Link2 className="w-4 h-4" />
                      </button>
                      {site.customerId && (
                        <button
                          onClick={() => handleUnlinkSite(site)}
                          disabled={actionLoading[`unlink-${site.id}`]}
                          className="p-2 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400 disabled:opacity-50"
                          title="Unlink from customer"
                        >
                          {actionLoading[`unlink-${site.id}`] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Unlink className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {expandedSite === site.id && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-3 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Physical Path:</span>
                        <span className="ml-2 font-mono text-gray-900 dark:text-white text-xs">
                          {site.physicalPath || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Auto Start:</span>
                        <span className="ml-2 text-gray-900 dark:text-white">
                          {site.autoStart ? "Yes" : "No"}
                        </span>
                      </div>
                      {site.customerEmail && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Customer Email:</span>
                          <span className="ml-2 text-gray-900 dark:text-white">{site.customerEmail}</span>
                        </div>
                      )}
                      {site.notes && (
                        <div className="md:col-span-2">
                          <span className="text-gray-500 dark:text-gray-400">Notes:</span>
                          <span className="ml-2 text-gray-900 dark:text-white">{site.notes}</span>
                        </div>
                      )}
                    </div>

                    {site.bindings.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                          Bindings
                        </h4>
                        <div className="space-y-1">
                          {site.bindings.map((b, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-xs bg-white dark:bg-gray-700 rounded px-2 py-1"
                            >
                              <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded font-medium uppercase">
                                {b.protocol}
                              </span>
                              <span className="text-gray-900 dark:text-white font-mono">
                                {b.hostname || "*"}:{b.port || ""}
                              </span>
                              {b.ip_address && b.ip_address !== "*" && (
                                <span className="text-gray-400">IP: {b.ip_address}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* App Pools Tab */}
      {activeTab === "pools" && (
        <div className="space-y-3">
          {loadingPools ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-500">Loading application pools...</span>
            </div>
          ) : filteredPools.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
              <Layers className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">No App Pools</h3>
            </div>
          ) : (
            filteredPools.map((pool) => (
              <div
                key={pool.id}
                className={`bg-white dark:bg-gray-800 rounded-xl border ${
                  pool.status === "started"
                    ? "border-gray-200 dark:border-gray-700"
                    : "border-red-200 dark:border-red-900"
                } p-4`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        pool.status === "started"
                          ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                          : "bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400"
                      }`}
                    >
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900 dark:text-white">{pool.name}</span>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        <span
                          className={`px-2 py-0.5 rounded font-medium ${
                            pool.status === "started"
                              ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                              : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                          }`}
                        >
                          {pool.status === "started" ? "Running" : "Stopped"}
                        </span>
                        {pool.pipeline_mode && <span>Pipeline: {pool.pipeline_mode}</span>}
                        {pool.managed_runtime_version && (
                          <span>.NET: {pool.managed_runtime_version || "No Managed Code"}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handlePoolAction(pool.id, pool.name, "recycle")}
                      disabled={actionLoading[pool.id] || pool.status !== "started"}
                      className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 disabled:opacity-30"
                      title="Recycle"
                    >
                      {actionLoading[pool.id] ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                    {pool.status === "started" ? (
                      <button
                        onClick={() => handlePoolAction(pool.id, pool.name, "stop")}
                        disabled={actionLoading[pool.id]}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-red-500 disabled:opacity-50"
                        title="Stop"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePoolAction(pool.id, pool.name, "start")}
                        disabled={actionLoading[pool.id]}
                        className="p-2 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg text-green-600 disabled:opacity-50"
                        title="Start"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Link to Customer Modal */}
      {linkTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Link Site to Customer
              </h2>
              <button onClick={() => setLinkTarget(null)}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">{linkTarget.name}</span>
                </div>
                {linkTarget.hostname && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                    {linkTarget.hostname}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Customer
                </label>
                <select
                  value={linkCustomerId}
                  onChange={(e) => setLinkCustomerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">-- No customer (unlink) --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company} ({c.contactPerson})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes <span className="text-gray-400 font-normal">- optional</span>
                </label>
                <textarea
                  value={linkNotes}
                  onChange={(e) => setLinkNotes(e.target.value)}
                  rows={2}
                  placeholder="Brief note about this site assignment..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setLinkTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleLinkSite}
                disabled={linking}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50"
              >
                {linking && <Loader2 className="w-4 h-4 animate-spin" />}
                {linkCustomerId ? "Link to Customer" : "Save (Unlinked)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
