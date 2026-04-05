"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, ChevronLeft, ChevronRight, Filter } from "lucide-react";

interface DownloadLog {
  id: string;
  downloadedAt: string;
  ipAddress: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    company: string | null;
  };
  codeRelease: {
    id: string;
    version: string;
    fileName: string;
    project: { id: string; projectName: string };
  };
}

export default function CodeDownloadsPage() {
  const [logs, setLogs] = useState<DownloadLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [projectFilter, setProjectFilter] = useState("");
  const limit = 30;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (projectFilter) params.set("projectId", projectFilter);

    fetch(`/api/code-downloads?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, projectFilter]);

  const totalPages = Math.ceil(total / limit);

  // Extract unique projects from current logs for quick filter
  const projects = Array.from(
    new Map(logs.map((l) => [l.codeRelease.project.id, l.codeRelease.project])).values()
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
            <Download className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Code Download Audit</h1>
            <p className="text-sm text-slate-500">{total} total download{total !== 1 ? "s" : ""} recorded</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      {projects.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <Filter size={16} className="text-slate-400" />
          <select
            value={projectFilter}
            onChange={(e) => { setProjectFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-900"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.projectName}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-2 text-sm text-slate-500">Loading download logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Download className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No code downloads recorded yet.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">User</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Project</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Version</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">File</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">IP Address</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Downloaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-slate-900">{log.user.firstName} {log.user.lastName}</p>
                      <p className="text-xs text-slate-500">{log.user.email}</p>
                      {log.user.company && <p className="text-xs text-slate-400">{log.user.company}</p>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">{log.codeRelease.project.projectName}</td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">v{log.codeRelease.version}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{log.codeRelease.fileName}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">{log.ipAddress || "-"}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(log.downloadedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-300 hover:bg-white transition disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-300 hover:bg-white transition disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
