"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import {
  ScrollText,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Clock,
  User,
  Globe,
  Monitor,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  metadata: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  UPDATE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  LOGIN: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  LOGOUT: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400",
  DOWNLOAD: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  PROVISION: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  CANCEL: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  CREDIT: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  UPLOAD: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  INVITE: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  REGISTER: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  SIGN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  STATUS_CHANGE: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  PAYMENT: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
};

const ENTITY_ICONS: Record<string, string> = {
  USER: "👤",
  ISSUE: "🎫",
  PROJECT: "📁",
  DOCUMENT: "📄",
  HOSTING_ORDER: "🖥️",
  HOSTING_PRODUCT: "📦",
  PAYMENT: "💳",
  CODE_RELEASE: "📀",
  SIGNING_REQUEST: "✍️",
  BILLING: "🧾",
  EMAIL: "📧",
  TASK: "✅",
  AUTH: "🔐",
};

export default function AuditLogsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Unique values for filter dropdowns
  const [actions, setActions] = useState<string[]>([]);
  const [entities, setEntities] = useState<string[]>([]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("search", search);
      if (actionFilter) params.set("action", actionFilter);
      if (entityFilter) params.set("entity", entityFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);

      const res = await fetch(`/api/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data);
        setTotalPages(data.totalPages);
        setTotal(data.total);

        // Extract unique actions/entities for filters
        const newActions = new Set(actions);
        const newEntities = new Set(entities);
        data.data.forEach((l: AuditLog) => {
          newActions.add(l.action);
          newEntities.add(l.entity);
        });
        setActions(Array.from(newActions).sort());
        setEntities(Array.from(newEntities).sort());
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [page, search, actionFilter, entityFilter, dateFrom, dateTo, actions, entities]);

  useEffect(() => {
    if (session?.user) fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, actionFilter, entityFilter, dateFrom, dateTo, session]);

  function handleSearch() {
    setPage(1);
    fetchLogs();
  }

  function clearFilters() {
    setSearch("");
    setActionFilter("");
    setEntityFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ScrollText size={28} />
            Audit Logs
          </h1>
          <p className="text-sm text-slate-500 mt-1">{total.toLocaleString()} total events</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 text-sm border rounded-lg transition ${
              showFilters || actionFilter || entityFilter || dateFrom || dateTo
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-600"
                : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            <Filter size={14} />
            Filters
            {(actionFilter || entityFilter || dateFrom || dateTo) && (
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => { setPage(1); fetchLogs(); }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition text-slate-700 dark:text-slate-300"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search descriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white dark:bg-slate-700"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
        >
          Search
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Action</label>
              <select
                title="Filter by action"
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Actions</option>
                {actions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Entity</label>
              <select
                title="Filter by entity"
                value={entityFilter}
                onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Entities</option>
                {entities.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                title="From date"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                title="To date"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              <X size={12} /> Clear all filters
            </button>
          </div>
        </div>
      )}

      {/* Logs list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <ScrollText className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No audit logs found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const isExpanded = expandedLog === log.id;
            const actionColor = ACTION_COLORS[log.action] || "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400";
            const entityIcon = ENTITY_ICONS[log.entity] || "📋";
            let metadata: Record<string, unknown> | null = null;
            if (log.metadata) {
              try {
                metadata = JSON.parse(log.metadata);
              } catch {
                // not valid JSON
              }
            }

            return (
              <div
                key={log.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition"
                  onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                >
                  {/* Entity icon */}
                  <span className="text-lg mt-0.5 shrink-0" title={log.entity}>{entityIcon}</span>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${actionColor}`}>
                        {log.action}
                      </span>
                      <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                        {log.entity}
                      </span>
                      {log.entityId && (
                        <span className="text-xs text-slate-400 font-mono">{log.entityId.slice(0, 8)}...</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 line-clamp-2">
                      {log.description}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                      {log.userName && (
                        <span className="flex items-center gap-1">
                          <User size={11} />
                          {log.userName}
                        </span>
                      )}
                      {log.ipAddress && (
                        <span className="flex items-center gap-1">
                          <Globe size={11} />
                          {log.ipAddress}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand toggle */}
                  <div className="shrink-0 mt-1">
                    {isExpanded ? (
                      <ChevronUp size={16} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-400 uppercase">Log ID</p>
                        <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{log.id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase">Entity ID</p>
                        <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{log.entityId || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase">User ID</p>
                        <p className="text-slate-700 dark:text-slate-300 font-mono text-xs mt-0.5">{log.userId || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase">IP Address</p>
                        <p className="text-slate-700 dark:text-slate-300 text-xs mt-0.5">{log.ipAddress || "—"}</p>
                      </div>
                      {log.userAgent && (
                        <div className="md:col-span-2">
                          <p className="text-xs text-slate-400 uppercase flex items-center gap-1"><Monitor size={11} /> User Agent</p>
                          <p className="text-slate-700 dark:text-slate-300 text-xs mt-0.5 break-all">{log.userAgent}</p>
                        </div>
                      )}
                      <div className="md:col-span-2">
                        <p className="text-xs text-slate-400 uppercase">Full Description</p>
                        <p className="text-slate-700 dark:text-slate-300 text-sm mt-0.5">{log.description}</p>
                      </div>
                      {metadata && (
                        <div className="md:col-span-2">
                          <p className="text-xs text-slate-400 uppercase">Metadata</p>
                          <pre className="mt-1 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 overflow-x-auto">
                            {JSON.stringify(metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages} ({total.toLocaleString()} logs)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50 text-slate-700 dark:text-slate-300"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50 text-slate-700 dark:text-slate-300"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
