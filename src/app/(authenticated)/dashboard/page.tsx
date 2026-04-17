"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { RefreshCw, Globe, AlertTriangle, Bell } from "lucide-react";

interface ExpiringDomain {
  id: string;
  domain: string;
  expiryDate: string;
  daysLeft: number;
  expired: boolean;
  amount: number | null;
  user?: { firstName: string; lastName: string; email: string };
  reminderSentAt: string | null;
  invoiceId: string | null;
}

interface DashboardStats {
  totalIssues: number;
  openIssues: number;
  inProgressIssues: number;
  closedIssues: number;
  totalUsers: number;
  totalProjects: number;
  recentIssues: Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    createdAt: string;
    user?: { firstName: string; lastName: string };
    customer?: { contactPerson: string; company: string };
  }>;
}

interface RecurringInvoice {
  id: string;
  number: string;
  amount: number;
  balance: number;
  status_id: string;
  frequency_id: string;
  next_send_date: string;
  client?: { display_name?: string; name?: string };
}

const RECURRING_STATUS: Record<string, { label: string; color: string }> = {
  "1": { label: "Draft", color: "bg-slate-100 text-slate-600" },
  "2": { label: "Active", color: "bg-green-100 text-green-700" },
  "3": { label: "Paused", color: "bg-yellow-100 text-yellow-700" },
  "4": { label: "Completed", color: "bg-blue-100 text-blue-700" },
  "-1": { label: "Pending", color: "bg-orange-100 text-orange-700" },
};

const FREQUENCY_LABELS: Record<string, string> = {
  "1": "Daily",
  "2": "Weekly",
  "3": "Bi-weekly",
  "4": "Monthly",
  "5": "Bi-monthly",
  "6": "Quarterly",
  "7": "Every 4 months",
  "8": "Semi-annually",
  "9": "Annually",
  "10": "Every 2 years",
  "11": "Every 3 years",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
  const [expiringDomains, setExpiringDomains] = useState<ExpiringDomain[]>([]);
  const [polling, setPolling] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    if (isAdmin) {
      fetch("/api/dashboard")
        .then(async (r) => {
          if (!r.ok) return null;
          return r.json();
        })
        .then((data) => { if (data) setStats(data); })
        .catch(() => {});
    } else {
      fetch("/api/issues?limit=5")
        .then(async (r) => {
          if (!r.ok) return null;
          return r.json();
        })
        .then((data) => {
          if (!data) return;
          setStats({
            totalIssues: data.total,
            openIssues: 0,
            inProgressIssues: 0,
            closedIssues: 0,
            totalUsers: 0,
            totalProjects: 0,
            recentIssues: data.issues,
          });
        })
        .catch(() => {});
    }
    // Fetch expiring domains
    fetch("/api/hosting/domain-reminders")
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setExpiringDomains(data);
      })
      .catch(() => {});
    // Fetch recurring invoices for all users
    fetch("/api/invoices?type=recurring_invoices")
      .then(async (r) => {
        if (!r.ok || !(r.headers.get("content-type") || "").includes("application/json")) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.configured && Array.isArray(data.data)) {
          setRecurringInvoices(data.data.filter((i: RecurringInvoice) => i.status_id === "2"));
        }
      })
      .catch(() => {});
  }, [isAdmin]);

  async function handlePollEmails() {
    setPolling(true);
    try {
      const res = await fetch("/api/email/poll", { method: "POST" });
      const data = await res.json();
      alert(`Email polling complete. Processed: ${data.processed} emails.${data.errors?.length ? `\nErrors: ${data.errors.join(", ")}` : ""}`);
      // Refresh stats
      if (isAdmin) {
        const r = await fetch("/api/dashboard");
        setStats(await r.json());
      }
    } catch {
      alert("Failed to poll emails.");
    }
    setPolling(false);
  }

  async function handleSendDomainReminders() {
    if (!confirm("This will send renewal invoices and emails for all domains expiring within 30 days. Continue?")) return;
    setSendingReminders(true);
    try {
      const res = await fetch("/api/hosting/domain-reminders", { method: "POST" });
      const data = await res.json();
      alert(`Domain reminders processed.\nInvoices created: ${data.invoicesCreated}\nReminders sent: ${data.remindersSent}`);
      // Refresh expiring domains
      const r2 = await fetch("/api/hosting/domain-reminders");
      if (r2.ok) {
        const refreshed = await r2.json();
        if (Array.isArray(refreshed)) setExpiringDomains(refreshed);
      }
    } catch {
      alert("Failed to send domain reminders.");
    }
    setSendingReminders(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">
            Welcome back, {session?.user?.name}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={handleSendDomainReminders}
              disabled={sendingReminders}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              <Bell size={14} />
              {sendingReminders ? "Sending..." : "Domain Reminders"}
            </button>
            <button
              onClick={handlePollEmails}
              disabled={polling}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
            >
              {polling ? "Checking..." : "Check Emails"}
            </button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {isAdmin && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Tickets" value={stats.totalIssues} color="blue" />
          <StatCard label="Open" value={stats.openIssues} color="yellow" />
          <StatCard label="In Progress" value={stats.inProgressIssues} color="purple" />
          <StatCard label="Closed" value={stats.closedIssues} color="green" />
        </div>
      )}

      {isAdmin && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <StatCard label="Total Users" value={stats.totalUsers} color="indigo" />
          <StatCard label="Total Projects" value={stats.totalProjects} color="teal" />
        </div>
      )}

      {/* Recent Issues */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {isAdmin ? "Recent Tickets" : "My Recent Tickets"}
          </h2>
          <Link href="/issues" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {stats?.recentIssues?.map((issue) => (
            <Link
              key={issue.id}
              href={`/issues/${issue.id}`}
              className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {issue.subject}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {issue.user
                    ? `${issue.user.firstName} ${issue.user.lastName}`
                    : issue.customer?.contactPerson || "Email ticket"}{" "}
                  · {new Date(issue.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <PriorityBadge priority={issue.priority} />
                <StatusBadge status={issue.status} />
              </div>
            </Link>
          ))}
          {(!stats?.recentIssues || stats.recentIssues.length === 0) && (
            <div className="px-6 py-8 text-center text-slate-400">
              No tickets yet.{" "}
              {!isAdmin && (
                <Link href="/issues/new" className="text-blue-600 hover:underline">
                  Create one
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recurring Invoices */}
      {recurringInvoices.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mt-6">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <RefreshCw size={18} className="text-blue-600" /> Recurring Invoices
            </h2>
            <Link href="/invoices" className="text-sm text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Number</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Client</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Amount</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Frequency</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Next Send</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recurringInvoices.map((inv) => {
                  const status = RECURRING_STATUS[inv.status_id] || { label: "Unknown", color: "bg-gray-100 text-gray-700" };
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{inv.number || "—"}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {inv.client?.display_name || inv.client?.name || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {formatCurrency(inv.amount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {FREQUENCY_LABELS[inv.frequency_id] || `Freq ${inv.frequency_id}`}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {inv.next_send_date ? new Date(inv.next_send_date).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expiring Domains */}
      {expiringDomains.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mt-6">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Globe size={18} className="text-amber-600" /> Expiring Domains
            </h2>
            <Link href="/hosting" className="text-sm text-blue-600 hover:underline">
              View hosting
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {expiringDomains.map((d) => {
              const urgency = d.expired
                ? "bg-red-50 border-l-4 border-l-red-500"
                : d.daysLeft <= 7
                ? "bg-red-50 border-l-4 border-l-red-400"
                : d.daysLeft <= 14
                ? "bg-orange-50 border-l-4 border-l-orange-400"
                : "bg-yellow-50 border-l-4 border-l-yellow-400";
              return (
                <div key={d.id} className={`flex items-center justify-between px-6 py-3 ${urgency}`}>
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={16} className={d.expired || d.daysLeft <= 7 ? "text-red-500" : d.daysLeft <= 14 ? "text-orange-500" : "text-yellow-500"} />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{d.domain}</p>
                      {isAdmin && d.user && (
                        <p className="text-xs text-slate-500">{d.user.firstName} {d.user.lastName} · {d.user.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {d.amount && (
                      <span className="text-xs font-medium text-slate-600">R{d.amount.toFixed(2)}/yr</span>
                    )}
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.expired ? "bg-red-100 text-red-700" : d.daysLeft <= 7 ? "bg-red-100 text-red-700" : d.daysLeft <= 14 ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {d.expired ? "Expired" : `${d.daysLeft}d left`}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-0.5">{new Date(d.expiryDate).toLocaleDateString()}</p>
                    </div>
                    {d.invoiceId && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Invoiced</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const bgColors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600",
    green: "bg-green-50 text-green-600",
    indigo: "bg-indigo-50 text-indigo-600",
    teal: "bg-teal-50 text-teal-600",
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${bgColors[color]?.split(" ")[1] || "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}
