"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Mail,
  Plus,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
  Trash2,
  Eye,
  Edit2,
  X,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  contentHtml: string | null;
  contentText: string | null;
  format: string;
  status: string;
  recipientFilter: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  sentAt: string | null;
  completedAt: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface CampaignDetail extends Campaign {
  recipients: Recipient[];
}

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  status: string;
  error: string | null;
  sentAt: string | null;
}

interface PreviewRecipient {
  email: string;
  name?: string;
  company?: string;
}

interface Customer {
  id: string;
  company: string;
  emailAddress: string;
}

export default function BulkEmailPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [detailCampaign, setDetailCampaign] = useState<CampaignDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/bulk-email?${params}`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    if (isAdmin) fetchCampaigns();
  }, [isAdmin, fetchCampaigns]);

  const openDetail = async (id: string) => {
    setShowDetail(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/bulk-email/${id}`);
      const data = await res.json();
      setDetailCampaign(data);
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Delete this campaign?")) return;
    await fetch(`/api/bulk-email/${id}`, { method: "DELETE" });
    fetchCampaigns();
    if (showDetail === id) {
      setShowDetail(null);
      setDetailCampaign(null);
    }
  };

  const sendCampaign = async (id: string) => {
    if (!confirm("Send this campaign to all resolved recipients? This cannot be undone.")) return;
    const res = await fetch(`/api/bulk-email/${id}/send`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to send");
      return;
    }
    alert("Campaign sending started!");
    fetchCampaigns();
    if (showDetail === id) openDetail(id);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500">Admin access required.</p>
      </div>
    );
  }

  const filteredCampaigns = search
    ? campaigns.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.subject.toLowerCase().includes(search.toLowerCase())
      )
    : campaigns;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Mail size={28} />
            Bulk Email
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Send bulk emails to clients and view delivery logs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchCampaigns()}
            className="p-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            <Plus size={16} />
            New Campaign
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-800 dark:text-white"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SENDING">Sending</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {/* Campaign List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Mail className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No campaigns found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCampaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
            >
              <div className="flex items-center gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDetail(campaign.id)}>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {campaign.name}
                    </h3>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <p className="text-xs text-slate-500 truncate">{campaign.subject}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>Format: {campaign.format.toUpperCase()}</span>
                    <span>Recipients: {campaign.totalRecipients}</span>
                    {campaign.sentCount > 0 && (
                      <span className="text-green-600">
                        {campaign.sentCount} sent
                      </span>
                    )}
                    {campaign.failedCount > 0 && (
                      <span className="text-red-500">
                        {campaign.failedCount} failed
                      </span>
                    )}
                    <span>
                      {new Date(campaign.createdAt).toLocaleDateString()} by {campaign.createdByName}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {campaign.status === "DRAFT" && (
                    <>
                      <button
                        onClick={() => sendCampaign(campaign.id)}
                        className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition"
                        title="Send"
                      >
                        <Send size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setShowCreate(true);
                          setEditCampaign(campaign);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => openDetail(campaign.id)}
                    className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                    title="View details"
                  >
                    <Eye size={16} />
                  </button>
                  {campaign.status !== "SENDING" && (
                    <button
                      onClick={() => deleteCampaign(campaign.id)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages} ({total} campaigns)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <CreateCampaignModal
          editCampaign={editCampaign}
          onClose={() => {
            setShowCreate(false);
            setEditCampaign(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditCampaign(null);
            fetchCampaigns();
          }}
        />
      )}

      {/* Detail Modal */}
      {showDetail && (
        <CampaignDetailModal
          campaign={detailCampaign}
          loading={detailLoading}
          onClose={() => {
            setShowDetail(null);
            setDetailCampaign(null);
          }}
          onSend={() => sendCampaign(showDetail)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    DRAFT: { bg: "bg-slate-100 dark:bg-slate-700", text: "text-slate-600 dark:text-slate-300", icon: <Edit2 size={12} /> },
    SENDING: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", icon: <Loader2 size={12} className="animate-spin" /> },
    SENT: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", icon: <CheckCircle size={12} /> },
    FAILED: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", icon: <XCircle size={12} /> },
  };
  const c = config[status] || config.DRAFT;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.icon} {status}
    </span>
  );
}

function CreateCampaignModal({
  editCampaign,
  onClose,
  onSaved,
}: {
  editCampaign?: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editCampaign?.name || "");
  const [subject, setSubject] = useState(editCampaign?.subject || "");
  const [format, setFormat] = useState(editCampaign?.format || "html");
  const [contentHtml, setContentHtml] = useState(editCampaign?.contentHtml || "");
  const [contentText, setContentText] = useState(editCampaign?.contentText || "");
  const [recipientType, setRecipientType] = useState<string>(() => {
    if (editCampaign?.recipientFilter) {
      try {
        return JSON.parse(editCampaign.recipientFilter).type || "all";
      } catch {
        return "all";
      }
    }
    return "all";
  });
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>(() => {
    if (editCampaign?.recipientFilter) {
      try {
        return JSON.parse(editCampaign.recipientFilter).customerIds || [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [customEmails, setCustomEmails] = useState(() => {
    if (editCampaign?.recipientFilter) {
      try {
        const f = JSON.parse(editCampaign.recipientFilter);
        return f.emails?.map((e: string | { email: string }) => (typeof e === "string" ? e : e.email)).join("\n") || "";
      } catch {
        return "";
      }
    }
    return "";
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);
  const [previewRecipients, setPreviewRecipients] = useState<PreviewRecipient[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/customers?limit=500");
      const data = await res.json();
      setCustomers(data.customers || []);
    };
    load();
  }, []);

  const buildFilter = () => {
    if (recipientType === "all") return { type: "all" };
    if (recipientType === "customers") return { type: "customers", customerIds: selectedCustomerIds };
    if (recipientType === "custom") {
      const emails = customEmails
        .split("\n")
        .map((e: string) => e.trim())
        .filter(Boolean);
      return { type: "custom", emails };
    }
    return { type: "all" };
  };

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) {
      alert("Name and subject are required");
      return;
    }
    if (format === "html" && !contentHtml.trim()) {
      alert("HTML content is required");
      return;
    }
    if (format === "text" && !contentText.trim()) {
      alert("Text content is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name,
        subject,
        format,
        contentHtml: format === "html" ? contentHtml : null,
        contentText: format === "text" ? contentText : contentHtml ? "" : contentText,
        recipientFilter: buildFilter(),
      };

      const url = editCampaign ? `/api/bulk-email/${editCampaign.id}` : "/api/bulk-email";
      const method = editCampaign ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to save");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const previewRecipientsHandler = async () => {
    // For new campaigns, we preview based on filter
    setPreviewLoading(true);
    try {
      if (editCampaign) {
        const res = await fetch(`/api/bulk-email/${editCampaign.id}/recipients`);
        const data = await res.json();
        setPreviewRecipients(data.recipients || []);
      } else {
        // Save as draft first to get the preview, or resolve locally
        // For simplicity, show a local estimate
        const filter = buildFilter();
        if (filter.type === "custom") {
          const emails = customEmails.split("\n").map((e: string) => e.trim()).filter(Boolean);
          setPreviewRecipients(emails.map((e: string) => ({ email: e })));
        } else {
          // Need to save first
          alert("Save the campaign as a draft first to preview recipients.");
          setPreviewLoading(false);
          return;
        }
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {editCampaign ? "Edit Campaign" : "New Campaign"}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Campaign Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. January Newsletter"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Important Update from GSS"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* Format */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Format
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <input
                    type="radio"
                    name="format"
                    value="html"
                    checked={format === "html"}
                    onChange={(e) => setFormat(e.target.value)}
                  />
                  HTML
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <input
                    type="radio"
                    name="format"
                    value="text"
                    checked={format === "text"}
                    onChange={(e) => setFormat(e.target.value)}
                  />
                  Plain Text
                </label>
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email Content {format === "html" ? "(HTML)" : "(Plain Text)"}
              </label>
              {format === "html" ? (
                <textarea
                  value={contentHtml}
                  onChange={(e) => setContentHtml(e.target.value)}
                  placeholder="<h1>Hello!</h1><p>Your email content here...</p>"
                  rows={12}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white font-mono"
                />
              ) : (
                <textarea
                  value={contentText}
                  onChange={(e) => setContentText(e.target.value)}
                  placeholder="Hello! Your email content here..."
                  rows={12}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                />
              )}
            </div>

            {/* Recipients */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Recipients
              </label>
              <select
                value={recipientType}
                onChange={(e) => setRecipientType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white mb-2"
              >
                <option value="all">All Active Customers &amp; Contacts</option>
                <option value="customers">Specific Customers</option>
                <option value="custom">Custom Email List</option>
              </select>

              {recipientType === "customers" && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                  {customers.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={selectedCustomerIds.includes(c.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCustomerIds([...selectedCustomerIds, c.id]);
                          } else {
                            setSelectedCustomerIds(selectedCustomerIds.filter((id) => id !== c.id));
                          }
                        }}
                      />
                      {c.company} ({c.emailAddress})
                    </label>
                  ))}
                </div>
              )}

              {recipientType === "custom" && (
                <textarea
                  value={customEmails}
                  onChange={(e) => setCustomEmails(e.target.value)}
                  placeholder="Enter one email per line"
                  rows={5}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm dark:bg-gray-800 dark:text-white"
                />
              )}

              <button
                onClick={previewRecipientsHandler}
                disabled={previewLoading}
                className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {previewLoading ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                Preview Recipients
              </button>

              {previewRecipients && (
                <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg p-3 max-h-36 overflow-y-auto">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {previewRecipients.length} recipient(s)
                    </span>
                    <button onClick={() => setPreviewRecipients(null)} className="text-slate-400 hover:text-slate-600">
                      <X size={14} />
                    </button>
                  </div>
                  {previewRecipients.slice(0, 50).map((r, i) => (
                    <div key={i} className="text-xs text-slate-500 py-0.5">
                      {r.name ? `${r.name} <${r.email}>` : r.email}
                      {r.company && <span className="text-slate-400 ml-1">({r.company})</span>}
                    </div>
                  ))}
                  {previewRecipients.length > 50 && (
                    <p className="text-xs text-slate-400 mt-1">...and {previewRecipients.length - 50} more</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editCampaign ? "Update Campaign" : "Create Campaign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignDetailModal({
  campaign,
  loading,
  onClose,
  onSend,
}: {
  campaign: CampaignDetail | null;
  loading: boolean;
  onClose: () => void;
  onSend: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "recipients" | "preview">("details");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Campaign Details</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X size={20} />
            </button>
          </div>

          {loading || !campaign ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={24} className="animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              {/* Campaign Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <InfoCard label="Status" value={<StatusBadge status={campaign.status} />} />
                <InfoCard label="Format" value={campaign.format.toUpperCase()} />
                <InfoCard label="Total Recipients" value={String(campaign.totalRecipients)} />
                <InfoCard
                  label="Delivery"
                  value={
                    <span>
                      <span className="text-green-600">{campaign.sentCount}</span>
                      {" / "}
                      <span className="text-red-500">{campaign.failedCount}</span>
                      {" / "}
                      {campaign.totalRecipients}
                    </span>
                  }
                />
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4">
                {(["details", "recipients", "preview"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                      activeTab === tab
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    {tab === "details" && "Details"}
                    {tab === "recipients" && `Recipients (${campaign.recipients?.length || 0})`}
                    {tab === "preview" && "Email Preview"}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === "details" && (
                <div className="space-y-4">
                  <div>
                    <span className="text-xs font-medium text-slate-500 uppercase">Name</span>
                    <p className="text-sm text-slate-900 dark:text-white">{campaign.name}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-500 uppercase">Subject</span>
                    <p className="text-sm text-slate-900 dark:text-white">{campaign.subject}</p>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-slate-500 uppercase">Created By</span>
                    <p className="text-sm text-slate-900 dark:text-white">{campaign.createdByName}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs font-medium text-slate-500 uppercase">Created</span>
                      <p className="text-sm text-slate-900 dark:text-white">
                        {new Date(campaign.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {campaign.sentAt && (
                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase">Sent At</span>
                        <p className="text-sm text-slate-900 dark:text-white">
                          {new Date(campaign.sentAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {campaign.completedAt && (
                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase">Completed</span>
                        <p className="text-sm text-slate-900 dark:text-white">
                          {new Date(campaign.completedAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "recipients" && (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {(!campaign.recipients || campaign.recipients.length === 0) ? (
                    <p className="text-sm text-slate-500 text-center py-8">
                      No recipients yet. Recipients are resolved when the campaign is sent.
                    </p>
                  ) : (
                    campaign.recipients.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                      >
                        <RecipientStatusIcon status={r.status} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-900 dark:text-white truncate">
                            {r.name ? `${r.name} <${r.email}>` : r.email}
                          </p>
                          {r.company && (
                            <p className="text-xs text-slate-400">{r.company}</p>
                          )}
                          {r.error && (
                            <p className="text-xs text-red-500 mt-0.5">{r.error}</p>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          {r.sentAt ? new Date(r.sentAt).toLocaleString() : r.status}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "preview" && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  {campaign.format === "html" ? (
                    <iframe
                      srcDoc={campaign.contentHtml || ""}
                      className="w-full h-96 bg-white"
                      sandbox=""
                      title="Email preview"
                    />
                  ) : (
                    <pre className="p-4 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap overflow-auto max-h-96">
                      {campaign.contentText || "No content"}
                    </pre>
                  )}
                </div>
              )}

              {/* Send button for drafts */}
              {campaign.status === "DRAFT" && (
                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                  <button
                    onClick={onSend}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                  >
                    <Send size={16} />
                    Send Campaign
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
      <span className="text-xs font-medium text-slate-500 uppercase">{label}</span>
      <div className="text-sm font-semibold text-slate-900 dark:text-white mt-1">{value}</div>
    </div>
  );
}

function RecipientStatusIcon({ status }: { status: string }) {
  if (status === "SENT") return <CheckCircle size={16} className="text-green-500 flex-shrink-0" />;
  if (status === "FAILED") return <XCircle size={16} className="text-red-500 flex-shrink-0" />;
  return <Clock size={16} className="text-slate-400 flex-shrink-0" />;
}
