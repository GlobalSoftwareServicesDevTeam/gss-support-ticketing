"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  User as UserIcon,
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  MapPin,
  Briefcase,
  Shield,
  Ticket,
  FolderKanban,
  Server,
  CreditCard,
  CalendarClock,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  CircleDot,
  Hash,
  Globe,
} from "lucide-react";
import { PayFastLogo, OzowLogo, EftIcon } from "@/components/payment-logos";

// ─── Types ──────────────────────────────────────────────

interface UserProfile {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  company: string | null;
  companyRegNo: string | null;
  companyVatNo: string | null;
  companyAddress: string | null;
  position: string | null;
  role: string;
  emailConfirmed: boolean;
  inviteToken: string | null;
  legalAcceptedAt: string | null;
  invoiceNinjaClientId: string | null;
  createdAt: string;
  updatedAt: string;
  issues: {
    id: string;
    subject: string;
    status: string;
    priority: string;
    createdAt: string;
    project: { projectName: string } | null;
  }[];
  projectAssignments: {
    assignedAt: string;
    project: {
      id: string;
      projectName: string;
      status: string;
      dateCreated: string;
      onMaintenance: boolean;
      maintAmount: string | null;
    };
  }[];
  hostingOrders: {
    id: string;
    orderType: string;
    status: string;
    domain: string | null;
    amount: string | null;
    period: number;
    expiryDate: string | null;
    createdAt: string;
    product: { name: string; type: string; monthlyPrice: string } | null;
  }[];
  payments: {
    id: string;
    gateway: string;
    gatewayRef: string | null;
    amount: string;
    currency: string;
    status: string;
    description: string | null;
    invoiceNumber: string | null;
    createdAt: string;
  }[];
  paymentArrangements: {
    id: string;
    invoiceNumber: string;
    totalAmount: string;
    numberOfMonths: number;
    monthlyAmount: string;
    status: string;
    createdAt: string;
    installments: {
      installmentNo: number;
      amount: string;
      dueDate: string;
      status: string;
      paidAt: string | null;
    }[];
  }[];
  summary: {
    totalTickets: number;
    issuesByStatus: Record<string, number>;
    totalProjects: number;
    totalHostingOrders: number;
    totalPayments: number;
    totalPaid: number;
    totalArrangements: number;
    activeArrangements: number;
  };
}

// ─── Helpers ────────────────────────────────────────────

function formatCurrency(amount: number | string): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(amount));
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}

const TICKET_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  WAITING: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  RESOLVED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  CLOSED: "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  PROVISIONING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  PROCESSING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  COMPLETE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400",
};

const ARRANGEMENT_STATUS: Record<string, { color: string; icon: React.ReactNode }> = {
  PENDING: { color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: <Clock size={12} /> },
  ACTIVE: { color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <CircleDot size={12} /> },
  COMPLETED: { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: <CheckCircle2 size={12} /> },
  DEFAULTED: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <AlertTriangle size={12} /> },
  REJECTED: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <XCircle size={12} /> },
  CANCELLED: { color: "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400", icon: <XCircle size={12} /> },
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-slate-500",
  MEDIUM: "text-blue-500",
  HIGH: "text-orange-500",
  CRITICAL: "text-red-500",
};

type Tab = "tickets" | "projects" | "hosting" | "payments" | "arrangements";

// ─── Component ──────────────────────────────────────────

export default function UserProfilePage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("tickets");

  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    if (!session?.user) return;
    if (isAdmin) {
      let cancelled = false;
      (async () => {
        try {
          const res = await fetch(`/api/users/${userId}/profile`);
          if (!cancelled && res.ok) {
            setProfile(await res.json());
          } else if (!cancelled && res.status === 403) {
            router.push("/users");
          }
        } catch {
          // ignore
        }
        if (!cancelled) setLoading(false);
      })();
      return () => { cancelled = true; };
    } else {
      router.push("/dashboard");
    }
  }, [session, isAdmin, userId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20 text-slate-500">User not found</div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "tickets", label: "Tickets", icon: <Ticket size={16} />, count: profile.summary.totalTickets },
    { key: "projects", label: "Projects", icon: <FolderKanban size={16} />, count: profile.summary.totalProjects },
    { key: "hosting", label: "Hosting & Domains", icon: <Server size={16} />, count: profile.summary.totalHostingOrders },
    { key: "payments", label: "Payments", icon: <CreditCard size={16} />, count: profile.summary.totalPayments },
    { key: "arrangements", label: "Arrangements", icon: <CalendarClock size={16} />, count: profile.summary.totalArrangements },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Back Button */}
      <Link
        href="/users"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-500 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Users
      </Link>

      {/* Profile Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0 w-20 h-20 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
            <UserIcon size={36} className="text-brand-500" />
          </div>

          {/* Name & Basic Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {profile.firstName} {profile.lastName}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                profile.role === "ADMIN"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : profile.role === "EDITOR"
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              }`}>
                {profile.role}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                profile.emailConfirmed
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : profile.inviteToken
                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400"
              }`}>
                {profile.emailConfirmed ? "Active" : profile.inviteToken ? "Invited" : "Unverified"}
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">@{profile.username}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Mail size={14} className="text-slate-400" />
                <a href={`mailto:${profile.email}`} className="hover:text-brand-500">{profile.email}</a>
              </div>
              {profile.phoneNumber && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Phone size={14} className="text-slate-400" />
                  {profile.phoneNumber}
                </div>
              )}
              {profile.company && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Building2 size={14} className="text-slate-400" />
                  {profile.company}
                </div>
              )}
              {profile.position && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Briefcase size={14} className="text-slate-400" />
                  {profile.position}
                </div>
              )}
              {profile.companyAddress && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 sm:col-span-2">
                  <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                  <span className="truncate">{profile.companyAddress}</span>
                </div>
              )}
              {profile.companyVatNo && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Hash size={14} className="text-slate-400" />
                  VAT: {profile.companyVatNo}
                </div>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="flex flex-wrap gap-3 md:flex-col md:items-end">
            <div className="text-center px-4 py-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
              <p className="text-xl font-bold text-brand-500">{profile.summary.totalTickets}</p>
              <p className="text-xs text-slate-500">Tickets</p>
            </div>
            <div className="text-center px-4 py-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
              <p className="text-xl font-bold text-green-600">{formatCurrency(profile.summary.totalPaid)}</p>
              <p className="text-xs text-slate-500">Total Paid</p>
            </div>
            <div className="text-center px-4 py-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
              <p className="text-xs text-slate-500">Member since</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(profile.createdAt)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ticket Status Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {Object.entries(profile.summary.issuesByStatus).map(([status, count]) => (
          <div key={status} className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 text-center">
            <p className="text-lg font-bold text-slate-900 dark:text-white">{count}</p>
            <p className="text-xs text-slate-500">{status.replace("_", " ")}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-brand-500 text-brand-600 dark:text-brand-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tab.icon} {tab.label}
            <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs px-1.5 py-0.5 rounded-full">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* ─── Tickets ─────────────────────── */}
        {activeTab === "tickets" && (
          <div className="overflow-x-auto">
            {profile.issues.length === 0 ? (
              <div className="text-center py-12 text-slate-500"><Ticket size={32} className="mx-auto mb-2 opacity-30" />No tickets</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/30">
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase">
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {profile.issues.map((issue) => (
                    <tr key={issue.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="px-4 py-3">
                        <Link href={`/issues/${issue.id}`} className="text-brand-600 hover:underline font-medium">
                          {issue.subject}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{issue.project?.projectName || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${PRIORITY_COLORS[issue.priority] || ""}`}>{issue.priority}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TICKET_STATUS_COLORS[issue.status] || ""}`}>
                          {issue.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(issue.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ─── Projects ────────────────────── */}
        {activeTab === "projects" && (
          <div className="overflow-x-auto">
            {profile.projectAssignments.length === 0 ? (
              <div className="text-center py-12 text-slate-500"><FolderKanban size={32} className="mx-auto mb-2 opacity-30" />No projects</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/30">
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase">
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Maintenance</th>
                    <th className="px-4 py-3">Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {profile.projectAssignments.map((pa) => (
                    <tr key={pa.project.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="px-4 py-3">
                        <Link href={`/projects/${pa.project.id}`} className="text-brand-600 hover:underline font-medium">
                          {pa.project.projectName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          pa.project.status === "ACTIVE" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : pa.project.status === "COMPLETED" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400"
                        }`}>{pa.project.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {pa.project.onMaintenance ? (
                          <span className="text-green-600 dark:text-green-400 text-xs font-medium">
                            <Shield size={12} className="inline mr-1" />
                            {pa.project.maintAmount ? formatCurrency(pa.project.maintAmount) + "/mo" : "Yes"}
                          </span>
                        ) : <span className="text-slate-400 text-xs">No</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(pa.assignedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ─── Hosting & Domains ────────────── */}
        {activeTab === "hosting" && (
          <div className="overflow-x-auto">
            {profile.hostingOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-500"><Server size={32} className="mx-auto mb-2 opacity-30" />No hosting orders</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/30">
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase">
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Domain</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Expiry</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {profile.hostingOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium">
                          {order.orderType.includes("DOMAIN") ? <Globe size={12} /> : <Server size={12} />}
                          {order.orderType.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{order.domain || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{order.product?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_COLORS[order.status] || ""}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{order.amount ? formatCurrency(order.amount) : "—"}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {order.expiryDate ? formatDate(order.expiryDate) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ─── Payments ────────────────────── */}
        {activeTab === "payments" && (
          <div className="overflow-x-auto">
            {profile.payments.length === 0 ? (
              <div className="text-center py-12 text-slate-500"><CreditCard size={32} className="mx-auto mb-2 opacity-30" />No payments</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/30">
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400 uppercase">
                    <th className="px-4 py-3">Gateway</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ref</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {profile.payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                          p.gateway === "PAYFAST" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : p.gateway === "OZOW" ? "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
                          : "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                        }`}>
                          {p.gateway === "PAYFAST" && <PayFastLogo size={14} />}
                          {p.gateway === "OZOW" && <OzowLogo size={14} />}
                          {p.gateway === "EFT" && <EftIcon size={14} />}
                          {p.gateway}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-48 truncate">{p.description || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{p.invoiceNumber || "—"}</td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STATUS_COLORS[p.status] || ""}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-24 truncate">{p.gatewayRef || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ─── Payment Arrangements ─────────── */}
        {activeTab === "arrangements" && (
          <div className="p-4">
            {profile.paymentArrangements.length === 0 ? (
              <div className="text-center py-12 text-slate-500"><CalendarClock size={32} className="mx-auto mb-2 opacity-30" />No payment arrangements</div>
            ) : (
              <div className="space-y-4">
                {profile.paymentArrangements.map((arr) => {
                  const cfg = ARRANGEMENT_STATUS[arr.status] || ARRANGEMENT_STATUS.PENDING;
                  const paidCount = arr.installments.filter((i) => i.status === "PAID" || i.status === "WAIVED").length;
                  return (
                    <div key={arr.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-slate-900 dark:text-white">{arr.invoiceNumber}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                            {cfg.icon} {arr.status}
                          </span>
                        </div>
                        <div className="text-sm text-slate-500">
                          {formatCurrency(arr.totalAmount)} over {arr.numberOfMonths} month{arr.numberOfMonths > 1 ? "s" : ""}
                          <span className="mx-2">•</span>
                          {paidCount}/{arr.installments.length} paid
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {arr.installments.map((inst) => (
                          <div key={inst.installmentNo} className={`flex items-center justify-between px-3 py-2 rounded text-xs ${
                            inst.status === "PAID" ? "bg-green-50 dark:bg-green-900/20" : "bg-slate-50 dark:bg-slate-700/20"
                          }`}>
                            <span>#{inst.installmentNo} — {formatCurrency(inst.amount)}</span>
                            <span className="text-slate-400">
                              {inst.paidAt ? `Paid ${formatDate(inst.paidAt)}` : `Due ${formatDate(inst.dueDate)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
