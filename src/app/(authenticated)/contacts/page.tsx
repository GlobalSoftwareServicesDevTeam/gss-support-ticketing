"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Users,
  Search,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  CheckCircle2,
  Clock,
  UserX,
  Star,
  ChevronLeft,
  ChevronRight,
  Building2,
  Shield,
  ExternalLink,
  Download,
} from "lucide-react";
import {
  exportRowsAsCSV,
  exportRowsAsExcel,
  exportRowsAsPDF,
  exportRowsToGoogleSheets,
} from "@/lib/reports-export";

interface Contact {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  position: string | null;
  isPrimary: boolean;
  inviteAccepted: boolean;
  invitedAt: string | null;
  inviteExpiresAt: string | null;
  customerId: string;
  customer: { id: string; company: string };
  canViewTickets: boolean;
  canViewProjects: boolean;
  canViewBilling: boolean;
  canViewHosting: boolean;
  canViewDocuments: boolean;
  canViewCode: boolean;
  canViewNotifications: boolean;
  canManageContacts: boolean;
}

interface CustomerOption {
  id: string;
  company: string;
}

export default function ContactsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerId, setCustomerId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;
  const [actionMsg, setActionMsg] = useState("");
  const [invitingIds, setInvitingIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [sendingNotice, setSendingNotice] = useState(false);

  function fetchContacts() {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (customerId) params.set("customerId", customerId);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    fetch(`/api/contacts?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setContacts(data.contacts || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (session && isAdmin) fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, customerId, fromDate, toDate, session]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/customers?limit=1000")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCustomers(d?.customers || d || []))
      .catch(() => undefined);
  }, [isAdmin]);

  async function exportContacts(format: "csv" | "excel" | "pdf" | "gsheets") {
    const rows = contacts.map((c) => ({
      Name: `${c.firstName} ${c.lastName}`,
      Email: c.email,
      Phone: c.phone || "",
      Position: c.position || "",
      Customer: c.customer?.company || "",
      Status: c.inviteAccepted ? "Active" : c.invitedAt ? "Invited" : "Not Invited",
      Invited: c.invitedAt ? new Date(c.invitedAt).toLocaleDateString("en-ZA") : "",
      Created: c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-ZA") : "",
    }));

    const filename = `contacts-report-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") await exportRowsAsCSV(rows, filename);
    if (format === "excel") await exportRowsAsExcel(rows, filename);
    if (format === "pdf") await exportRowsAsPDF(rows, filename, "Contacts Report");
    if (format === "gsheets") await exportRowsToGoogleSheets(rows, filename);
  }

  async function handleInvite(contact: Contact) {
    if (!confirm(`Send portal invite to ${contact.firstName} ${contact.lastName} (${contact.email})?`)) return;

    setInvitingIds((prev) => new Set(prev).add(contact.id));
    try {
      const res = await fetch(
        `/api/customers/${contact.customerId}/contacts/${contact.id}/invite`,
        { method: "POST" }
      );
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Invite sent to ${contact.firstName} ${contact.lastName}`);
        fetchContacts();
      } else {
        setActionMsg(data.error || "Failed to send invite");
      }
    } catch {
      setActionMsg("Failed to send invite");
    } finally {
      setInvitingIds((prev) => {
        const next = new Set(prev);
        next.delete(contact.id);
        return next;
      });
      setTimeout(() => setActionMsg(""), 4000);
    }
  }

  async function handleSyncFromNinja() {
    setSyncing(true);
    setActionMsg("");
    try {
      const res = await fetch("/api/customers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(
          `Sync complete: ${data.imported} new customers, ${data.contacts_created || 0} new contacts imported` +
          (data.skipped ? ` (${data.skipped} existing skipped)` : "") +
          (data.errors?.length ? ` — ${data.errors.length} errors` : "")
        );
        fetchContacts();
      } else {
        setActionMsg(data.error || "Sync failed");
      }
    } catch {
      setActionMsg("Failed to sync from Invoice Ninja");
    } finally {
      setSyncing(false);
      setTimeout(() => setActionMsg(""), 8000);
    }
  }

  async function handleSendNotice() {
    if (!confirm("Send a 'please disregard previous test emails' notice to all uninvited contacts?")) return;
    setSendingNotice(true);
    try {
      const res = await fetch("/api/contacts/send-notice", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Notice sent: ${data.sent} delivered, ${data.failed} failed`);
      } else {
        setActionMsg(data.error || "Failed to send notice");
      }
    } catch {
      setActionMsg("Failed to send notice");
    } finally {
      setSendingNotice(false);
      setTimeout(() => setActionMsg(""), 6000);
    }
  }

  async function handleBulkInvite() {
    const uninvited = contacts.filter((c) => !c.inviteAccepted && !c.invitedAt);
    if (uninvited.length === 0) {
      setActionMsg("No uninvited contacts on this page");
      setTimeout(() => setActionMsg(""), 4000);
      return;
    }
    if (!confirm(`Send invites to ${uninvited.length} uninvited contacts on this page?`)) return;

    let sent = 0;
    let failed = 0;
    for (const contact of uninvited) {
      try {
        const res = await fetch(
          `/api/customers/${contact.customerId}/contacts/${contact.id}/invite`,
          { method: "POST" }
        );
        if (res.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }

    setActionMsg(`Bulk invite: ${sent} sent, ${failed} failed`);
    fetchContacts();
    setTimeout(() => setActionMsg(""), 5000);
  }

  function getStatusBadge(contact: Contact) {
    if (contact.inviteAccepted) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 size={12} /> Active
        </span>
      );
    }
    if (contact.invitedAt) {
      const expired = contact.inviteExpiresAt && new Date(contact.inviteExpiresAt) < new Date();
      return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
          expired
            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        }`}>
          <Clock size={12} /> {expired ? "Expired" : "Invited"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
        <UserX size={12} /> Not Invited
      </span>
    );
  }

  const activeCount = contacts.filter((c) => c.inviteAccepted).length;
  const invitedCount = contacts.filter((c) => !c.inviteAccepted && c.invitedAt).length;
  const uninvitedCount = contacts.filter((c) => !c.inviteAccepted && !c.invitedAt).length;
  const totalPages = Math.ceil(total / limit);

  if (!session || !isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="text-brand-600" size={28} />
            Contacts
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            All customer contacts and portal invitations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncFromNinja}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm font-medium disabled:opacity-50"
            title="Import all clients and contacts from Invoice Ninja"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync from Invoice Ninja"}
          </button>
          <button
            onClick={handleSendNotice}
            disabled={sendingNotice}
            className="flex items-center gap-2 px-4 py-2 border border-yellow-400 text-yellow-700 dark:text-yellow-400 dark:border-yellow-600 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition text-sm font-medium disabled:opacity-50"
            title="Send a one-off notice asking contacts to disregard previous test invite emails"
          >
            <Mail size={16} className={sendingNotice ? "animate-pulse" : ""} />
            {sendingNotice ? "Sending Notice..." : "Send Test Email Notice"}
          </button>
          <button
            onClick={handleBulkInvite}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm font-medium"
            title="Send invites to all uninvited contacts"
          >
            <Send size={16} />
            Bulk Invite Uninvited
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className={`p-3 rounded-lg text-sm ${
          actionMsg.toLowerCase().includes("failed")
            ? "bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
            : "bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
        }`}>
          {actionMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Contacts</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{total}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1 text-xs text-green-600 mb-1">
            <CheckCircle2 size={12} /> Active
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{activeCount}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1 text-xs text-yellow-600 mb-1">
            <Clock size={12} /> Invited
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{invitedCount}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
            <UserX size={12} /> Not Invited
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{uninvitedCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by name, email, position, or company..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          title="Filter by portal status"
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active (Accepted)</option>
          <option value="invited">Invited (Pending)</option>
          <option value="not-invited">Not Invited</option>
        </select>
        <select
          value={customerId}
          onChange={(e) => { setCustomerId(e.target.value); setPage(1); }}
          title="Filter by customer"
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        >
          <option value="">All Clients</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.company}</option>
          ))}
        </select>
        <input
          type="date"
          title="From date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        />
        <input
          type="date"
          title="To date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        />
        <button onClick={() => exportContacts("csv")} className="px-3 py-2 text-xs border border-gray-300 rounded text-gray-700 inline-flex items-center gap-1"><Download size={12} /> CSV</button>
        <button onClick={() => exportContacts("excel")} className="px-3 py-2 text-xs border border-gray-300 rounded text-gray-700 inline-flex items-center gap-1"><Download size={12} /> Excel</button>
        <button onClick={() => exportContacts("pdf")} className="px-3 py-2 text-xs border border-gray-300 rounded text-gray-700 inline-flex items-center gap-1"><Download size={12} /> PDF</button>
        <button onClick={() => exportContacts("gsheets")} className="px-3 py-2 text-xs border border-gray-300 rounded text-gray-700 inline-flex items-center gap-1"><Download size={12} /> GSheets</button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-brand-500" size={32} />
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400">
            <Users className="mx-auto mb-3 opacity-40" size={48} />
            <p className="text-lg font-medium">No contacts found</p>
            <p className="text-sm mt-1">Add contacts from individual customer pages</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Company</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Position</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Portal Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Permissions</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {c.firstName} {c.lastName}
                        </span>
                        {c.isPrimary && (
                          <Star size={14} className="text-amber-500 fill-amber-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link
                        href={`/customers/${c.customer.id}`}
                        className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                      >
                        <Building2 size={13} />
                        {c.customer.company}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1">
                      <Mail size={13} className="text-gray-400" />
                      {c.email}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {c.position || "—"}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(c)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {[
                          c.canViewTickets,
                          c.canViewProjects,
                          c.canViewBilling,
                          c.canViewHosting,
                          c.canViewDocuments,
                          c.canViewCode,
                        ].filter(Boolean).length > 0 ? (
                          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Shield size={12} className="text-brand-500" />
                            {[
                              c.canViewTickets,
                              c.canViewProjects,
                              c.canViewBilling,
                              c.canViewHosting,
                              c.canViewDocuments,
                              c.canViewCode,
                            ].filter(Boolean).length}/6
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!c.inviteAccepted && (
                          <button
                            onClick={() => handleInvite(c)}
                            disabled={invitingIds.has(c.id)}
                            className="text-brand-600 hover:text-brand-800 dark:text-brand-400 text-xs flex items-center gap-1 disabled:opacity-50"
                            title={c.invitedAt ? "Resend invite" : "Send invite"}
                          >
                            {invitingIds.has(c.id) ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Send size={13} />
                            )}
                            {c.invitedAt ? "Resend" : "Invite"}
                          </button>
                        )}
                        <Link
                          href={`/customers/${c.customer.id}`}
                          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xs flex items-center gap-1"
                          title="View customer"
                        >
                          <ExternalLink size={13} />
                          Manage
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="p-2 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="p-2 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
