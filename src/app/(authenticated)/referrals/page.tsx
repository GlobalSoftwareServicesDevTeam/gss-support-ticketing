"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Gift,
  Search,
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Trash2,
  Pencil,
  X,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  Building2,
} from "lucide-react";

interface Referral {
  id: string;
  referrerName: string;
  referrerEmail: string;
  referrerPhone: string | null;
  refereeName: string;
  refereeEmail: string;
  refereePhone: string | null;
  refereeCompany: string | null;
  service: string | null;
  notes: string | null;
  status: string;
  commissionRate: number;
  commissionAmount: number | null;
  dealValue: number | null;
  paidAt: string | null;
  convertedAt: string | null;
  createdAt: string;
  customer: { id: string; company: string } | null;
}

const STATUS_OPTIONS = ["PENDING", "CONTACTED", "CONVERTED", "PAID", "CANCELLED"];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  CONTACTED: "bg-blue-100 text-blue-800",
  CONVERTED: "bg-green-100 text-green-800",
  PAID: "bg-purple-100 text-purple-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default function ReferralsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    referrerName: "",
    referrerEmail: "",
    referrerPhone: "",
    refereeName: "",
    refereeEmail: "",
    refereePhone: "",
    refereeCompany: "",
    service: "",
    notes: "",
    status: "PENDING",
    commissionRate: "10",
    commissionAmount: "",
    dealValue: "",
  });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Actions
  const [actionMsg, setActionMsg] = useState("");
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  // Detail panel
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);

  function fetchReferrals() {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/referrals?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setReferrals(data.referrals || []);
        setTotal(data.total || 0);
        setLoading(false);
      });
  }

  useEffect(() => {
    if (session) fetchReferrals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, session]);

  function resetForm() {
    setForm({
      referrerName: "",
      referrerEmail: "",
      referrerPhone: "",
      refereeName: "",
      refereeEmail: "",
      refereePhone: "",
      refereeCompany: "",
      service: "",
      notes: "",
      status: "PENDING",
      commissionRate: "10",
      commissionAmount: "",
      dealValue: "",
    });
    setEditingId(null);
    setFormError("");
  }

  function openEdit(referral: Referral) {
    setEditingId(referral.id);
    setForm({
      referrerName: referral.referrerName,
      referrerEmail: referral.referrerEmail,
      referrerPhone: referral.referrerPhone || "",
      refereeName: referral.refereeName,
      refereeEmail: referral.refereeEmail,
      refereePhone: referral.refereePhone || "",
      refereeCompany: referral.refereeCompany || "",
      service: referral.service || "",
      notes: referral.notes || "",
      status: referral.status,
      commissionRate: String(referral.commissionRate),
      commissionAmount: referral.commissionAmount != null ? String(referral.commissionAmount) : "",
      dealValue: referral.dealValue != null ? String(referral.dealValue) : "",
    });
    setShowForm(true);
    setActionMenu(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    const url = editingId ? `/api/referrals/${editingId}` : "/api/referrals";
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        commissionRate: parseFloat(form.commissionRate) || 10,
        commissionAmount: form.commissionAmount ? parseFloat(form.commissionAmount) : null,
        dealValue: form.dealValue ? parseFloat(form.dealValue) : null,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setFormError(data.error || "Failed to save referral");
    } else {
      setShowForm(false);
      resetForm();
      setActionMsg(editingId ? "Referral updated!" : "Referral created!");
      fetchReferrals();
      setTimeout(() => setActionMsg(""), 4000);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this referral?")) return;
    const res = await fetch(`/api/referrals/${id}`, { method: "DELETE" });
    if (res.ok) {
      setActionMsg("Referral deleted.");
      fetchReferrals();
      if (selectedReferral?.id === id) setSelectedReferral(null);
      setTimeout(() => setActionMsg(""), 4000);
    }
    setActionMenu(null);
  }

  async function handleStatusChange(id: string, newStatus: string) {
    const res = await fetch(`/api/referrals/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setActionMsg(`Status changed to ${newStatus}`);
      fetchReferrals();
      setTimeout(() => setActionMsg(""), 4000);
    }
  }

  const totalPages = Math.ceil(total / limit);

  // Stats
  const stats = {
    total: total,
    pending: referrals.filter((r) => r.status === "PENDING").length,
    converted: referrals.filter((r) => r.status === "CONVERTED" || r.status === "PAID").length,
    totalCommission: referrals
      .filter((r) => r.commissionAmount != null)
      .reduce((sum, r) => sum + (r.commissionAmount || 0), 0),
  };

  if (!session) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Gift className="text-indigo-600" size={28} />
            Referrals
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage referrals and track commissions
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm"
        >
          <Plus size={16} />
          New Referral
        </button>
      </div>

      {/* Action Message */}
      {actionMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm">
          {actionMsg}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
            <Users size={14} />
            Total Referrals
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-yellow-600 text-xs mb-1">
            <Clock size={14} />
            Pending
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
            <CheckCircle2 size={14} />
            Converted
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.converted}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-purple-600 text-xs mb-1">
            <DollarSign size={14} />
            Commission
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            R{stats.totalCommission.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search referrals..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          title="Filter by status"
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        ) : referrals.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Gift size={48} className="mx-auto mb-3 opacity-40" />
            <p>No referrals found</p>
            <p className="text-xs mt-1">Click &quot;New Referral&quot; to create one</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                <th className="px-4 py-3">Referrer</th>
                <th className="px-4 py-3">Referee</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                  onClick={() => setSelectedReferral(r)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{r.referrerName}</div>
                    <div className="text-xs text-gray-500">{r.referrerEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{r.refereeName}</div>
                    <div className="text-xs text-gray-500">{r.refereeEmail}</div>
                    {r.refereeCompany && (
                      <div className="text-xs text-gray-400">{r.refereeCompany}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {r.service || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <select
                        value={r.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleStatusChange(r.id, e.target.value)}
                        title="Change status"
                        className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATUS_COLORS[r.status] || "bg-gray-100 text-gray-800"}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[r.status] || "bg-gray-100 text-gray-800"}`}>
                        {r.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {r.commissionAmount != null
                      ? `R${r.commissionAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`
                      : r.commissionRate
                        ? `${r.commissionRate}%`
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(r.createdAt).toLocaleDateString("en-ZA")}
                  </td>
                  <td className="px-4 py-3 relative">
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionMenu(actionMenu === r.id ? null : r.id);
                        }}
                        title="Actions"
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        <MoreVertical size={16} />
                      </button>
                    )}
                    {actionMenu === r.id && (
                      <div className="absolute right-4 top-10 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-36">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(r);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(r.id);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-red-600"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              title="Previous page"
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              title="Next page"
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {selectedReferral && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedReferral(null)}>
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Referral Details</h2>
              <button onClick={() => setSelectedReferral(null)} title="Close" className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Referrer</h3>
                <p className="font-medium text-gray-900 dark:text-white">{selectedReferral.referrerName}</p>
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                  <Mail size={12} /> {selectedReferral.referrerEmail}
                </p>
                {selectedReferral.referrerPhone && (
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                    <Phone size={12} /> {selectedReferral.referrerPhone}
                  </p>
                )}
                {selectedReferral.customer && (
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                    <Building2 size={12} /> {selectedReferral.customer.company}
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Referee</h3>
                <p className="font-medium text-gray-900 dark:text-white">{selectedReferral.refereeName}</p>
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                  <Mail size={12} /> {selectedReferral.refereeEmail}
                </p>
                {selectedReferral.refereePhone && (
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                    <Phone size={12} /> {selectedReferral.refereePhone}
                  </p>
                )}
                {selectedReferral.refereeCompany && (
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                    <Building2 size={12} /> {selectedReferral.refereeCompany}
                  </p>
                )}
              </div>

              {selectedReferral.service && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Service</h3>
                  <p className="text-gray-900 dark:text-white">{selectedReferral.service}</p>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Status</h3>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[selectedReferral.status]}`}>
                  {selectedReferral.status}
                </span>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Commission</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Rate:</span>{" "}
                    <span className="text-gray-900 dark:text-white">{selectedReferral.commissionRate}%</span>
                  </div>
                  {selectedReferral.dealValue != null && (
                    <div>
                      <span className="text-gray-500">Deal Value:</span>{" "}
                      <span className="text-gray-900 dark:text-white">
                        R{selectedReferral.dealValue.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {selectedReferral.commissionAmount != null && (
                    <div>
                      <span className="text-gray-500">Amount:</span>{" "}
                      <span className="font-bold text-green-600">
                        R{selectedReferral.commissionAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedReferral.notes && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Notes</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {selectedReferral.notes}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Timeline</h3>
                <div className="space-y-1 text-sm text-gray-500">
                  <p>Created: {new Date(selectedReferral.createdAt).toLocaleString("en-ZA")}</p>
                  {selectedReferral.convertedAt && (
                    <p>Converted: {new Date(selectedReferral.convertedAt).toLocaleString("en-ZA")}</p>
                  )}
                  {selectedReferral.paidAt && (
                    <p>Paid: {new Date(selectedReferral.paidAt).toLocaleString("en-ZA")}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingId ? "Edit Referral" : "New Referral"}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                title="Close"
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Referrer Section */}
              <fieldset className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <legend className="text-xs font-semibold text-gray-500 uppercase px-2">Referrer (who is referring)</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={form.referrerName}
                      onChange={(e) => setForm({ ...form, referrerName: e.target.value })}
                      placeholder="Full name"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={form.referrerEmail}
                      onChange={(e) => setForm({ ...form, referrerEmail: e.target.value })}
                      placeholder="email@example.com"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Phone</label>
                    <input
                      type="text"
                      value={form.referrerPhone}
                      onChange={(e) => setForm({ ...form, referrerPhone: e.target.value })}
                      placeholder="Phone number"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Referee Section */}
              <fieldset className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <legend className="text-xs font-semibold text-gray-500 uppercase px-2">Referee (who is being referred)</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={form.refereeName}
                      onChange={(e) => setForm({ ...form, refereeName: e.target.value })}
                      placeholder="Full name"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={form.refereeEmail}
                      onChange={(e) => setForm({ ...form, refereeEmail: e.target.value })}
                      placeholder="email@example.com"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Phone</label>
                    <input
                      type="text"
                      value={form.refereePhone}
                      onChange={(e) => setForm({ ...form, refereePhone: e.target.value })}
                      placeholder="Phone number"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Company</label>
                    <input
                      type="text"
                      value={form.refereeCompany}
                      onChange={(e) => setForm({ ...form, refereeCompany: e.target.value })}
                      placeholder="Company name"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Service Interested In</label>
                  <input
                    type="text"
                    value={form.service}
                    onChange={(e) => setForm({ ...form, service: e.target.value })}
                    placeholder="e.g. Web Development, Hosting, Mobile App"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
                {isAdmin && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      title="Referral status"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Commission (admin only) */}
              {isAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={form.commissionRate}
                      onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
                      placeholder="10"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Deal Value (R)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.dealValue}
                      onChange={(e) => setForm({ ...form, dealValue: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Commission Amount (R)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.commissionAmount}
                      onChange={(e) => setForm({ ...form, commissionAmount: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional notes about this referral"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? "Update" : "Create"} Referral
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
