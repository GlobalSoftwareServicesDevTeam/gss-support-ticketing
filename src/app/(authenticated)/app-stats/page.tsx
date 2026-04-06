"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import {
  Smartphone,
  BarChart3,
  TrendingUp,
  Download,
  Star,
  Users,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
} from "lucide-react";

interface MobileApp {
  id: string;
  name: string;
  bundleId: string;
  platform: "GOOGLE_PLAY" | "APPLE";
  storeUrl: string | null;
  iconUrl: string | null;
  _count: { stats: number; builds: number };
}

interface AppStat {
  id: string;
  date: string;
  downloads: number;
  updates: number;
  activeDevices: number;
  revenue: string;
  ratings: number;
  averageRating: string;
  crashes: number;
  uninstalls: number;
  country: string | null;
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
  createdAt: string;
}

export default function AppStatsPage() {
  useSession();
  const [apps, setApps] = useState<MobileApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [stats, setStats] = useState<AppStat[]>([]);
  const [builds, setBuilds] = useState<AppBuild[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingBuilds, setLoadingBuilds] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "stats" | "builds">("overview");

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mobile-apps");
      if (res.ok) {
        const data = await res.json();
        setApps(data);
        if (data.length > 0 && !selectedApp) {
          setSelectedApp(data[0].id);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedApp]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadApps(); }, []);

  const loadStats = useCallback(async (appId: string) => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/mobile-apps/${appId}/stats`);
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
    setLoadingStats(false);
  }, []);

  const loadBuilds = useCallback(async (appId: string) => {
    setLoadingBuilds(true);
    try {
      const res = await fetch(`/api/mobile-apps/${appId}/builds`);
      if (res.ok) setBuilds(await res.json());
    } catch { /* ignore */ }
    setLoadingBuilds(false);
  }, []);

  useEffect(() => {
    if (selectedApp) {
      void loadStats(selectedApp);
      void loadBuilds(selectedApp);
    }
  }, [selectedApp, loadStats, loadBuilds]);

  const currentApp = apps.find((a) => a.id === selectedApp);

  // Compute summary stats from latest entries
  const latestStats = stats.length > 0 ? stats[0] : null;
  const totalDownloads = stats.reduce((sum, s) => sum + s.downloads, 0);
  const totalRevenue = stats.reduce((sum, s) => sum + parseFloat(s.revenue || "0"), 0);
  const avgRating = latestStats ? parseFloat(latestStats.averageRating || "0") : 0;
  const latestBuild = builds.length > 0 ? builds[0] : null;

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={24} />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500 dark:text-slate-400">
        <Smartphone size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">No Apps Registered</p>
        <p className="text-sm mt-1">Your organization doesn&apos;t have any mobile apps configured yet.</p>
        <p className="text-sm">Please contact support to add your apps for monitoring.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="text-blue-600" size={28} />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">App Statistics</h1>
      </div>

      {/* App Selector */}
      {apps.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => setSelectedApp(app.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition border ${
                selectedApp === app.id
                  ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-400"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-gray-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-gray-800"
              }`}
            >
              {app.iconUrl ? (
                <Image src={app.iconUrl} alt="" width={20} height={20} className="w-5 h-5 rounded" unoptimized />
              ) : (
                <Smartphone size={16} />
              )}
              {app.name}
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                app.platform === "GOOGLE_PLAY"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              }`}>
                {app.platform === "GOOGLE_PLAY" ? "Android" : "iOS"}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
        {[
          { key: "overview" as const, label: "Overview", icon: <BarChart3 size={16} /> },
          { key: "stats" as const, label: "Statistics", icon: <TrendingUp size={16} /> },
          { key: "builds" as const, label: "Builds", icon: <Upload size={16} /> },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && currentApp && (
        <div>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                  <Download size={20} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Downloads</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{totalDownloads.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                  <TrendingUp size={20} className="text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Revenue</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">R{totalRevenue.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-center">
                  <Star size={20} className="text-yellow-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Rating</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{avgRating > 0 ? avgRating.toFixed(1) : "—"} / 5</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                  <Users size={20} className="text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Active Devices</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">
                    {latestStats?.activeDevices?.toLocaleString() || "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Latest Build */}
          {latestBuild && (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 mb-6">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Latest Build</h3>
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-slate-400">Version</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{latestBuild.version}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Build</p>
                  <p className="font-mono text-sm text-slate-600 dark:text-slate-300">{latestBuild.buildNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Status</p>
                  <div className="mt-0.5">{statusBadge(latestBuild.status)}</div>
                </div>
                {latestBuild.trackOrChannel && (
                  <div>
                    <p className="text-xs text-slate-400">Track</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{latestBuild.trackOrChannel}</p>
                  </div>
                )}
                {latestBuild.releasedAt && (
                  <div>
                    <p className="text-xs text-slate-400">Released</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {new Date(latestBuild.releasedAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
              {latestBuild.releaseNotes && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">Release Notes</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{latestBuild.releaseNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Recent Stats Table */}
          {stats.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Recent Statistics</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      <th className="pb-2 pr-4 font-medium">Date</th>
                      <th className="pb-2 pr-4 font-medium text-right">Downloads</th>
                      <th className="pb-2 pr-4 font-medium text-right">Updates</th>
                      <th className="pb-2 pr-4 font-medium text-right">Active</th>
                      <th className="pb-2 pr-4 font-medium text-right">Revenue</th>
                      <th className="pb-2 pr-4 font-medium text-right">Rating</th>
                      <th className="pb-2 font-medium text-right">Crashes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {stats.slice(0, 14).map((s) => (
                      <tr key={s.id} className="text-slate-600 dark:text-slate-300">
                        <td className="py-2 pr-4">{new Date(s.date).toLocaleDateString()}</td>
                        <td className="py-2 pr-4 text-right">{s.downloads.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{s.updates.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{s.activeDevices.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">R{parseFloat(s.revenue || "0").toFixed(2)}</td>
                        <td className="py-2 pr-4 text-right">{parseFloat(s.averageRating || "0").toFixed(1)}</td>
                        <td className="py-2 text-right">
                          {s.crashes > 0 ? (
                            <span className="text-red-500">{s.crashes}</span>
                          ) : (
                            <span className="text-green-500">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === "stats" && (
        <div>
          {loadingStats ? (
            <div className="text-center py-16">
              <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
            </div>
          ) : stats.length === 0 ? (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400">
              <BarChart3 size={48} className="mx-auto mb-4 opacity-30" />
              <p>No statistics data available yet.</p>
              <p className="text-sm mt-1">Statistics will appear here once data is imported.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      <th className="pb-2 pr-4 font-medium">Date</th>
                      <th className="pb-2 pr-4 font-medium text-right">Downloads</th>
                      <th className="pb-2 pr-4 font-medium text-right">Updates</th>
                      <th className="pb-2 pr-4 font-medium text-right">Active Devices</th>
                      <th className="pb-2 pr-4 font-medium text-right">Revenue</th>
                      <th className="pb-2 pr-4 font-medium text-right">Ratings</th>
                      <th className="pb-2 pr-4 font-medium text-right">Avg Rating</th>
                      <th className="pb-2 pr-4 font-medium text-right">Crashes</th>
                      <th className="pb-2 font-medium text-right">Uninstalls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {stats.map((s) => (
                      <tr key={s.id} className="text-slate-600 dark:text-slate-300">
                        <td className="py-2 pr-4">{new Date(s.date).toLocaleDateString()}</td>
                        <td className="py-2 pr-4 text-right">{s.downloads.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{s.updates.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{s.activeDevices.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">R{parseFloat(s.revenue || "0").toFixed(2)}</td>
                        <td className="py-2 pr-4 text-right">{s.ratings}</td>
                        <td className="py-2 pr-4 text-right">{parseFloat(s.averageRating || "0").toFixed(1)}</td>
                        <td className="py-2 pr-4 text-right">
                          {s.crashes > 0 ? <span className="text-red-500">{s.crashes}</span> : "0"}
                        </td>
                        <td className="py-2 text-right">{s.uninstalls.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Builds Tab */}
      {activeTab === "builds" && (
        <div>
          {loadingBuilds ? (
            <div className="text-center py-16">
              <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
            </div>
          ) : builds.length === 0 ? (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400">
              <Upload size={48} className="mx-auto mb-4 opacity-30" />
              <p>No builds recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {builds.map((build) => (
                <div key={build.id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">v{build.version}</span>
                        {statusBadge(build.status)}
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Build {build.buildNumber}
                        {build.trackOrChannel && ` · ${build.trackOrChannel}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-slate-400">
                      {build.submittedAt && (
                        <div>
                          <span className="block text-slate-500">Submitted</span>
                          {new Date(build.submittedAt).toLocaleDateString()}
                        </div>
                      )}
                      {build.reviewedAt && (
                        <div>
                          <span className="block text-slate-500">Reviewed</span>
                          {new Date(build.reviewedAt).toLocaleDateString()}
                        </div>
                      )}
                      {build.releasedAt && (
                        <div>
                          <span className="block text-slate-500">Released</span>
                          {new Date(build.releasedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                  {build.releaseNotes && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                      <p className="text-xs font-medium text-slate-500 mb-1">Release Notes</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{build.releaseNotes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
