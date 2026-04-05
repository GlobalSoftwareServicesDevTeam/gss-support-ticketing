"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge, PriorityBadge } from "@/components/badges";

interface Issue {
  id: string;
  subject: string;
  status: string;
  priority: string;
  company: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { firstName: string; lastName: string; email: string };
  customer?: { contactPerson: string; emailAddress: string; company: string };
  _count: { messages: number; fileUploads: number };
}

export default function IssuesPage() {
  const { data: session } = useSession();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (search) params.set("search", search);

    fetch(`/api/issues?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setIssues(data.issues || []);
          setTotal(data.total || 0);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [page, statusFilter, priorityFilter, search]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {isAdmin ? "All Tickets" : "My Tickets"}
        </h1>
        <Link
          href="/issues/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + New Ticket
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search tickets..."
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          title="Filter by status"
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Status</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="WAITING">Waiting</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select
          title="Filter by priority"
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700"
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Priority</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {/* Issues Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Subject</th>
              {isAdmin && <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">From</th>}
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Priority</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Messages</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            ) : issues.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                  No tickets found.
                </td>
              </tr>
            ) : (
              issues.map((issue) => (
                <tr key={issue.id} className="hover:bg-slate-50 transition cursor-pointer">
                  <td className="px-6 py-4">
                    <Link href={`/issues/${issue.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {issue.subject}
                    </Link>
                    {issue.company && (
                      <p className="text-xs text-slate-400 mt-0.5">{issue.company}</p>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {issue.user
                        ? `${issue.user.firstName} ${issue.user.lastName}`
                        : issue.customer?.contactPerson || "—"}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <StatusBadge status={issue.status} />
                  </td>
                  <td className="px-6 py-4">
                    <PriorityBadge priority={issue.priority} />
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {issue._count.messages}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(issue.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-slate-300 rounded disabled:opacity-50 text-slate-700"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border border-slate-300 rounded disabled:opacity-50 text-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
