"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Lightbulb,
  Search,
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Trash2,
  Pencil,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Mail,
  Building2,
  Tag,
  DollarSign,
  CalendarClock,
  User,
  ArrowRightCircle,
  FolderKanban,
} from "lucide-react";

interface ProjectIdea {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  budget: number | null;
  timeline: string | null;
  submittedBy: string | null;
  contactEmail: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; company: string } | null;
}

const STATUS_OPTIONS = ["NEW", "REVIEWING", "APPROVED", "IN_PROGRESS", "COMPLETED", "REJECTED"];
const CATEGORY_OPTIONS = ["GENERAL", "WEB", "MOBILE", "AUTOMATION", "INTEGRATION", "OTHER"];
const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  REVIEWING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

export default function ProjectIdeasPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [ideas, setIdeas] = useState<ProjectIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "GENERAL",
    priority: "MEDIUM",
    status: "NEW",
    budget: "",
    timeline: "",
    submittedBy: "",
    contactEmail: "",
    adminNotes: "",
  });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Actions
  const [actionMsg, setActionMsg] = useState("");
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  // Detail panel
  const [selectedIdea, setSelectedIdea] = useState<ProjectIdea | null>(null);

  // Convert to task
  const [showConvert, setShowConvert] = useState(false);
  const [convertIdea, setConvertIdea] = useState<ProjectIdea | null>(null);
  const [projects, setProjects] = useState<{ id: string; projectName: string }[]>([]);
  const [convertForm, setConvertForm] = useState({
    projectId: "",
    newProjectName: "",
    createNewProject: false,
    taskPriority: "",
    taskStartDate: "",
    taskDueDate: "",
  });
  const [converting, setConverting] = useState(false);

  function fetchIdeas() {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    fetch(`/api/project-ideas?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setIdeas(data.ideas || []);
        setTotal(data.total || 0);
        setLoading(false);
      });
  }

  useEffect(() => {
    if (session) fetchIdeas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter, categoryFilter, session]);

  function fetchProjects() {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(Array.isArray(data) ? data : data.projects || []));
  }

  function openConvert(idea: ProjectIdea) {
    setConvertIdea(idea);
    setConvertForm({
      projectId: "",
      newProjectName: "",
      createNewProject: false,
      taskPriority: idea.priority === "URGENT" ? "CRITICAL" : idea.priority,
      taskStartDate: "",
      taskDueDate: "",
    });
    fetchProjects();
    setShowConvert(true);
    setActionMenu(null);
  }

  async function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    if (!convertIdea) return;
    setConverting(true);

    const res = await fetch(`/api/project-ideas/${convertIdea.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: convertForm.createNewProject ? undefined : convertForm.projectId,
        newProjectName: convertForm.createNewProject ? convertForm.newProjectName : undefined,
        taskPriority: convertForm.taskPriority || undefined,
        taskStartDate: convertForm.taskStartDate || undefined,
        taskDueDate: convertForm.taskDueDate || undefined,
      }),
    });

    const data = await res.json();
    setConverting(false);

    if (!res.ok) {
      setActionMsg(data.error || "Failed to convert idea");
    } else {
      setShowConvert(false);
      setConvertIdea(null);
      setActionMsg(`Idea converted to task in project "${data.projectName}"!`);
      fetchIdeas();
    }
    setTimeout(() => setActionMsg(""), 5000);
  }

  function resetForm() {
    setForm({
      title: "",
      description: "",
      category: "GENERAL",
      priority: "MEDIUM",
      status: "NEW",
      budget: "",
      timeline: "",
      submittedBy: "",
      contactEmail: "",
      adminNotes: "",
    });
    setEditingId(null);
    setFormError("");
  }

  function openEdit(idea: ProjectIdea) {
    setEditingId(idea.id);
    setForm({
      title: idea.title,
      description: idea.description,
      category: idea.category,
      priority: idea.priority,
      status: idea.status,
      budget: idea.budget != null ? String(idea.budget) : "",
      timeline: idea.timeline || "",
      submittedBy: idea.submittedBy || "",
      contactEmail: idea.contactEmail || "",
      adminNotes: idea.adminNotes || "",
    });
    setShowForm(true);
    setActionMenu(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    const url = editingId ? `/api/project-ideas/${editingId}` : "/api/project-ideas";
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        budget: form.budget ? parseFloat(form.budget) : null,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setFormError(data.error || "Failed to save project idea");
    } else {
      setShowForm(false);
      resetForm();
      setActionMsg(editingId ? "Project idea updated!" : "Project idea created!");
      fetchIdeas();
      setTimeout(() => setActionMsg(""), 4000);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this project idea?")) return;
    const res = await fetch(`/api/project-ideas/${id}`, { method: "DELETE" });
    if (res.ok) {
      setActionMsg("Project idea deleted.");
      fetchIdeas();
      if (selectedIdea?.id === id) setSelectedIdea(null);
      setTimeout(() => setActionMsg(""), 4000);
    }
    setActionMenu(null);
  }

  async function handleStatusChange(id: string, newStatus: string) {
    const res = await fetch(`/api/project-ideas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setActionMsg(`Status changed to ${newStatus}`);
      fetchIdeas();
      setTimeout(() => setActionMsg(""), 4000);
    }
  }

  const totalPages = Math.ceil(total / limit);

  // Stats
  const stats = {
    total: total,
    newIdeas: ideas.filter((i) => i.status === "NEW").length,
    approved: ideas.filter((i) => i.status === "APPROVED" || i.status === "IN_PROGRESS").length,
    completed: ideas.filter((i) => i.status === "COMPLETED").length,
  };

  if (!session) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Lightbulb className="text-amber-500" size={28} />
            Project Ideas
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Submit and track project ideas and feature requests
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
          New Idea
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
            <Lightbulb size={14} />
            Total Ideas
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-blue-600 text-xs mb-1">
            <AlertCircle size={14} />
            New
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.newIdeas}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
            <CheckCircle2 size={14} />
            Approved / In Progress
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.approved}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-emerald-600 text-xs mb-1">
            <Clock size={14} />
            Completed
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.completed}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search project ideas..."
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
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(1);
          }}
          title="Filter by category"
          className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        >
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
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
        ) : ideas.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Lightbulb size={48} className="mx-auto mb-3 opacity-40" />
            <p>No project ideas found</p>
            <p className="text-xs mt-1">Click &quot;New Idea&quot; to submit one</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((idea) => (
                <tr
                  key={idea.id}
                  className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                  onClick={() => setSelectedIdea(idea)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{idea.title}</div>
                    <div className="text-xs text-gray-500 truncate max-w-xs">
                      {idea.description.length > 80 ? idea.description.substring(0, 80) + "..." : idea.description}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium">
                      {idea.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${PRIORITY_COLORS[idea.priority] || "bg-gray-100 text-gray-800"}`}>
                      {idea.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <select
                        value={idea.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleStatusChange(idea.id, e.target.value)}
                        title="Change status"
                        className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATUS_COLORS[idea.status] || "bg-gray-100 text-gray-800"}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[idea.status] || "bg-gray-100 text-gray-800"}`}>
                        {idea.status.replace("_", " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {idea.budget != null
                      ? `R${idea.budget.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(idea.createdAt).toLocaleDateString("en-ZA")}
                  </td>
                  <td className="px-4 py-3 relative">
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionMenu(actionMenu === idea.id ? null : idea.id);
                        }}
                        title="Actions"
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        <MoreVertical size={16} />
                      </button>
                    )}
                    {actionMenu === idea.id && (
                      <div className="absolute right-4 top-10 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-36">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(idea);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                        >
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openConvert(idea);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-indigo-600"
                        >
                          <ArrowRightCircle size={14} /> Convert to Task
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(idea.id);
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
      {selectedIdea && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedIdea(null)}>
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Idea Details</h2>
              <button onClick={() => setSelectedIdea(null)} title="Close" className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Title</h3>
                <p className="font-medium text-gray-900 dark:text-white text-lg">{selectedIdea.title}</p>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Description</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {selectedIdea.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Category</h3>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium flex items-center gap-1 w-fit">
                    <Tag size={12} /> {selectedIdea.category}
                  </span>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Priority</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${PRIORITY_COLORS[selectedIdea.priority]}`}>
                    {selectedIdea.priority}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Status</h3>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[selectedIdea.status]}`}>
                  {selectedIdea.status.replace("_", " ")}
                </span>
              </div>

              {(selectedIdea.budget != null || selectedIdea.timeline) && (
                <div className="grid grid-cols-2 gap-4">
                  {selectedIdea.budget != null && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Estimated Budget</h3>
                      <p className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                        <DollarSign size={14} className="text-green-600" />
                        R{selectedIdea.budget.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}
                  {selectedIdea.timeline && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Timeline</h3>
                      <p className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                        <CalendarClock size={14} className="text-blue-600" />
                        {selectedIdea.timeline}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Submitted By</h3>
                {selectedIdea.submittedBy && (
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <User size={12} /> {selectedIdea.submittedBy}
                  </p>
                )}
                {selectedIdea.contactEmail && (
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                    <Mail size={12} /> {selectedIdea.contactEmail}
                  </p>
                )}
                {selectedIdea.customer && (
                  <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                    <Building2 size={12} /> {selectedIdea.customer.company}
                  </p>
                )}
              </div>

              {isAdmin && selectedIdea.adminNotes && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Admin Notes</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                    {selectedIdea.adminNotes}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Timeline</h3>
                <div className="space-y-1 text-sm text-gray-500">
                  <p>Created: {new Date(selectedIdea.createdAt).toLocaleString("en-ZA")}</p>
                  <p>Updated: {new Date(selectedIdea.updatedAt).toLocaleString("en-ZA")}</p>
                </div>
              </div>

              {isAdmin && selectedIdea.status !== "COMPLETED" && selectedIdea.status !== "REJECTED" && (
                <button
                  onClick={() => {
                    setSelectedIdea(null);
                    openConvert(selectedIdea);
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition text-sm font-medium mt-4"
                >
                  <ArrowRightCircle size={16} />
                  Convert to Task
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Convert to Task Modal */}
      {showConvert && convertIdea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ArrowRightCircle size={20} className="text-indigo-600" />
                Convert to Task
              </h2>
              <button
                onClick={() => { setShowConvert(false); setConvertIdea(null); }}
                title="Close"
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{convertIdea.title}</p>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{convertIdea.description}</p>
            </div>

            <form onSubmit={handleConvert} className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-3">
                  <input
                    type="checkbox"
                    checked={convertForm.createNewProject}
                    onChange={(e) => setConvertForm({ ...convertForm, createNewProject: e.target.checked, projectId: "", newProjectName: "" })}
                    className="rounded border-gray-300"
                  />
                  Create a new project
                </label>

                {convertForm.createNewProject ? (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">New Project Name *</label>
                    <input
                      type="text"
                      required
                      value={convertForm.newProjectName}
                      onChange={(e) => setConvertForm({ ...convertForm, newProjectName: e.target.value })}
                      placeholder="Enter project name"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Select Project *</label>
                    <select
                      required
                      value={convertForm.projectId}
                      onChange={(e) => setConvertForm({ ...convertForm, projectId: e.target.value })}
                      title="Select a project"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    >
                      <option value="">-- Select a project --</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.projectName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Task Priority</label>
                  <select
                    value={convertForm.taskPriority}
                    onChange={(e) => setConvertForm({ ...convertForm, taskPriority: e.target.value })}
                    title="Task priority"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date & Time</label>
                  <input
                    type="datetime-local"
                    value={convertForm.taskStartDate}
                    onChange={(e) => setConvertForm({ ...convertForm, taskStartDate: e.target.value })}
                    placeholder="Start date"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Due Date & Time</label>
                  <input
                    type="datetime-local"
                    value={convertForm.taskDueDate}
                    onChange={(e) => setConvertForm({ ...convertForm, taskDueDate: e.target.value })}
                    placeholder="Due date"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowConvert(false); setConvertIdea(null); }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={converting}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {converting && <Loader2 size={14} className="animate-spin" />}
                  <FolderKanban size={14} />
                  Convert to Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingId ? "Edit Project Idea" : "New Project Idea"}
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
              {/* Title & Description */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Brief title for your project idea"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Description *</label>
                <textarea
                  rows={4}
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe your project idea in detail — what problem does it solve? What features do you envision?"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                />
              </div>

              {/* Category & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    title="Select category"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    title="Select priority"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Budget & Timeline */}
              <fieldset className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <legend className="text-xs font-semibold text-gray-500 uppercase px-2">Estimates</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Budget (R)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.budget}
                      onChange={(e) => setForm({ ...form, budget: e.target.value })}
                      placeholder="Estimated budget"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Timeline</label>
                    <input
                      type="text"
                      value={form.timeline}
                      onChange={(e) => setForm({ ...form, timeline: e.target.value })}
                      placeholder="e.g. 2 weeks, 3 months"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Contact Info */}
              <fieldset className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <legend className="text-xs font-semibold text-gray-500 uppercase px-2">Contact Information</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Your Name</label>
                    <input
                      type="text"
                      value={form.submittedBy}
                      onChange={(e) => setForm({ ...form, submittedBy: e.target.value })}
                      placeholder="Your name"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={form.contactEmail}
                      onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                      placeholder="your@email.com"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Admin fields */}
              {isAdmin && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      title="Idea status"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s.replace("_", " ")}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Admin Notes</label>
                    <textarea
                      rows={3}
                      value={form.adminNotes}
                      onChange={(e) => setForm({ ...form, adminNotes: e.target.value })}
                      placeholder="Internal notes (only visible to admins)"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                    />
                  </div>
                </>
              )}

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
                  {editingId ? "Update" : "Submit"} Idea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
