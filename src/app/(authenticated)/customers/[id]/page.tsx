"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Building2,
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
  Mail,
  Phone,
  Star,
  Send,
  Loader2,
  Check,
  Bell,
  UserPlus,
  Shield,
  Lock,
  Unlock,
  ExternalLink,
  KeyRound,
  Eye,
  Server,
  Globe,
  LogIn,
  Smartphone,
  FileText,
  FolderOpen,
  Clock,
  ChevronDown,
  ChevronRight,
  Download,
  HardDrive,
} from "lucide-react";
import { GitHubIcon } from "@/components/icons";
import GoogleDriveManager from "@/components/google-drive-manager";

interface NotificationPref {
  id: string;
  channel: string;
  category: string;
  enabled: boolean;
  contactId: string;
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  position: string | null;
  isPrimary: boolean;
  inviteToken: string | null;
  invitedAt: string | null;
  inviteAccepted: boolean;
  userId: string | null;
  notificationPreferences: NotificationPref[];
  canViewTickets: boolean;
  canViewProjects: boolean;
  canViewBilling: boolean;
  canViewHosting: boolean;
  canViewDocuments: boolean;
  canViewCode: boolean;
  canViewNotifications: boolean;
  canManageContacts: boolean;
}

interface Customer {
  id: string;
  company: string;
  contactPerson: string;
  emailAddress: string;
  phoneNumber: string | null;
  address: string | null;
  vatNumber: string | null;
  regNumber: string | null;
  invoiceNinjaClientId: string | null;
  isActive: boolean;
  contacts: Contact[];
  _count: { issues: number };
}

interface AssignedRepo {
  id: string;
  repoId: string;
  assignedAt: string;
  repo: {
    id: string;
    fullName: string;
    description: string | null;
    htmlUrl: string;
    isPrivate: boolean;
    language: string | null;
  };
}

interface AvailableRepo {
  id: string;
  fullName: string;
  isPrivate: boolean;
  language: string | null;
}

const CATEGORIES = ["TICKETS", "INVOICES", "PAYMENTS", "PROJECTS", "HOSTING", "MAINTENANCE", "GENERAL"];

export default function CustomerDetailPage() {
  const { data: session } = useSession();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isAdmin = session?.user?.role === "ADMIN";
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    company: "",
    contactPerson: "",
    emailAddress: "",
    phoneNumber: "",
    address: "",
    vatNumber: "",
    regNumber: "",
    isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  // Contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    position: "",
    isPrimary: false,
  });
  const [contactError, setContactError] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);

  // Notification modal
  const [notifContact, setNotifContact] = useState<Contact | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});
  const [notifSaving, setNotifSaving] = useState(false);

  // Edit contact
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editContactForm, setEditContactForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    position: "",
    isPrimary: false,
  });

  // Permissions modal
  const [permContact, setPermContact] = useState<Contact | null>(null);
  const [permForm, setPermForm] = useState({
    canViewTickets: true,
    canViewProjects: true,
    canViewBilling: true,
    canViewHosting: true,
    canViewDocuments: true,
    canViewCode: true,
    canViewNotifications: true,
    canManageContacts: false,
  });
  const [permSaving, setPermSaving] = useState(false);

  // GitHub repos
  const [assignedRepos, setAssignedRepos] = useState<AssignedRepo[]>([]);
  const [allRepos, setAllRepos] = useState<AvailableRepo[]>([]);
  const [showRepoAssign, setShowRepoAssign] = useState(false);
  const [selectedRepoId, setSelectedRepoId] = useState("");

  // Vault
  const [vaultCount, setVaultCount] = useState(0);

  // Mobile Apps
  const [mobileApps, setMobileApps] = useState<{ id: string; name: string; bundleId: string; platform: string; storeUrl: string | null; iconUrl: string | null; _count: { stats: number; builds: number } }[]>([]);

  // Plesk hosting
  const [pleskLoading, setPleskLoading] = useState(true);
  const [pleskFound, setPleskFound] = useState(false);
  const [pleskCustomer, setPleskCustomer] = useState<{ id: number; login: string; name: string } | null>(null);
  const [pleskDomains, setPleskDomains] = useState<{ id: number; name: string; hosting_type: string; status: string }[]>([]);
  const [pleskLoginLoading, setPleskLoginLoading] = useState(false);

  // Registered domains
  const [customerDomains, setCustomerDomains] = useState<{ id: string; domain: string | null; status: string; expiryDate: string | null; daysLeft: number | null; expiryStatus: string; orderType: string }[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);

  // Projects & sub-projects
  const [customerProjects, setCustomerProjects] = useState<{ id: string; projectName: string; status: string; dateCreated: string; onMaintenance: boolean; _count: { issues: number; tasks: number; documents: number }; subProjects?: { id: string; name: string; status: string }[] }[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Documents
  const [customerDocuments, setCustomerDocuments] = useState<{ id: string; name: string; fileName: string; fileExt: string; fileSize: number | null; category: string; uploadedAt: string; projectId: string | null; project: { id: string; projectName: string } | null }[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);

  // Notification history (audit logs for this customer)
  const [notificationHistory, setNotificationHistory] = useState<{ id: string; action: string; entity: string; description: string; createdAt: string; userName: string | null }[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);

  const fetchCustomer = useCallback(() => {
    fetch(`/api/customers/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setActionMsg(data.error);
        } else {
          setCustomer(data);
          setEditForm({
            company: data.company,
            contactPerson: data.contactPerson,
            emailAddress: data.emailAddress,
            phoneNumber: data.phoneNumber || "",
            address: data.address || "",
            vatNumber: data.vatNumber || "",
            regNumber: data.regNumber || "",
            isActive: data.isActive,
          });
        }
        setLoading(false);
      });
  }, [id]);

  const fetchRepos = useCallback(() => {
    fetch(`/api/github/repos?search=`)
      .then((res) => {
        if (!res.ok) return [];
        return res.json();
      })
      .then((allReposData: Array<{
        id: string; fullName: string; description: string | null;
        htmlUrl: string; isPrivate: boolean; language: string | null;
        customers?: Array<{ id: string; customerId: string; assignedAt: string }>;
      }>) => {
        if (!Array.isArray(allReposData)) return;
        const assigned: AssignedRepo[] = [];
        for (const repo of allReposData) {
          const assignment = repo.customers?.find((c) => c.customerId === id);
          if (assignment) {
            assigned.push({
              id: assignment.id,
              repoId: repo.id,
              assignedAt: assignment.assignedAt,
              repo: {
                id: repo.id,
                fullName: repo.fullName,
                description: repo.description,
                htmlUrl: repo.htmlUrl,
                isPrivate: repo.isPrivate,
                language: repo.language,
              },
            });
          }
        }
        setAssignedRepos(assigned);
        setAllRepos(
          allReposData.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            isPrivate: r.isPrivate,
            language: r.language,
          }))
        );
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (session && !isAdmin) {
      router.push("/dashboard");
      return;
    }
    if (session) {
      fetchCustomer();
      fetchRepos();
      // Fetch vault count
      fetch(`/api/customers/${id}/vault`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => { if (Array.isArray(data)) setVaultCount(data.length); })
        .catch(() => {});

      // Fetch mobile apps
      fetch(`/api/mobile-apps?customerId=${id}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => { if (Array.isArray(data)) setMobileApps(data); })
        .catch(() => {});

      // Fetch Plesk hosting info
      fetch(`/api/customers/${id}/plesk`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            setPleskFound(data.found);
            setPleskCustomer(data.pleskCustomer || null);
            setPleskDomains(data.domains || []);
          }
          setPleskLoading(false);
        })
        .catch(() => setPleskLoading(false));

      // Fetch registered domains assigned to this customer
      fetch(`/api/hosting/domains/manage?customerId=${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.domains) setCustomerDomains(data.domains);
          setDomainsLoading(false);
        })
        .catch(() => setDomainsLoading(false));

      // Fetch projects for this customer
      fetch(`/api/projects`)
        .then((r) => (r.ok ? r.json() : []))
        .then(async (projects: any[]) => {
          const filtered = projects.filter((p: any) => p.customerId === id);
          // Fetch sub-projects for each project
          const withSubs = await Promise.all(
            filtered.map(async (p: any) => {
              try {
                const subRes = await fetch(`/api/projects/${p.id}/sub-projects`);
                const subs = subRes.ok ? await subRes.json() : [];
                return { ...p, subProjects: subs };
              } catch {
                return { ...p, subProjects: [] };
              }
            })
          );
          setCustomerProjects(withSubs);
          setProjectsLoading(false);

          // Fetch documents for customer's projects
          if (filtered.length > 0) {
            const allDocs: any[] = [];
            await Promise.all(
              filtered.map(async (p: any) => {
                try {
                  const docRes = await fetch(`/api/documents?projectId=${p.id}`);
                  const docs = docRes.ok ? await docRes.json() : [];
                  allDocs.push(...docs);
                } catch {}
              })
            );
            allDocs.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
            setCustomerDocuments(allDocs);
          }
          setDocumentsLoading(false);
        })
        .catch(() => {
          setProjectsLoading(false);
          setDocumentsLoading(false);
        });

      // Fetch notification history (audit logs related to this customer)
      fetch(`/api/audit-logs?entityId=${encodeURIComponent(id)}&limit=50`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.data) setNotificationHistory(data.data);
          setNotificationsLoading(false);
        })
        .catch(() => setNotificationsLoading(false));
    }
  }, [fetchCustomer, fetchRepos, session, isAdmin, router, id]);

  async function handlePleskLogin() {
    setPleskLoginLoading(true);
    try {
      const res = await fetch(`/api/customers/${id}/plesk/login`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        showMsg(data.error || "Failed to create Plesk session");
      }
    } catch {
      showMsg("Failed to create Plesk session");
    }
    setPleskLoginLoading(false);
  }

  function showMsg(msg: string) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(""), 4000);
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/customers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      fetchCustomer();
      showMsg("Customer updated successfully");
    } else {
      showMsg(data.error || "Failed to update");
    }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    setContactError("");
    setContactSubmitting(true);

    const res = await fetch(`/api/customers/${id}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contactForm),
    });
    const data = await res.json();
    setContactSubmitting(false);

    if (!res.ok) {
      setContactError(data.error || "Failed to add contact");
    } else {
      setShowContactForm(false);
      setContactForm({ firstName: "", lastName: "", email: "", phone: "", position: "", isPrimary: false });
      fetchCustomer();
      showMsg("Contact added successfully");
    }
  }

  async function handleUpdateContact() {
    if (!editingContact) return;
    const res = await fetch(`/api/customers/${id}/contacts/${editingContact.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editContactForm),
    });
    if (res.ok) {
      setEditingContact(null);
      fetchCustomer();
      showMsg("Contact updated");
    } else {
      const data = await res.json();
      showMsg(data.error || "Failed to update contact");
    }
  }

  async function handleDeleteContact(contactId: string, name: string) {
    if (!confirm(`Delete contact ${name}?`)) return;
    const res = await fetch(`/api/customers/${id}/contacts/${contactId}`, { method: "DELETE" });
    if (res.ok) {
      fetchCustomer();
      showMsg("Contact deleted");
    } else {
      const data = await res.json();
      showMsg(data.error || "Failed to delete contact");
    }
  }

  async function handleInvite(contactId: string) {
    const res = await fetch(`/api/customers/${id}/contacts/${contactId}/invite`, {
      method: "POST",
    });
    const data = await res.json();
    showMsg(data.message || data.error || "Done");
    fetchCustomer();
  }

  function openNotifModal(contact: Contact) {
    setNotifContact(contact);
    const prefs: Record<string, boolean> = {};
    for (const cat of CATEGORIES) {
      const pref = contact.notificationPreferences.find((p) => p.channel === "EMAIL" && p.category === cat);
      prefs[cat] = pref ? pref.enabled : true;
    }
    setNotifPrefs(prefs);
  }

  function openPermModal(contact: Contact) {
    setPermContact(contact);
    setPermForm({
      canViewTickets: contact.canViewTickets,
      canViewProjects: contact.canViewProjects,
      canViewBilling: contact.canViewBilling,
      canViewHosting: contact.canViewHosting,
      canViewDocuments: contact.canViewDocuments,
      canViewCode: contact.canViewCode,
      canViewNotifications: contact.canViewNotifications,
      canManageContacts: contact.canManageContacts,
    });
  }

  async function handleSavePerms() {
    if (!permContact) return;
    setPermSaving(true);
    const res = await fetch(`/api/customers/${id}/contacts/${permContact.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(permForm),
    });
    setPermSaving(false);
    if (res.ok) {
      setPermContact(null);
      fetchCustomer();
      showMsg("Permissions updated");
    } else {
      const data = await res.json();
      showMsg(data.error || "Failed to update permissions");
    }
  }

  async function handleAssignRepo() {
    if (!selectedRepoId) return;
    const res = await fetch(`/api/github/repos/${selectedRepoId}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: id }),
    });
    if (res.ok) {
      setShowRepoAssign(false);
      setSelectedRepoId("");
      fetchRepos();
      showMsg("Repository shared with customer");
    } else {
      const data = await res.json();
      showMsg(data.error || "Failed to share repository");
    }
  }

  async function handleUnassignRepo(repoId: string, repoName: string) {
    if (!confirm(`Remove "${repoName}" from this customer?`)) return;
    const res = await fetch(`/api/github/repos/${repoId}/customers/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      fetchRepos();
      showMsg("Repository unshared");
    } else {
      showMsg("Failed to remove repository");
    }
  }

  async function handleSaveNotifs() {
    if (!notifContact) return;
    setNotifSaving(true);
    const preferences = CATEGORIES.map((cat) => ({
      channel: "EMAIL",
      category: cat,
      enabled: notifPrefs[cat] ?? true,
    }));
    const res = await fetch(`/api/customers/${id}/contacts/${notifContact.id}/notifications`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences }),
    });
    setNotifSaving(false);
    if (res.ok) {
      setNotifContact(null);
      fetchCustomer();
      showMsg("Notification preferences updated");
    } else {
      showMsg("Failed to save preferences");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-500" size={32} />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 dark:text-gray-400">Customer not found</p>
        <Link href="/customers" className="text-brand-500 hover:underline mt-2 inline-block">
          Back to Customers
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/customers")} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Back to customers">
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <Building2 size={28} className="text-brand-500" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{customer.company}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{customer.emailAddress}</p>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
              <Pencil size={16} /> Edit
            </button>
          ) : (
            <>
              <button onClick={() => setEditing(false)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                <X size={16} /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
              </button>
            </>
          )}
        </div>
      </div>

      {actionMsg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          actionMsg.toLowerCase().includes("error") || actionMsg.toLowerCase().includes("failed") || actionMsg.toLowerCase().includes("not found")
            ? "bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
            : "bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
        }`}>
          {actionMsg}
        </div>
      )}

      {/* Customer Details Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name</label>
              <input type="text" value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} placeholder="Company name" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Person</label>
              <input type="text" value={editForm.contactPerson} onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })} placeholder="Contact person" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input type="email" value={editForm.emailAddress} onChange={(e) => setEditForm({ ...editForm, emailAddress: e.target.value })} placeholder="email@example.com" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
              <input type="text" value={editForm.phoneNumber} onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })} placeholder="Phone number" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <input type="text" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} placeholder="Address" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">VAT Number</label>
              <input type="text" value={editForm.vatNumber} onChange={(e) => setEditForm({ ...editForm, vatNumber: e.target.value })} placeholder="VAT number" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reg Number</label>
              <input type="text" value={editForm.regNumber} onChange={(e) => setEditForm({ ...editForm, regNumber: e.target.value })} placeholder="Registration number" className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} className="rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase mb-1">Contact Person</p>
              <p className="text-gray-900 dark:text-white">{customer.contactPerson}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase mb-1">Email</p>
              <p className="text-gray-900 dark:text-white flex items-center gap-1"><Mail size={14} /> {customer.emailAddress}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase mb-1">Phone</p>
              <p className="text-gray-900 dark:text-white flex items-center gap-1"><Phone size={14} /> {customer.phoneNumber || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase mb-1">Address</p>
              <p className="text-gray-700 dark:text-gray-300">{customer.address || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase mb-1">VAT / Reg No</p>
              <p className="text-gray-700 dark:text-gray-300">{customer.vatNumber || "—"} / {customer.regNumber || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase mb-1">Status</p>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                customer.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }`}>
                {customer.isActive ? "Active" : "Inactive"}
              </span>
              {customer.invoiceNinjaClientId && (
                <span className="ml-2 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded-full">
                  Invoice Ninja Linked
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contacts Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Contacts ({customer.contacts.length})</h2>
          <button
            onClick={() => setShowContactForm(!showContactForm)}
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm"
          >
            <Plus size={14} /> Add Contact
          </button>
        </div>

        {/* Add Contact Form */}
        {showContactForm && (
          <div className="border border-brand-200 dark:border-brand-800 rounded-lg p-4 mb-4 bg-brand-50/30 dark:bg-brand-900/10">
            {contactError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                {contactError}
              </div>
            )}
            <form onSubmit={handleAddContact} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input type="text" placeholder="First Name *" value={contactForm.firstName} onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" required />
              <input type="text" placeholder="Last Name *" value={contactForm.lastName} onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" required />
              <input type="email" placeholder="Email *" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" required />
              <input type="text" placeholder="Phone" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              <input type="text" placeholder="Position" value={contactForm.position} onChange={(e) => setContactForm({ ...contactForm, position: e.target.value })} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })} className="rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
                  Primary Contact
                </label>
                <button type="submit" disabled={contactSubmitting} className="px-3 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm disabled:opacity-50">
                  {contactSubmitting ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Contacts Table */}
        {customer.contacts.length === 0 ? (
          <div className="text-center py-10 text-gray-500 dark:text-gray-400">
            <UserPlus className="mx-auto mb-2" size={32} />
            <p>No contacts yet. Add one above or import from Invoice Ninja.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Email</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Phone</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Position</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Portal</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {customer.contacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                    {editingContact?.id === contact.id ? (
                      <>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <input type="text" value={editContactForm.firstName} onChange={(e) => setEditContactForm({ ...editContactForm, firstName: e.target.value })} placeholder="First name" className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-24" />
                            <input type="text" value={editContactForm.lastName} onChange={(e) => setEditContactForm({ ...editContactForm, lastName: e.target.value })} placeholder="Last name" className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-24" />
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <input type="email" value={editContactForm.email} onChange={(e) => setEditContactForm({ ...editContactForm, email: e.target.value })} placeholder="email@example.com" className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-40" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editContactForm.phone} onChange={(e) => setEditContactForm({ ...editContactForm, phone: e.target.value })} placeholder="Phone" className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-28" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editContactForm.position} onChange={(e) => setEditContactForm({ ...editContactForm, position: e.target.value })} placeholder="Position" className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-24" />
                        </td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button onClick={handleUpdateContact} className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" aria-label="Save contact"><Check size={14} /></button>
                            <button onClick={() => setEditingContact(null)} className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cancel editing"><X size={14} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                          <span className="font-medium">{contact.firstName} {contact.lastName}</span>
                          {contact.isPrimary && (
                            <Star size={12} className="inline ml-1 text-amber-500 fill-amber-500" />
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{contact.email}</td>
                        <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{contact.phone || "—"}</td>
                        <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{contact.position || "—"}</td>
                        <td className="px-4 py-2">
                          {contact.inviteAccepted || contact.userId ? (
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              Active
                            </span>
                          ) : contact.invitedAt ? (
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Invited
                            </span>
                          ) : (
                            <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                              Not Invited
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setEditingContact(contact);
                                setEditContactForm({
                                  firstName: contact.firstName,
                                  lastName: contact.lastName,
                                  email: contact.email,
                                  phone: contact.phone || "",
                                  position: contact.position || "",
                                  isPrimary: contact.isPrimary,
                                });
                              }}
                              className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => openNotifModal(contact)}
                              className="p-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              title="Notification Preferences"
                            >
                              <Bell size={14} />
                            </button>
                            <button
                              onClick={() => openPermModal(contact)}
                              className="p-1 rounded text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                              title="Portal Permissions"
                            >
                              <Shield size={14} />
                            </button>
                            {!contact.inviteAccepted && !contact.userId && (
                              <button
                                onClick={() => handleInvite(contact.id)}
                                className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                                title={contact.invitedAt ? "Resend Invite" : "Send Invite"}
                              >
                                <Send size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteContact(contact.id, `${contact.firstName} ${contact.lastName}`)}
                              className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Plesk Hosting Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Server size={20} className="text-brand-500" /> Hosting Information
          </h2>
          {pleskFound && pleskCustomer && (
            <button
              onClick={handlePleskLogin}
              disabled={pleskLoginLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50"
            >
              {pleskLoginLoading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
              Login to Plesk Panel
            </button>
          )}
        </div>

        {pleskLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-brand-500" size={24} />
            <span className="ml-2 text-sm text-gray-500">Checking Plesk...</span>
          </div>
        ) : !pleskFound ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Globe size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No Plesk account found matching <strong>{customer.emailAddress}</strong></p>
            <p className="text-xs text-gray-400 mt-1">The customer&apos;s email must match their Plesk account email.</p>
          </div>
        ) : (
          <div>
            {/* Plesk Account Info */}
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-xs font-medium text-blue-500 uppercase">Plesk Account</span>
                  <p className="text-gray-900 dark:text-white font-medium">{pleskCustomer?.name}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-blue-500 uppercase">Login</span>
                  <p className="text-gray-700 dark:text-gray-300">{pleskCustomer?.login}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-blue-500 uppercase">ID</span>
                  <p className="text-gray-700 dark:text-gray-300">#{pleskCustomer?.id}</p>
                </div>
              </div>
            </div>

            {/* Domains List */}
            {pleskDomains.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No domains found for this account.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Domain</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Type</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {pleskDomains.map((domain) => (
                      <tr key={domain.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                        <td className="px-4 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Globe size={14} className="text-blue-500" />
                            <span className="font-medium text-gray-900 dark:text-white">{domain.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 capitalize">
                          {domain.hosting_type}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            domain.status === "active" || domain.status === "0"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}>
                            {domain.status === "0" ? "Active" : domain.status === "active" ? "Active" : domain.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <a
                            href={`https://${domain.name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1"
                          >
                            Visit <ExternalLink size={10} />
                          </a>
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

      {/* Registered Domains Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <Globe size={20} /> Registered Domains ({customerDomains.length})
        </h2>
        {domainsLoading ? (
          <p className="text-sm text-gray-500">Loading domains...</p>
        ) : customerDomains.length === 0 ? (
          <p className="text-sm text-gray-500">No registered domains found for this customer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2 font-medium">Domain</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Expiry Date</th>
                  <th className="px-4 py-2 font-medium">Days Left</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {customerDomains.map((d: any) => (
                  <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{d.domain}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        d.orderType === 'HOSTING' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                        d.orderType === 'SSL' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        d.orderType === 'MAIL' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' :
                        'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                      }`}>
                        {d.orderType || 'DOMAIN'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        d.status === 'ACTIVE' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        d.status === 'EXPIRED' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
                      }`}>
                        {d.status || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                      {d.expiryDate ? new Date(d.expiryDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {d.daysLeft != null ? (
                        <span className={`text-xs font-medium ${
                          d.daysLeft <= 0 ? 'text-red-600' :
                          d.daysLeft <= 30 ? 'text-orange-500' :
                          d.daysLeft <= 90 ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>
                          {d.daysLeft <= 0 ? 'Expired' : `${d.daysLeft} days`}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <a
                        href={`https://${d.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1"
                      >
                        Visit <ExternalLink size={10} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* GitHub Repositories Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <GitHubIcon size={20} /> Shared Repositories ({assignedRepos.length})
          </h2>
          <button
            onClick={() => setShowRepoAssign(!showRepoAssign)}
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm"
          >
            <Plus size={14} /> Share Repo
          </button>
        </div>

        {/* Assign Repo Form */}
        {showRepoAssign && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700">
            <select
              title="Select a repository"
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="">Select a repository...</option>
              {allRepos
                .filter((r) => !assignedRepos.some((ar) => ar.repoId === r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName} {r.isPrivate ? "(Private)" : "(Public)"}
                  </option>
                ))}
            </select>
            <button
              onClick={handleAssignRepo}
              disabled={!selectedRepoId}
              className="px-3 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
            >
              Share
            </button>
            <button
              onClick={() => { setShowRepoAssign(false); setSelectedRepoId(""); }}
              className="px-3 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition text-sm"
            >
              Cancel
            </button>
          </div>
        )}

        {assignedRepos.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <GitHubIcon size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No repositories shared with this customer yet.</p>
            <p className="text-xs text-gray-400 mt-1">Click &quot;Share Repo&quot; to give them access to a repository.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignedRepos.map((ar) => (
              <div
                key={ar.id}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <GitHubIcon size={20} className="text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={ar.repo.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                      >
                        {ar.repo.fullName}
                        <ExternalLink size={12} />
                      </a>
                      {ar.repo.isPrivate ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                          <Lock size={8} /> Private
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <Unlock size={8} /> Public
                        </span>
                      )}
                      {ar.repo.language && (
                        <span className="text-xs text-gray-400">{ar.repo.language}</span>
                      )}
                    </div>
                    {ar.repo.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-md">
                        {ar.repo.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-400">
                    Shared {new Date(ar.assignedAt).toLocaleDateString()}
                  </span>
                  <Link
                    href={`/code-history/${ar.repoId}`}
                    className="text-xs text-brand-500 hover:text-brand-600 font-medium"
                  >
                    Commits
                  </Link>
                  <button
                    onClick={() => handleUnassignRepo(ar.repoId, ar.repo.fullName)}
                    className="p-1 rounded text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    title="Remove access"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile Apps Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Smartphone size={20} className="text-brand-500" /> Mobile Apps ({mobileApps.length})
          </h2>
          <Link
            href="/mobile-apps"
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm"
          >
            <Eye size={14} /> Manage Apps
          </Link>
        </div>
        {mobileApps.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No mobile apps assigned to this customer. Go to Mobile Apps to add or import apps.
          </p>
        ) : (
          <div className="space-y-2">
            {mobileApps.map((app) => (
              <div key={app.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {app.iconUrl ? (
                    <Image src={app.iconUrl} alt="" width={40} height={40} className="w-10 h-10 object-cover rounded-lg" unoptimized />
                  ) : (
                    <Smartphone size={20} className="text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{app.name}</span>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                      app.platform === "GOOGLE_PLAY"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                    }`}>
                      {app.platform === "GOOGLE_PLAY" ? "Android" : "iOS"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{app.bundleId}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span title="Builds">{app._count.builds} builds</span>
                  <span title="Stats">{app._count.stats} stats</span>
                </div>
                {app.storeUrl && (
                  <a href={app.storeUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-500 transition" title="Open in store">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Projects & Sub-Projects Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FolderOpen size={20} className="text-brand-500" /> Projects ({customerProjects.length})
          </h2>
          <Link
            href="/projects"
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm"
          >
            <Eye size={14} /> All Projects
          </Link>
        </div>
        {projectsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-brand-500" size={24} />
            <span className="ml-2 text-sm text-gray-500">Loading projects...</span>
          </div>
        ) : customerProjects.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No projects assigned to this customer.</p>
        ) : (
          <div className="space-y-2">
            {customerProjects.map((project) => (
              <div key={project.id} className="border border-gray-100 dark:border-gray-700 rounded-lg">
                <button
                  onClick={() => {
                    const next = new Set(expandedProjects);
                    next.has(project.id) ? next.delete(project.id) : next.add(project.id);
                    setExpandedProjects(next);
                  }}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition rounded-lg text-left"
                >
                  <div className="flex items-center gap-3">
                    {expandedProjects.has(project.id) ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                    <div>
                      <Link href={`/projects?id=${project.id}`} className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
                        {project.projectName}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                          project.status === "ACTIVE" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                          project.status === "ON_HOLD" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                          project.status === "COMPLETED" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                          "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                        }`}>
                          {project.status}
                        </span>
                        {project.onMaintenance && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                            Maintenance
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{project._count.issues} issues</span>
                    <span>{project._count.tasks} tasks</span>
                    <span>{project._count.documents} docs</span>
                  </div>
                </button>
                {expandedProjects.has(project.id) && project.subProjects && project.subProjects.length > 0 && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-3 pb-3">
                    <p className="text-xs font-medium text-gray-500 uppercase mt-2 mb-1 px-6">Sub-Projects</p>
                    {project.subProjects.map((sub: any) => (
                      <div key={sub.id} className="flex items-center justify-between px-6 py-1.5 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{sub.name}</span>
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                          sub.status === "ACTIVE" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                          sub.status === "ON_HOLD" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" :
                          "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        }`}>
                          {sub.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {expandedProjects.has(project.id) && (!project.subProjects || project.subProjects.length === 0) && (
                  <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-2">
                    <p className="text-xs text-gray-400">No sub-projects</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText size={20} className="text-brand-500" /> Documents ({customerDocuments.length})
          </h2>
          <Link
            href="/documents"
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm"
          >
            <Eye size={14} /> All Documents
          </Link>
        </div>
        {documentsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-brand-500" size={24} />
            <span className="ml-2 text-sm text-gray-500">Loading documents...</span>
          </div>
        ) : customerDocuments.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No documents found for this customer&apos;s projects.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Project</th>
                  <th className="px-4 py-2 font-medium">Size</th>
                  <th className="px-4 py-2 font-medium">Uploaded</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {customerDocuments.map((doc) => (
                  <tr key={doc.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{doc.name}</span>
                        <span className="text-xs text-gray-400">.{doc.fileExt}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        doc.category === "INVOICE" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" :
                        doc.category === "QUOTE" ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" :
                        doc.category === "LEGAL" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" :
                        doc.category === "PROJECT" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                        "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                      }`}>
                        {doc.category}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 text-xs">
                      {doc.project?.projectName || "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1"
                      >
                        <Download size={10} /> Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Google Drive Document Portal Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          <HardDrive size={20} className="text-green-600" /> Google Drive Documents
        </h2>
        {/* GoogleDriveManager expects isAdmin and currentUserId props */}
        {session?.user?.id && (
          <GoogleDriveManager isAdmin={isAdmin} currentUserId={session.user.id} />
        )}
      </div>

      {/* Notification History Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock size={20} className="text-brand-500" /> Activity & Notification History
          </h2>
          <Link
            href="/audit-logs"
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm"
          >
            <Eye size={14} /> All Logs
          </Link>
        </div>
        {notificationsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-brand-500" size={24} />
            <span className="ml-2 text-sm text-gray-500">Loading history...</span>
          </div>
        ) : notificationHistory.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No activity history found for this customer.</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {notificationHistory.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                <div className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${
                  log.action === "CREATE" ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                  log.action === "UPDATE" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                  log.action === "DELETE" ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                  log.action === "LOGIN" ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" :
                  "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                }`}>
                  {log.action === "CREATE" ? <Plus size={14} /> :
                   log.action === "UPDATE" ? <Pencil size={14} /> :
                   log.action === "DELETE" ? <Trash2 size={14} /> :
                   log.action === "LOGIN" ? <LogIn size={14} /> :
                   <Clock size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white">{log.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                      {log.entity}
                    </span>
                    <span className="text-xs text-gray-400">
                      {log.userName || "System"} · {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Secure Vault Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <KeyRound size={20} className="text-brand-500" /> Secure Vault ({vaultCount})
          </h2>
          <Link
            href={`/vault`}
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm"
          >
            <Eye size={14} /> Open Vault
          </Link>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {vaultCount === 0
            ? "No encrypted secrets stored yet. Open the vault to add credentials, API keys, and other sensitive data."
            : `${vaultCount} encrypted secret${vaultCount !== 1 ? "s" : ""} stored. Open the vault to view or manage.`}
        </p>
      </div>

      {/* Notification Preferences Modal */}
      {notifContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Notification Preferences
              </h3>
              <button onClick={() => setNotifContact(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {notifContact.firstName} {notifContact.lastName} ({notifContact.email})
            </p>
            <div className="space-y-3">
              {CATEGORIES.map((cat) => (
                <label key={cat} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{cat.toLowerCase().replace(/_/g, " ")}</span>
                  <button
                    type="button"
                    onClick={() => setNotifPrefs({ ...notifPrefs, [cat]: !notifPrefs[cat] })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notifPrefs[cat] ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notifPrefs[cat] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setNotifContact(null)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm">
                Cancel
              </button>
              <button onClick={handleSaveNotifs} disabled={notifSaving} className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm disabled:opacity-50">
                {notifSaving ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal Permissions Modal */}
      {permContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Shield size={18} className="text-purple-500" /> Portal Permissions
              </h3>
              <button onClick={() => setPermContact(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              {permContact.firstName} {permContact.lastName} ({permContact.email})
            </p>
            {permContact.isPrimary && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1">
                <Star size={12} className="fill-amber-500" /> Primary contacts always have full access
              </p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Control what this contact can see in the portal when they log in.
            </p>
            <div className="space-y-3">
              {([
                { key: "canViewTickets", label: "View Tickets" },
                { key: "canViewProjects", label: "View Projects" },
                { key: "canViewBilling", label: "View Billing & Invoices" },
                { key: "canViewHosting", label: "View Hosting & Domains" },
                { key: "canViewDocuments", label: "View Documents" },
                { key: "canViewCode", label: "View Code History" },
                { key: "canViewNotifications", label: "View Notifications" },
                { key: "canManageContacts", label: "Manage Contacts" },
              ] as const).map(({ key, label }) => (
                <label key={key} className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  <button
                    type="button"
                    onClick={() => setPermForm({ ...permForm, [key]: !permForm[key] })}
                    disabled={permContact.isPrimary}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      permContact.isPrimary || permForm[key] ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"
                    } ${permContact.isPrimary ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        permContact.isPrimary || permForm[key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setPermContact(null)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm">
                Cancel
              </button>
              <button onClick={handleSavePerms} disabled={permSaving || permContact.isPrimary} className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm disabled:opacity-50">
                {permSaving ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
