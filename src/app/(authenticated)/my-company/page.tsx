"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Ticket,
  FolderKanban,
  Receipt,
  Server,
  FileText,
  GitCommit,
  Users,
  Mail,
  Phone,
  MapPin,
  Star,
  Shield,
  Loader2,
  X,
  Bell,
} from "lucide-react";

interface CustomerPermissions {
  tickets: boolean;
  projects: boolean;
  billing: boolean;
  hosting: boolean;
  documents: boolean;
  code: boolean;
  notifications: boolean;
  manageContacts: boolean;
}

interface ContactInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  position: string | null;
  isPrimary: boolean;
  userId: string | null;
}

interface CustomerContext {
  linked: boolean;
  isAdmin: boolean;
  customer: {
    id: string;
    company: string;
    phoneNumber: string | null;
    contactPerson: string;
    emailAddress: string;
    address: string | null;
    vatNumber: string | null;
    regNumber: string | null;
    isActive: boolean;
    contacts: ContactInfo[];
    stats: { tickets: number; repos: number };
  } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isPrimary: boolean;
    position: string | null;
  } | null;
  permissions: CustomerPermissions | null;
}

interface DashboardCounts {
  tickets: number;
  projects: number;
  payments: number;
  hostingOrders: number;
  documents: number;
}

const PERMISSION_LABELS: { key: keyof CustomerPermissions; label: string; icon: React.ReactNode; path: string; color: string }[] = [
  { key: "tickets", label: "Tickets", icon: <Ticket size={20} />, path: "/issues", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" },
  { key: "projects", label: "Projects", icon: <FolderKanban size={20} />, path: "/projects", color: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400" },
  { key: "billing", label: "Billing & Invoices", icon: <Receipt size={20} />, path: "/invoices", color: "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" },
  { key: "hosting", label: "Hosting & Domains", icon: <Server size={20} />, path: "/hosting", color: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" },
  { key: "documents", label: "Documents", icon: <FileText size={20} />, path: "/documents", color: "bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400" },
  { key: "code", label: "Code History", icon: <GitCommit size={20} />, path: "/code-history", color: "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400" },
  { key: "notifications", label: "Notifications", icon: <Bell size={20} />, path: "/notification-preferences", color: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" },
];

// Permission management
const PERM_FIELDS: { key: keyof CustomerPermissions; label: string }[] = [
  { key: "tickets", label: "View Tickets" },
  { key: "projects", label: "View Projects" },
  { key: "billing", label: "View Billing & Invoices" },
  { key: "hosting", label: "View Hosting & Domains" },
  { key: "documents", label: "View Documents" },
  { key: "code", label: "View Code History" },
  { key: "notifications", label: "View Notifications" },
  { key: "manageContacts", label: "Manage Contacts" },
];

export default function MyCompanyPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [ctx, setCtx] = useState<CustomerContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<DashboardCounts>({
    tickets: 0,
    projects: 0,
    payments: 0,
    hostingOrders: 0,
    documents: 0,
  });

  // Permission management for primary contacts
  const [permContact, setPermContact] = useState<ContactInfo | null>(null);
  const [permForm, setPermForm] = useState<Record<string, boolean>>({});
  const [permSaving, setPermSaving] = useState(false);
  const [permMsg, setPermMsg] = useState("");

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/customer-context");
        const data = await res.json();
        if (cancelled) return;
        setCtx(data);
        if (!data.linked && !data.isAdmin) {
          router.push("/dashboard");
          return;
        }
      } catch {
        if (!cancelled) router.push("/dashboard");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session, router]);

  // Fetch summary counts when context is loaded
  useEffect(() => {
    if (!ctx?.linked) return;
    const perms = ctx.permissions;
    if (!perms) return;

    const fetches: Promise<void>[] = [];

    if (perms.tickets) {
      fetches.push(
        fetch("/api/issues?limit=1")
          .then((r) => r.json())
          .then((d) => setCounts((c) => ({ ...c, tickets: d.total || 0 })))
          .catch(() => {})
      );
    }
    if (perms.projects) {
      fetches.push(
        fetch("/api/projects?limit=1")
          .then((r) => r.json())
          .then((d) => setCounts((c) => ({ ...c, projects: Array.isArray(d) ? d.length : d.total || 0 })))
          .catch(() => {})
      );
    }
    if (perms.hosting) {
      fetches.push(
        fetch("/api/hosting/orders")
          .then((r) => r.json())
          .then((d) => setCounts((c) => ({ ...c, hostingOrders: Array.isArray(d) ? d.length : 0 })))
          .catch(() => {})
      );
    }

    Promise.all(fetches);
  }, [ctx]);

  async function openPermEditor(contact: ContactInfo) {
    setPermContact(contact);
    setPermMsg("");
    // Fetch the contact's current permissions from the full contact record
    try {
      const res = await fetch(`/api/customers/${ctx?.customer?.id}/contacts/${contact.id}`);
      if (res.ok) {
        const data = await res.json();
        setPermForm({
          canViewTickets: data.canViewTickets ?? true,
          canViewProjects: data.canViewProjects ?? true,
          canViewBilling: data.canViewBilling ?? true,
          canViewHosting: data.canViewHosting ?? true,
          canViewDocuments: data.canViewDocuments ?? true,
          canViewCode: data.canViewCode ?? true,
          canViewNotifications: data.canViewNotifications ?? true,
          canManageContacts: data.canManageContacts ?? false,
        });
      }
    } catch {
      // Default all true
      setPermForm({
        canViewTickets: true,
        canViewProjects: true,
        canViewBilling: true,
        canViewHosting: true,
        canViewDocuments: true,
        canViewCode: true,
        canViewNotifications: true,
        canManageContacts: false,
      });
    }
  }

  async function handleSavePerms() {
    if (!permContact || !ctx?.customer) return;
    setPermSaving(true);
    try {
      const res = await fetch(`/api/customers/${ctx.customer.id}/contacts/${permContact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(permForm),
      });
      if (res.ok) {
        setPermContact(null);
        setPermMsg("Permissions updated");
        setTimeout(() => setPermMsg(""), 3000);
      } else {
        const data = await res.json();
        setPermMsg(data.error || "Failed to update");
      }
    } catch {
      setPermMsg("Failed to update permissions");
    }
    setPermSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-500" size={32} />
      </div>
    );
  }

  if (!ctx?.linked || !ctx.customer || !ctx.contact) {
    return (
      <div className="text-center py-20">
        <Building2 className="mx-auto mb-3 text-gray-300 dark:text-gray-600" size={48} />
        <p className="text-gray-500 dark:text-gray-400">
          Your account is not linked to any company.
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          Contact your administrator or company primary contact to get linked.
        </p>
        <Link href="/dashboard" className="text-brand-500 hover:underline mt-4 inline-block text-sm">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { customer, contact, permissions } = ctx;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Building2 size={28} className="text-brand-500" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{customer.company}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {contact.isPrimary ? "Primary Contact" : contact.position || "Contact"} · {contact.firstName} {contact.lastName}
          </p>
        </div>
        {customer.isActive ? (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Active
          </span>
        ) : (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            Inactive
          </span>
        )}
      </div>

      {permMsg && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
          {permMsg}
        </div>
      )}

      {/* Company Info Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Company Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Users size={16} className="text-gray-400" />
            <span className="font-medium">Contact:</span> {customer.contactPerson}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Mail size={16} className="text-gray-400" />
            <span className="font-medium">Email:</span> {customer.emailAddress}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Phone size={16} className="text-gray-400" />
            <span className="font-medium">Phone:</span> {customer.phoneNumber || "—"}
          </div>
          {customer.address && (
            <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
              <MapPin size={16} className="text-gray-400 mt-0.5" />
              <span className="font-medium">Address:</span> {customer.address}
            </div>
          )}
          {(customer.vatNumber || customer.regNumber) && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              VAT: {customer.vatNumber || "—"} · Reg: {customer.regNumber || "—"}
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {permissions?.tickets && (
          <Link href="/issues" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:border-brand-300 dark:hover:border-brand-600 transition group">
            <div className="flex items-center gap-2 mb-1">
              <Ticket size={16} className="text-blue-500" />
              <span className="text-xs font-medium text-gray-400 uppercase">Tickets</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.tickets}</p>
          </Link>
        )}
        {permissions?.projects && (
          <Link href="/projects" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:border-brand-300 dark:hover:border-brand-600 transition group">
            <div className="flex items-center gap-2 mb-1">
              <FolderKanban size={16} className="text-purple-500" />
              <span className="text-xs font-medium text-gray-400 uppercase">Projects</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.projects}</p>
          </Link>
        )}
        {permissions?.hosting && (
          <Link href="/hosting" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:border-brand-300 dark:hover:border-brand-600 transition group">
            <div className="flex items-center gap-2 mb-1">
              <Server size={16} className="text-orange-500" />
              <span className="text-xs font-medium text-gray-400 uppercase">Hosting</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts.hostingOrders}</p>
          </Link>
        )}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-teal-500" />
            <span className="text-xs font-medium text-gray-400 uppercase">Contacts</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{customer.contacts.length}</p>
        </div>
      </div>

      {/* Quick Access Cards */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {PERMISSION_LABELS.map(({ key, label, icon, path, color }) => {
            if (!permissions?.[key]) return null;
            return (
              <Link
                key={key}
                href={path}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-600 transition group"
              >
                <span className={`p-2 rounded-lg ${color}`}>{icon}</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-brand-500 transition">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Team / Contacts */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Team ({customer.contacts.length})
          </h2>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {customer.contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 font-medium text-sm">
                  {c.firstName[0]}{c.lastName[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {c.firstName} {c.lastName}
                    {c.isPrimary && <Star size={12} className="inline ml-1 text-amber-500 fill-amber-500" />}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {c.position || c.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.userId ? (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Active
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                    Pending
                  </span>
                )}
                {(permissions?.manageContacts || contact.isPrimary) && !c.isPrimary && (
                  <button
                    onClick={() => openPermEditor(c)}
                    className="p-1 rounded text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    title="Manage Permissions"
                  >
                    <Shield size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Permissions Modal */}
      {permContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Shield size={18} className="text-purple-500" /> Manage Permissions
              </h3>
              <button onClick={() => setPermContact(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {permContact.firstName} {permContact.lastName} ({permContact.email})
            </p>
            <div className="space-y-3">
              {PERM_FIELDS.map(({ key, label }) => {
                const actualKey = key === "manageContacts" ? "canManageContacts" : `canView${key.charAt(0).toUpperCase()}${key.slice(1)}`;
                return (
                  <label key={key} className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                    <button
                      type="button"
                      onClick={() => setPermForm({ ...permForm, [actualKey]: !permForm[actualKey] })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        permForm[actualKey] ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          permForm[actualKey] ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setPermContact(null)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm">
                Cancel
              </button>
              <button onClick={handleSavePerms} disabled={permSaving} className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm disabled:opacity-50">
                {permSaving ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
