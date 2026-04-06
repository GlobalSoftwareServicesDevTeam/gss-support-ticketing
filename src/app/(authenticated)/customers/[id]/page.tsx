"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
} from "lucide-react";
import { GitHubIcon } from "@/components/icons";

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
    }
  }, [fetchCustomer, fetchRepos, session, isAdmin, router, id]);

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
