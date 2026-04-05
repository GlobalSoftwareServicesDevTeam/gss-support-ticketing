"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, ChevronDown } from "lucide-react";

interface FlaggedEmail {
  id: string;
  messageId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyText: string | null;
  reason: string;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  assignedToIssueId: string | null;
  receivedAt: string;
}

interface BlockedSender {
  id: string;
  email: string;
  pattern: string | null;
  reason: string | null;
  createdAt: string;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export default function FlaggedEmailsPage() {
  const [flagged, setFlagged] = useState<FlaggedEmail[]>([]);
  const [blocked, setBlocked] = useState<BlockedSender[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [tab, setTab] = useState<"flagged" | "blocked">("flagged");
  const [newBlockEmail, setNewBlockEmail] = useState("");
  const [newBlockReason, setNewBlockReason] = useState("");

  const loadFlagged = useCallback(async () => {
    const res = await fetch(`/api/flagged-emails?status=${filter}`);
    if (res.ok) {
      const data = await res.json();
      setFlagged(data.flagged);
      setPendingCount(data.pendingCount);
    }
  }, [filter]);

  const loadBlocked = useCallback(async () => {
    const res = await fetch("/api/blocked-senders");
    if (res.ok) setBlocked(await res.json());
  }, []);

  useEffect(() => {
    Promise.all([
      loadFlagged(),
      loadBlocked(),
      fetch("/api/users").then((r) => r.ok ? r.json() : []).then(setUsers),
    ]).finally(() => setLoading(false));
  }, [loadFlagged, loadBlocked]);

  useEffect(() => {
    loadFlagged();
  }, [filter, loadFlagged]);

  async function handleAction(id: string, action: string) {
    setActionInProgress(id);
    try {
      const body: Record<string, string> = { action };
      if (action === "create_ticket" && assignUserId) {
        body.assignToUserId = assignUserId;
      }
      const res = await fetch(`/api/flagged-emails/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await loadFlagged();
        await loadBlocked();
        setExpandedId(null);
        setAssignUserId("");
      } else {
        const data = await res.json();
        alert(data.error || "Action failed");
      }
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleAddBlock() {
    if (!newBlockEmail.trim()) return;
    const res = await fetch("/api/blocked-senders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newBlockEmail.trim(), reason: newBlockReason.trim() || null }),
    });
    if (res.ok) {
      setNewBlockEmail("");
      setNewBlockReason("");
      await loadBlocked();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to block sender");
    }
  }

  async function handleUnblock(id: string) {
    if (!confirm("Unblock this sender?")) return;
    const res = await fetch(`/api/blocked-senders/${id}`, { method: "DELETE" });
    if (res.ok) await loadBlocked();
  }

  const reasonLabel: Record<string, { text: string; color: string }> = {
    BOUNCE: { text: "Bounce / Undelivered", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    NOREPLY: { text: "No-Reply Address", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    BLOCKED_SENDER: { text: "Blocked Sender", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
    SUSPICIOUS: { text: "Suspicious", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
    UNREGISTERED: { text: "Unregistered Sender", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  };

  const statusLabel: Record<string, { text: string; color: string }> = {
    PENDING: { text: "Pending Review", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    ASSIGNED: { text: "Ticket Created", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    IGNORED: { text: "Ignored", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Flagged Emails
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Review suspicious, bounced, and auto-reply emails before they become tickets.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setTab("flagged")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "flagged"
              ? "border-brand-500 text-brand-600 dark:text-brand-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          Flagged Emails
          {pendingCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-red-500 text-white">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("blocked")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "blocked"
              ? "border-brand-500 text-brand-600 dark:text-brand-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          }`}
        >
          Blocked Senders ({blocked.length})
        </button>
      </div>

      {/* Flagged Emails Tab */}
      {tab === "flagged" && (
        <div>
          {/* Status filter */}
          <div className="flex gap-2 mb-4">
            {["PENDING", "ASSIGNED", "IGNORED", "ALL"].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === s
                    ? "bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {flagged.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                No {filter === "ALL" ? "" : filter.toLowerCase() + " "}flagged emails.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {flagged.map((email) => {
                const reason = reasonLabel[email.reason] || { text: email.reason, color: "bg-gray-100 text-gray-700" };
                const status = statusLabel[email.status] || { text: email.status, color: "bg-gray-100 text-gray-700" };
                const isExpanded = expandedId === email.id;

                return (
                  <div
                    key={email.id}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
                  >
                    {/* Summary row */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : email.id)}
                      className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${reason.color}`}>
                            {reason.text}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                            {status.text}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {email.subject}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          From: {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
                          <span className="mx-2">•</span>
                          {new Date(email.receivedAt).toLocaleString()}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4">
                        {/* Email body */}
                        <div className="mb-4">
                          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Email Content
                          </h4>
                          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-60 overflow-y-auto">
                            {email.bodyText || "(No text content)"}
                          </div>
                        </div>

                        {/* Actions */}
                        {email.status === "PENDING" && (
                          <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                            {/* Ignore */}
                            <button
                              onClick={() => handleAction(email.id, "ignore")}
                              disabled={actionInProgress === email.id}
                              className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                              Ignore
                            </button>

                            {/* Block sender */}
                            <button
                              onClick={() => handleAction(email.id, "block_sender")}
                              disabled={actionInProgress === email.id}
                              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                            >
                              Block Sender
                            </button>

                            {/* Assign as ticket */}
                            <div className="flex items-end gap-2">
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                  Assign to user (optional)
                                </label>
                                <select
                                  title="Assign to user"
                                  value={assignUserId}
                                  onChange={(e) => setAssignUserId(e.target.value)}
                                  className="block w-48 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
                                >
                                  <option value="">Auto-detect</option>
                                  {users.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.firstName} {u.lastName} ({u.email})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button
                                onClick={() => handleAction(email.id, "create_ticket")}
                                disabled={actionInProgress === email.id}
                                className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                              >
                                Create Ticket
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Resolved info */}
                        {email.status !== "PENDING" && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 pt-2">
                            Resolved {email.resolvedAt ? new Date(email.resolvedAt).toLocaleString() : ""}
                            {email.assignedToIssueId && (
                              <span>
                                {" • "}
                                <a
                                  href={`/issues/${email.assignedToIssueId}`}
                                  className="text-brand-500 hover:underline"
                                >
                                  View Ticket
                                </a>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Blocked Senders Tab */}
      {tab === "blocked" && (
        <div>
          {/* Add blocked sender form */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Block a Sender
            </h3>
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email address</label>
                <input
                  type="email"
                  value={newBlockEmail}
                  onChange={(e) => setNewBlockEmail(e.target.value)}
                  placeholder="spam@example.com"
                  className="block w-64 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={newBlockReason}
                  onChange={(e) => setNewBlockReason(e.target.value)}
                  placeholder="Spam sender"
                  className="block w-48 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
                />
              </div>
              <button
                onClick={handleAddBlock}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Block Sender
              </button>
            </div>
          </div>

          {/* Blocked list */}
          {blocked.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-12 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">No blocked senders yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reason</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Blocked On</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {blocked.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-5 py-3 text-gray-900 dark:text-white font-mono text-xs">{s.email}</td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{s.reason || "—"}</td>
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{new Date(s.createdAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => handleUnblock(s.id)}
                          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-medium"
                        >
                          Unblock
                        </button>
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
  );
}
