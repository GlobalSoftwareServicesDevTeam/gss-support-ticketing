"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  KeyRound,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  Shield,
  Check,
  Server,
  Database,
  Globe,
  Mail,
  HardDrive,
  FolderKey,
  Search,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface VaultField {
  key: string;
  value: string;
  sensitive?: boolean; // true = password field, default false
}

interface VaultNote {
  id: string;
  label: string;
  category: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  fields: VaultField[] | null;
}

interface CustomerCtx {
  linked: boolean;
  isAdmin: boolean;
  customer: { id: string; company: string } | null;
}

const CATEGORIES = [
  { value: "GENERAL", label: "General", icon: <FolderKey size={16} /> },
  { value: "HOSTING", label: "Hosting", icon: <Server size={16} /> },
  { value: "DATABASE", label: "Database", icon: <Database size={16} /> },
  { value: "API", label: "API Keys", icon: <Globe size={16} /> },
  { value: "EMAIL", label: "Email", icon: <Mail size={16} /> },
  { value: "FTP", label: "FTP / SFTP", icon: <HardDrive size={16} /> },
  { value: "OTHER", label: "Other", icon: <Shield size={16} /> },
];

const CATEGORY_COLORS: Record<string, string> = {
  GENERAL: "bg-slate-100 text-slate-600 dark:bg-slate-700/30 dark:text-slate-400",
  HOSTING: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  DATABASE: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  API: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  EMAIL: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  FTP: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400",
  OTHER: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
};

// Common field templates
const FIELD_TEMPLATES: Record<string, VaultField[]> = {
  HOSTING: [
    { key: "URL", value: "", sensitive: false },
    { key: "Username", value: "", sensitive: false },
    { key: "Password", value: "", sensitive: true },
  ],
  DATABASE: [
    { key: "Host", value: "", sensitive: false },
    { key: "Port", value: "", sensitive: false },
    { key: "Database", value: "", sensitive: false },
    { key: "Username", value: "", sensitive: false },
    { key: "Password", value: "", sensitive: true },
  ],
  API: [
    { key: "Base URL", value: "", sensitive: false },
    { key: "API Key", value: "", sensitive: true },
    { key: "Secret", value: "", sensitive: true },
  ],
  EMAIL: [
    { key: "Server", value: "", sensitive: false },
    { key: "Port", value: "", sensitive: false },
    { key: "Email", value: "", sensitive: false },
    { key: "Password", value: "", sensitive: true },
  ],
  FTP: [
    { key: "Host", value: "", sensitive: false },
    { key: "Port", value: "21", sensitive: false },
    { key: "Username", value: "", sensitive: false },
    { key: "Password", value: "", sensitive: true },
  ],
  GENERAL: [
    { key: "Username", value: "", sensitive: false },
    { key: "Password", value: "", sensitive: true },
  ],
  OTHER: [
    { key: "Key", value: "", sensitive: false },
    { key: "Value", value: "", sensitive: true },
  ],
};

// ─── Component ──────────────────────────────────────────

export default function VaultPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [ctx, setCtx] = useState<CustomerCtx | null>(null);
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // Reveal state — which notes have decrypted values
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [decrypting, setDecrypting] = useState<string | null>(null);

  // Copied feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<VaultNote | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formCategory, setFormCategory] = useState("GENERAL");
  const [formNotes, setFormNotes] = useState("");
  const [formFields, setFormFields] = useState<VaultField[]>([
    { key: "Username", value: "", sensitive: false },
    { key: "Password", value: "", sensitive: true },
  ]);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Load customer context
  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;

    fetch("/api/customer-context")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setCtx(data);
        if (!data.linked && !data.isAdmin) {
          router.push("/dashboard");
        }
      })
      .catch(() => {
        if (!cancelled) router.push("/dashboard");
      });

    return () => { cancelled = true; };
  }, [session, router]);

  // Load vault notes once we have customer context
  useEffect(() => {
    if (!ctx?.customer?.id) return;
    let cancelled = false;

    fetch(`/api/customers/${ctx.customer.id}/vault`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setNotes(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ctx]);

  function refreshNotes() {
    if (!ctx?.customer?.id) return;
    fetch(`/api/customers/${ctx.customer.id}/vault`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setNotes(data);
      });
  }

  async function handleReveal(noteId: string) {
    if (revealedIds.has(noteId)) {
      // Hide it
      setRevealedIds((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
      // Clear decrypted fields from local state
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, fields: null } : n))
      );
      return;
    }

    if (!ctx?.customer?.id) return;
    setDecrypting(noteId);

    try {
      const res = await fetch(
        `/api/customers/${ctx.customer.id}/vault/${noteId}`
      );
      if (res.ok) {
        const data = await res.json();
        setNotes((prev) =>
          prev.map((n) => (n.id === noteId ? { ...n, fields: data.fields } : n))
        );
        setRevealedIds((prev) => new Set(prev).add(noteId));
      }
    } catch {
      // ignore
    }

    setDecrypting(null);
  }

  async function handleCopy(value: string, fieldId: string) {
    await navigator.clipboard.writeText(value);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function openCreate() {
    setEditingNote(null);
    setFormLabel("");
    setFormCategory("GENERAL");
    setFormNotes("");
    setFormFields([...FIELD_TEMPLATES.GENERAL]);
    setFormError("");
    setShowModal(true);
  }

  async function openEdit(note: VaultNote) {
    if (!ctx?.customer?.id) return;
    setEditingNote(note);
    setFormLabel(note.label);
    setFormCategory(note.category);
    setFormNotes(note.notes || "");
    setFormError("");

    // Need to decrypt to edit
    if (note.fields) {
      setFormFields(note.fields);
    } else {
      try {
        const res = await fetch(
          `/api/customers/${ctx.customer.id}/vault/${note.id}`
        );
        if (res.ok) {
          const data = await res.json();
          setFormFields(data.fields || []);
        }
      } catch {
        setFormFields([{ key: "Key", value: "", sensitive: false }]);
      }
    }

    setShowModal(true);
  }

  async function handleSave() {
    if (!ctx?.customer?.id) return;
    if (!formLabel.trim()) {
      setFormError("Label is required");
      return;
    }
    if (formFields.length === 0 || formFields.every((f) => !f.key.trim())) {
      setFormError("At least one field is required");
      return;
    }

    setFormSaving(true);
    setFormError("");

    const payload = {
      label: formLabel.trim(),
      category: formCategory,
      notes: formNotes.trim() || null,
      fields: formFields.filter((f) => f.key.trim()),
    };

    const url = editingNote
      ? `/api/customers/${ctx.customer.id}/vault/${editingNote.id}`
      : `/api/customers/${ctx.customer.id}/vault`;

    const res = await fetch(url, {
      method: editingNote ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setFormSaving(false);

    if (res.ok) {
      setShowModal(false);
      // Clear reveal for edited note so it re-fetches fresh
      if (editingNote) {
        setRevealedIds((prev) => {
          const next = new Set(prev);
          next.delete(editingNote.id);
          return next;
        });
      }
      refreshNotes();
    } else {
      const data = await res.json();
      setFormError(data.error || "Failed to save");
    }
  }

  async function handleDelete(noteId: string, label: string) {
    if (!confirm(`Delete "${label}" from the vault? This cannot be undone.`))
      return;
    if (!ctx?.customer?.id) return;

    const res = await fetch(
      `/api/customers/${ctx.customer.id}/vault/${noteId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      refreshNotes();
    }
  }

  function handleCategoryChange(cat: string) {
    setFormCategory(cat);
    // If creating new (not editing), auto-populate fields from template
    if (!editingNote) {
      setFormFields([...(FIELD_TEMPLATES[cat] || FIELD_TEMPLATES.GENERAL)]);
    }
  }

  function addField() {
    setFormFields([...formFields, { key: "", value: "", sensitive: false }]);
  }

  function removeField(index: number) {
    setFormFields(formFields.filter((_, i) => i !== index));
  }

  function updateField(
    index: number,
    updates: Partial<VaultField>
  ) {
    setFormFields(
      formFields.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  }

  // Filtered notes
  const filteredNotes = notes.filter((n) => {
    if (filterCategory && n.category !== filterCategory) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        n.label.toLowerCase().includes(s) ||
        (n.notes || "").toLowerCase().includes(s) ||
        n.category.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const isAdmin = ctx?.isAdmin;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  if (!ctx?.linked && !ctx?.isAdmin) {
    return (
      <div className="text-center py-20">
        <KeyRound className="mx-auto mb-3 text-gray-300 dark:text-gray-600" size={48} />
        <p className="text-gray-500 dark:text-gray-400">Your account is not linked to any company.</p>
        <Link href="/dashboard" className="text-brand-500 hover:underline mt-2 inline-block text-sm">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound size={28} className="text-brand-500" /> Secure Vault
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {ctx?.customer?.company
              ? `Encrypted credentials for ${ctx.customer.company}`
              : "Encrypted credentials & sensitive information"}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600 transition shadow-sm"
        >
          <Plus size={16} /> Add Secret
        </button>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vault..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
          />
        </div>
        <select
          title="Filter by category"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Vault Notes */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <Shield size={48} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">
            {notes.length === 0
              ? "No secrets stored yet. Click \"Add Secret\" to get started."
              : "No results match your search."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredNotes.map((note) => {
            const revealed = revealedIds.has(note.id);
            const catColor = CATEGORY_COLORS[note.category] || CATEGORY_COLORS.OTHER;
            const catInfo = CATEGORIES.find((c) => c.value === note.category);

            return (
              <div
                key={note.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
              >
                {/* Note Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${catColor}`}>
                      {catInfo?.icon} {catInfo?.label || note.category}
                    </span>
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                      {note.label}
                    </h3>
                    {note.notes && (
                      <span className="text-xs text-slate-400 truncate max-w-xs hidden sm:inline">
                        — {note.notes}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleReveal(note.id)}
                      disabled={decrypting === note.id}
                      className={`p-2 rounded-lg transition text-sm ${
                        revealed
                          ? "text-amber-500 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                          : "text-slate-400 hover:text-brand-500 hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                      title={revealed ? "Hide values" : "Reveal values"}
                    >
                      {decrypting === note.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : revealed ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(note)}
                      className="p-2 rounded-lg text-slate-400 hover:text-brand-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(note.id, note.label)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Fields */}
                {revealed && note.fields && (
                  <div className="px-5 py-3 space-y-2">
                    {note.fields.map((field, i) => {
                      const fieldId = `${note.id}-${i}`;
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-3 py-1.5"
                        >
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-28 flex-shrink-0 text-right">
                            {field.key}
                          </span>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {field.sensitive ? (
                              <code className="text-sm font-mono bg-slate-50 dark:bg-slate-700/50 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 flex-1 min-w-0 truncate">
                                {field.value}
                              </code>
                            ) : (
                              <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 min-w-0 truncate">
                                {field.value || "—"}
                              </span>
                            )}
                            {field.value && (
                              <button
                                onClick={() =>
                                  handleCopy(field.value, fieldId)
                                }
                                className="p-1.5 rounded text-slate-400 hover:text-brand-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition flex-shrink-0"
                                title="Copy"
                              >
                                {copiedField === fieldId ? (
                                  <Check size={14} className="text-green-500" />
                                ) : (
                                  <Copy size={14} />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {note.notes && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                        <p className="text-xs text-slate-400">{note.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsed info */}
                {!revealed && (
                  <div className="px-5 py-3 flex items-center gap-2 text-xs text-slate-400">
                    <Shield size={12} />
                    <span>Encrypted — click the eye icon to reveal</span>
                    <span className="ml-auto">
                      Updated {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between z-10">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <KeyRound size={18} className="text-brand-500" />
                {editingNote ? "Edit Secret" : "Add Secret"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Close"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  {formError}
                </div>
              )}

              {/* Label */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Label *
                </label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="e.g. cPanel Login, FTP Credentials"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => handleCategoryChange(cat.value)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                        formCategory === cat.value
                          ? "bg-brand-500 text-white"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                      }`}
                    >
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description <span className="text-slate-400 font-normal">(optional, not encrypted)</span>
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Production server, staging DB"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>

              {/* Fields */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Fields <span className="text-slate-400 font-normal">(encrypted)</span>
                  </label>
                  <button
                    type="button"
                    onClick={addField}
                    className="text-xs text-brand-500 hover:text-brand-600 font-medium flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Field
                  </button>
                </div>
                <div className="space-y-2">
                  {formFields.map((field, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={field.key}
                        onChange={(e) =>
                          updateField(i, { key: e.target.value })
                        }
                        placeholder="Field name"
                        className="w-1/3 px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                      <input
                        type={field.sensitive ? "password" : "text"}
                        value={field.value}
                        onChange={(e) =>
                          updateField(i, { value: e.target.value })
                        }
                        placeholder={
                          field.sensitive ? "••••••••" : "Value"
                        }
                        className="flex-1 px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateField(i, { sensitive: !field.sensitive })
                        }
                        className={`p-2 rounded-lg transition ${
                          field.sensitive
                            ? "text-amber-500 bg-amber-50 dark:bg-amber-900/20"
                            : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                        title={field.sensitive ? "Sensitive (hidden by default)" : "Not sensitive"}
                        aria-label={field.sensitive ? "Mark as not sensitive" : "Mark as sensitive"}
                      >
                        {field.sensitive ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                      {formFields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeField(i)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                          title="Remove field"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={formSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition text-sm disabled:opacity-50"
                >
                  {formSaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  {formSaving
                    ? "Encrypting..."
                    : editingNote
                    ? "Update"
                    : "Save & Encrypt"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
