"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import TaskBoard from "@/components/task-board";
import DocumentManager from "@/components/document-manager";
import {
  Code2,
  Upload,
  Download,
  Trash2,
  Loader2,
  Package,
  Clock,
  Eye,
  GitBranch,
  Lock,
  Unlock,
  Plus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  PlayCircle,
  Edit2,
  X,
} from "lucide-react";

interface Assignment {
  id: string;
  user: { id: string; firstName: string; lastName: string; email: string };
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  order: number;
  assignments: Assignment[];
}

interface Document {
  id: string;
  name: string;
  fileName: string;
  fileExt: string;
  fileSize: number;
  category: string;
  notes: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
}

interface Issue {
  id: string;
  subject: string;
  status: string;
  priority: string;
  updatedAt: string;
}

interface CodeRelease {
  id: string;
  version: string;
  notes: string | null;
  fileName: string;
  fileExt: string;
  fileSize: number;
  uploadedBy: string | null;
  createdAt: string;
  _count: { downloads: number };
}

interface CodeDownloadLogEntry {
  id: string;
  downloadedAt: string;
  ipAddress: string | null;
  user: { id: string; firstName: string; lastName: string; email: string; company: string | null };
}

interface LinkedRepo {
  id: string;
  fullName: string;
  htmlUrl: string;
  isPrivate: boolean;
  language: string | null;
}

interface StageTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  order: number;
  assignments: Assignment[];
}

interface SubProjectStage {
  id: string;
  name: string;
  description: string | null;
  status: string;
  order: number;
  tasks: StageTask[];
}

interface SubProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  order: number;
  stages: SubProjectStage[];
  repos: LinkedRepo[];
}

interface Project {
  id: string;
  projectName: string;
  dateCreated: string;
  proposalDate: string | null;
  estimatedCompleteDate: string | null;
  onMaintenance: boolean;
  maintAmount: number | null;
  dateStarted: string | null;
  githubRepo: string | null;
  description: string | null;
  status: string;
  tasks: Task[];
  documents: Document[];
  issues: Issue[];
  repos: LinkedRepo[];
  _count: { issues: number; tasks: number; documents: number };
}

type TabType = "overview" | "tasks" | "documents" | "tickets" | "code" | "sub-projects";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>("overview");

  // Code tab state
  const [codeReleases, setCodeReleases] = useState<CodeRelease[]>([]);
  const [codeLoading, setCodeLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ version: "", notes: "", fileName: "", fileBase64: "" });
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewHistoryId, setViewHistoryId] = useState<string | null>(null);
  const [downloadHistory, setDownloadHistory] = useState<CodeDownloadLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Sub-projects state
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [showAddSub, setShowAddSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [newSubDesc, setNewSubDesc] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [addingStageFor, setAddingStageFor] = useState<string | null>(null);
  const [newStageName, setNewStageName] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("MEDIUM");
  const [addingTask, setAddingTask] = useState(false);
  const [linkingRepoFor, setLinkingRepoFor] = useState<string | null>(null);
  const [linkingRepo, setLinkingRepo] = useState(false);

  const fetchProject = useCallback(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const fetchCodeReleases = useCallback(() => {
    setCodeLoading(true);
    fetch(`/api/projects/${id}/code`)
      .then((r) => r.json())
      .then((data) => setCodeReleases(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setCodeLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === "code") fetchCodeReleases();
  }, [tab, fetchCodeReleases]);

  const fetchSubProjects = useCallback(() => {
    setSubLoading(true);
    fetch(`/api/projects/${id}/sub-projects`)
      .then((r) => r.json())
      .then((data) => setSubProjects(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === "sub-projects") fetchSubProjects();
  }, [tab, fetchSubProjects]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setUploadForm((f) => ({ ...f, fileName: file.name, fileBase64: base64 }));
    };
    reader.readAsDataURL(file);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploading(true);
    const res = await fetch(`/api/projects/${id}/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uploadForm),
    });
    if (res.ok) {
      setShowUpload(false);
      setUploadForm({ version: "", notes: "", fileName: "", fileBase64: "" });
      fetchCodeReleases();
    } else {
      const data = await res.json();
      alert(data.error || "Upload failed");
    }
    setUploading(false);
  }

  async function handleDownload(release: CodeRelease) {
    setDownloadingId(release.id);
    try {
      const res = await fetch(`/api/projects/${id}/code/${release.id}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = release.fileName;
      a.click();
      URL.revokeObjectURL(url);
      // Refresh download counts
      fetchCodeReleases();
    } catch {
      alert("Download failed");
    }
    setDownloadingId(null);
  }

  async function handleDeleteRelease(releaseId: string) {
    if (!confirm("Delete this code release? This cannot be undone.")) return;
    setDeletingId(releaseId);
    await fetch(`/api/projects/${id}/code/${releaseId}`, { method: "DELETE" });
    fetchCodeReleases();
    setDeletingId(null);
  }

  async function viewDownloadHistory(releaseId: string) {
    if (viewHistoryId === releaseId) {
      setViewHistoryId(null);
      return;
    }
    setViewHistoryId(releaseId);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/code-downloads?projectId=${id}&limit=100`);
      const data = await res.json();
      setDownloadHistory(
        (data.logs || []).filter((l: CodeDownloadLogEntry & { codeRelease: { id: string } }) => l.codeRelease.id === releaseId)
      );
    } catch {
      setDownloadHistory([]);
    }
    setHistoryLoading(false);
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Loading project...</div>;
  }

  if (!project) {
    return <div className="text-center py-12 text-slate-400">Project not found</div>;
  }

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "sub-projects", label: "Sub Projects", count: subProjects.length || undefined },
    { key: "tasks", label: "Tasks", count: project._count.tasks },
    { key: "documents", label: "Documents", count: project._count.documents },
    { key: "code", label: "Code" },
    { key: "tickets", label: "Tickets", count: project._count.issues },
  ];

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    ON_HOLD: "bg-yellow-100 text-yellow-800",
    COMPLETED: "bg-blue-100 text-blue-800",
    ARCHIVED: "bg-gray-100 text-gray-800",
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <Link href="/projects" className="text-blue-600 hover:underline text-sm">&larr; Projects</Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{project.projectName}</h1>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${statusColors[project.status] || "bg-gray-100 text-gray-800"}`}>
            {project.status?.replace("_", " ")}
          </span>
        </div>
        {project.githubRepo && (
          <a
            href={project.githubRepo}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition"
          >
            GitHub Repo &rarr;
          </a>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">{t.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Project Details</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Created</dt>
                <dd className="text-sm text-slate-900">{new Date(project.dateCreated).toLocaleDateString()}</dd>
              </div>
              {project.dateStarted && (
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500">Started</dt>
                  <dd className="text-sm text-slate-900">{new Date(project.dateStarted).toLocaleDateString()}</dd>
                </div>
              )}
              {project.estimatedCompleteDate && (
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500">Est. Completion</dt>
                  <dd className="text-sm text-slate-900">{new Date(project.estimatedCompleteDate).toLocaleDateString()}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Maintenance</dt>
                <dd className="text-sm text-slate-900">
                  {project.onMaintenance ? (
                    <span className="text-green-600">Active {project.maintAmount ? `(R${project.maintAmount})` : ""}</span>
                  ) : "No"}
                </dd>
              </div>
              {project.githubRepo && (
                <div className="flex justify-between">
                  <dt className="text-sm text-slate-500">GitHub</dt>
                  <dd className="text-sm">
                    <a href={project.githubRepo} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                      {project.githubRepo}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Statistics</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{project._count.tasks}</p>
                <p className="text-sm text-slate-500">Tasks</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{project._count.documents}</p>
                <p className="text-sm text-slate-500">Documents</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{project._count.issues}</p>
                <p className="text-sm text-slate-500">Tickets</p>
              </div>
            </div>
          </div>

          {project.description && (
            <div className="col-span-1 md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Description</h2>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{project.description}</p>
            </div>
          )}

          {/* Linked Repos */}
          {project.repos && project.repos.length > 0 && (
            <div className="col-span-1 md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <GitBranch size={20} className="text-slate-500" />
                Linked Repositories ({project.repos.length})
              </h2>
              <div className="space-y-3">
                {project.repos.map((repo) => (
                  <div key={repo.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Code2 size={16} className="text-slate-400" />
                      <a
                        href={repo.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {repo.fullName}
                      </a>
                      {repo.isPrivate ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                          <Lock size={10} /> Private
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <Unlock size={10} /> Public
                        </span>
                      )}
                      {repo.language && (
                        <span className="text-xs text-slate-500">{repo.language}</span>
                      )}
                    </div>
                    <Link
                      href={`/github-repos`}
                      className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                    >
                      Manage →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "sub-projects" && (
        <div>
          {/* Add Sub-Project button */}
          {isAdmin && (
            <div className="mb-6">
              {!showAddSub ? (
                <button
                  onClick={() => setShowAddSub(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-sm"
                >
                  <Plus size={16} />
                  Add Sub Project
                </button>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      placeholder="Sub-project name"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                      autoFocus
                    />
                  </div>
                  <textarea
                    value={newSubDesc}
                    onChange={(e) => setNewSubDesc(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!newSubName.trim()) return;
                        setAddingSub(true);
                        const res = await fetch(`/api/projects/${id}/sub-projects`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: newSubName.trim(), description: newSubDesc.trim() || null }),
                        });
                        if (res.ok) {
                          setNewSubName("");
                          setNewSubDesc("");
                          setShowAddSub(false);
                          fetchSubProjects();
                        }
                        setAddingSub(false);
                      }}
                      disabled={addingSub || !newSubName.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {addingSub && <Loader2 size={14} className="animate-spin" />}
                      Create
                    </button>
                    <button
                      onClick={() => { setShowAddSub(false); setNewSubName(""); setNewSubDesc(""); }}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {subLoading ? (
            <div className="text-center py-12">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
              <p className="mt-2 text-sm text-slate-500">Loading sub-projects...</p>
            </div>
          ) : subProjects.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Package className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No sub-projects yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {subProjects.map((sub) => {
                const isExpanded = expandedSubs.has(sub.id);
                const totalTasks = sub.stages.reduce((sum, s) => sum + s.tasks.length, 0);
                const doneTasks = sub.stages.reduce((sum, s) => sum + s.tasks.filter((t) => t.status === "DONE").length, 0);
                const subStatusColors: Record<string, string> = {
                  ACTIVE: "bg-green-100 text-green-800",
                  ON_HOLD: "bg-yellow-100 text-yellow-800",
                  COMPLETED: "bg-blue-100 text-blue-800",
                };

                return (
                  <div key={sub.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Sub-project header */}
                    <div
                      className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition"
                      onClick={() => setExpandedSubs((p) => { const n = new Set(p); n.has(sub.id) ? n.delete(sub.id) : n.add(sub.id); return n; })}
                    >
                      {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{sub.name}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${subStatusColors[sub.status] || "bg-gray-100 text-gray-800"}`}>
                            {sub.status.replace("_", " ")}
                          </span>
                        </div>
                        {sub.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{sub.description}</p>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>{sub.stages.length} stage{sub.stages.length !== 1 ? "s" : ""}</span>
                        <span>{doneTasks}/{totalTasks} tasks done</span>
                        {totalTasks > 0 && (
                          <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full transition-all"
                              style={{ width: `${Math.round((doneTasks / totalTasks) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={sub.status}
                            onChange={async (e) => {
                              await fetch(`/api/projects/${id}/sub-projects/${sub.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: e.target.value }),
                              });
                              fetchSubProjects();
                            }}
                            title="Change sub-project status"
                            className="text-xs border border-slate-300 rounded px-1.5 py-1 bg-white text-slate-700"
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="ON_HOLD">On Hold</option>
                            <option value="COMPLETED">Completed</option>
                          </select>
                          <button
                            title="Delete sub-project"
                            onClick={async () => {
                              if (!confirm(`Delete "${sub.name}" and all its stages and tasks?`)) return;
                              await fetch(`/api/projects/${id}/sub-projects/${sub.id}`, { method: "DELETE" });
                              fetchSubProjects();
                            }}
                            className="p-1 text-red-400 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expanded: repos + stages */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50/50">
                        {/* Linked Repos */}
                        {(sub.repos.length > 0 || (isAdmin && project.repos.length > 0)) && (
                          <div className="px-4 py-3 border-b border-slate-200">
                            <div className="flex items-center gap-2 mb-2">
                              <GitBranch size={14} className="text-slate-500" />
                              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Linked Repos</span>
                              {isAdmin && (
                                <button
                                  onClick={() => setLinkingRepoFor(linkingRepoFor === sub.id ? null : sub.id)}
                                  className="ml-auto text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  <Edit2 size={12} /> Manage
                                </button>
                              )}
                            </div>
                            {sub.repos.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {sub.repos.map((repo) => (
                                  <a
                                    key={repo.id}
                                    href={repo.htmlUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition"
                                  >
                                    <Code2 size={12} className="text-slate-400" />
                                    {repo.fullName}
                                    {repo.isPrivate && <Lock size={10} className="text-yellow-500" />}
                                    {repo.language && <span className="text-slate-400">· {repo.language}</span>}
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400">No repos linked yet.</p>
                            )}
                            {/* Repo linking dropdown */}
                            {linkingRepoFor === sub.id && (
                              <div className="mt-2 p-3 bg-white rounded-lg border border-slate-200">
                                <p className="text-xs text-slate-500 mb-2">Select repos from the project to link:</p>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                  {project.repos.map((repo) => {
                                    const isLinked = sub.repos.some((r) => r.id === repo.id);
                                    return (
                                      <label key={repo.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-50 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={async () => {
                                            setLinkingRepo(true);
                                            const newRepoIds = isLinked
                                              ? sub.repos.filter((r) => r.id !== repo.id).map((r) => r.id)
                                              : [...sub.repos.map((r) => r.id), repo.id];
                                            await fetch(`/api/projects/${id}/sub-projects/${sub.id}`, {
                                              method: "PUT",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ repoIds: newRepoIds }),
                                            });
                                            fetchSubProjects();
                                            setLinkingRepo(false);
                                          }}
                                          disabled={linkingRepo}
                                          className="rounded border-slate-300"
                                        />
                                        <Code2 size={12} className="text-slate-400" />
                                        <span className="text-sm text-slate-700">{repo.fullName}</span>
                                        {repo.isPrivate && <Lock size={10} className="text-yellow-500" />}
                                      </label>
                                    );
                                  })}
                                </div>
                                {project.repos.length === 0 && (
                                  <p className="text-xs text-slate-400">No repos linked to this project. Link repos on the GitHub Repos page first.</p>
                                )}
                                <button
                                  onClick={() => setLinkingRepoFor(null)}
                                  className="mt-2 text-xs text-slate-500 hover:text-slate-700"
                                >
                                  Done
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {sub.stages.length === 0 && !addingStageFor ? (
                          <div className="px-6 py-6 text-center text-sm text-slate-400">
                            No stages yet.
                            {isAdmin && (
                              <button
                                onClick={() => setAddingStageFor(sub.id)}
                                className="ml-2 text-blue-600 hover:underline"
                              >
                                Add a stage
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="p-4 space-y-3">
                            {sub.stages.map((stage) => {
                              const stageExpanded = expandedStages.has(stage.id);
                              const stageDoneTasks = stage.tasks.filter((t) => t.status === "DONE").length;
                              const stageStatusIcon = stage.status === "COMPLETED" ? (
                                <CheckCircle2 size={16} className="text-green-600" />
                              ) : stage.status === "IN_PROGRESS" ? (
                                <PlayCircle size={16} className="text-blue-600" />
                              ) : (
                                <Circle size={16} className="text-slate-400" />
                              );

                              return (
                                <div key={stage.id} className="bg-white rounded-lg border border-slate-200">
                                  {/* Stage header */}
                                  <div
                                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition"
                                    onClick={() => setExpandedStages((p) => { const n = new Set(p); n.has(stage.id) ? n.delete(stage.id) : n.add(stage.id); return n; })}
                                  >
                                    {stageStatusIcon}
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium text-slate-900">{stage.name}</span>
                                      {stage.description && <span className="text-xs text-slate-400 ml-2">{stage.description}</span>}
                                    </div>
                                    <span className="text-xs text-slate-500">{stageDoneTasks}/{stage.tasks.length} tasks</span>
                                    {isAdmin && (
                                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <select
                                          value={stage.status}
                                          onChange={async (e) => {
                                            await fetch(`/api/projects/${id}/sub-projects/${sub.id}/stages/${stage.id}`, {
                                              method: "PUT",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ status: e.target.value }),
                                            });
                                            fetchSubProjects();
                                          }}
                                          title="Change stage status"
                                          className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-600"
                                        >
                                          <option value="NOT_STARTED">Not Started</option>
                                          <option value="IN_PROGRESS">In Progress</option>
                                          <option value="COMPLETED">Completed</option>
                                        </select>
                                        <button
                                          title="Delete stage"
                                          onClick={async () => {
                                            if (!confirm(`Delete stage "${stage.name}"?`)) return;
                                            await fetch(`/api/projects/${id}/sub-projects/${sub.id}/stages/${stage.id}`, { method: "DELETE" });
                                            fetchSubProjects();
                                          }}
                                          className="p-1 text-red-400 hover:text-red-600"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    )}
                                    {stageExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                                  </div>

                                  {/* Expanded: tasks */}
                                  {stageExpanded && (
                                    <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                                      {stage.tasks.length === 0 && addingTaskFor !== stage.id && (
                                        <p className="text-xs text-slate-400 text-center py-2">
                                          No tasks.
                                          {isAdmin && (
                                            <button onClick={() => { setAddingTaskFor(stage.id); setNewTaskTitle(""); }} className="ml-1 text-blue-600 hover:underline">Add one</button>
                                          )}
                                        </p>
                                      )}
                                      {stage.tasks.map((task) => {
                                        const taskPriorityColors: Record<string, string> = {
                                          LOW: "text-slate-500",
                                          MEDIUM: "text-blue-600",
                                          HIGH: "text-orange-600",
                                          CRITICAL: "text-red-600",
                                        };
                                        const taskStatusColors: Record<string, string> = {
                                          TODO: "bg-slate-100 text-slate-700",
                                          IN_PROGRESS: "bg-blue-100 text-blue-700",
                                          IN_REVIEW: "bg-purple-100 text-purple-700",
                                          DONE: "bg-green-100 text-green-700",
                                        };
                                        return (
                                          <div key={task.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-slate-50">
                                            <button
                                              title={task.status === "DONE" ? "Mark as TODO" : "Mark as DONE"}
                                              onClick={async () => {
                                                const newStatus = task.status === "DONE" ? "TODO" : "DONE";
                                                await fetch(`/api/tasks/${task.id}`, {
                                                  method: "PUT",
                                                  headers: { "Content-Type": "application/json" },
                                                  body: JSON.stringify({ status: newStatus }),
                                                });
                                                fetchSubProjects();
                                              }}
                                              className="flex-shrink-0"
                                            >
                                              {task.status === "DONE" ? (
                                                <CheckCircle2 size={16} className="text-green-600" />
                                              ) : (
                                                <Circle size={16} className="text-slate-300 hover:text-green-400" />
                                              )}
                                            </button>
                                            <span className={`text-sm flex-1 ${task.status === "DONE" ? "line-through text-slate-400" : "text-slate-800"}`}>
                                              {task.title}
                                            </span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${taskStatusColors[task.status] || ""}`}>
                                              {task.status.replace("_", " ")}
                                            </span>
                                            <span className={`text-xs font-medium ${taskPriorityColors[task.priority] || ""}`}>
                                              {task.priority}
                                            </span>
                                            {task.assignments.length > 0 && (
                                              <span className="text-xs text-slate-400">
                                                {task.assignments.map((a) => `${a.user.firstName}`).join(", ")}
                                              </span>
                                            )}
                                            {isAdmin && (
                                              <button
                                                title="Delete task"
                                                onClick={async () => {
                                                  await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
                                                  fetchSubProjects();
                                                }}
                                                className="p-0.5 text-red-400 hover:text-red-600"
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}

                                      {/* Add task form */}
                                      {isAdmin && addingTaskFor === stage.id ? (
                                        <div className="flex items-center gap-2 pt-1">
                                          <input
                                            type="text"
                                            value={newTaskTitle}
                                            onChange={(e) => setNewTaskTitle(e.target.value)}
                                            placeholder="Task title"
                                            className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm text-slate-900"
                                            autoFocus
                                            onKeyDown={async (e) => {
                                              if (e.key === "Enter" && newTaskTitle.trim()) {
                                                setAddingTask(true);
                                                const res = await fetch(`/api/projects/${id}/sub-projects/${sub.id}/stages/${stage.id}/tasks`, {
                                                  method: "POST",
                                                  headers: { "Content-Type": "application/json" },
                                                  body: JSON.stringify({ title: newTaskTitle.trim(), priority: newTaskPriority }),
                                                });
                                                if (res.ok) {
                                                  setNewTaskTitle("");
                                                  fetchSubProjects();
                                                }
                                                setAddingTask(false);
                                              } else if (e.key === "Escape") {
                                                setAddingTaskFor(null);
                                              }
                                            }}
                                          />
                                          <select
                                            value={newTaskPriority}
                                            onChange={(e) => setNewTaskPriority(e.target.value)}
                                            title="Priority"
                                            className="px-2 py-1.5 border border-slate-300 rounded text-xs text-slate-700"
                                          >
                                            <option value="LOW">Low</option>
                                            <option value="MEDIUM">Medium</option>
                                            <option value="HIGH">High</option>
                                            <option value="CRITICAL">Critical</option>
                                          </select>
                                          <button
                                            onClick={async () => {
                                              if (!newTaskTitle.trim()) return;
                                              setAddingTask(true);
                                              const res = await fetch(`/api/projects/${id}/sub-projects/${sub.id}/stages/${stage.id}/tasks`, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ title: newTaskTitle.trim(), priority: newTaskPriority }),
                                              });
                                              if (res.ok) {
                                                setNewTaskTitle("");
                                                fetchSubProjects();
                                              }
                                              setAddingTask(false);
                                            }}
                                            disabled={addingTask || !newTaskTitle.trim()}
                                            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                                          >
                                            {addingTask ? <Loader2 size={12} className="animate-spin" /> : "Add"}
                                          </button>
                                          <button onClick={() => setAddingTaskFor(null)} title="Cancel" className="p-1 text-slate-400 hover:text-slate-600">
                                            <X size={14} />
                                          </button>
                                        </div>
                                      ) : isAdmin && stage.tasks.length > 0 ? (
                                        <button
                                          onClick={() => { setAddingTaskFor(stage.id); setNewTaskTitle(""); }}
                                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 pt-1"
                                        >
                                          <Plus size={12} /> Add Task
                                        </button>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Add stage form */}
                            {isAdmin && addingStageFor === sub.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={newStageName}
                                  onChange={(e) => setNewStageName(e.target.value)}
                                  placeholder="Stage name"
                                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                                  autoFocus
                                  onKeyDown={async (e) => {
                                    if (e.key === "Enter" && newStageName.trim()) {
                                      setAddingStage(true);
                                      const res = await fetch(`/api/projects/${id}/sub-projects/${sub.id}/stages`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ name: newStageName.trim() }),
                                      });
                                      if (res.ok) {
                                        setNewStageName("");
                                        setAddingStageFor(null);
                                        fetchSubProjects();
                                      }
                                      setAddingStage(false);
                                    } else if (e.key === "Escape") {
                                      setAddingStageFor(null);
                                    }
                                  }}
                                />
                                <button
                                  onClick={async () => {
                                    if (!newStageName.trim()) return;
                                    setAddingStage(true);
                                    const res = await fetch(`/api/projects/${id}/sub-projects/${sub.id}/stages`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ name: newStageName.trim() }),
                                    });
                                    if (res.ok) {
                                      setNewStageName("");
                                      setAddingStageFor(null);
                                      fetchSubProjects();
                                    }
                                    setAddingStage(false);
                                  }}
                                  disabled={addingStage || !newStageName.trim()}
                                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {addingStage ? <Loader2 size={14} className="animate-spin" /> : "Add"}
                                </button>
                                <button onClick={() => setAddingStageFor(null)} title="Cancel" className="p-1 text-slate-400 hover:text-slate-600">
                                  <X size={16} />
                                </button>
                              </div>
                            ) : isAdmin ? (
                              <button
                                onClick={() => { setAddingStageFor(sub.id); setNewStageName(""); }}
                                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
                              >
                                <Plus size={14} /> Add Stage
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <TaskBoard projectId={project.id} tasks={project.tasks} isAdmin={isAdmin} onRefresh={fetchProject} />
      )}

      {tab === "documents" && (
        <DocumentManager projectId={project.id} documents={project.documents} onRefresh={fetchProject} />
      )}

      {tab === "tickets" && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Subject</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Priority</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {project.issues.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">No tickets for this project.</td></tr>
              ) : (
                project.issues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <Link href={`/issues/${issue.id}`} className="text-sm font-medium text-blue-600 hover:underline">{issue.subject}</Link>
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={issue.status} /></td>
                    <td className="px-6 py-4"><PriorityBadge priority={issue.priority} /></td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(issue.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "code" && (
        <div>
          {/* Upload Form (admin) */}
          {isAdmin && (
            <div className="mb-6">
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Upload size={16} />
                {showUpload ? "Cancel Upload" : "Upload New Release"}
              </button>

              {showUpload && (
                <form onSubmit={handleUpload} className="mt-4 bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Version *</label>
                      <input
                        type="text"
                        value={uploadForm.version}
                        onChange={(e) => setUploadForm({ ...uploadForm, version: e.target.value })}
                        placeholder="e.g. 1.0.0"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="release-file" className="block text-sm font-medium text-slate-700 mb-1">File (zip/tar.gz) *</label>
                      <input
                        id="release-file"
                        type="file"
                        accept=".zip,.tar,.tar.gz,.gz,.rar,.7z"
                        onChange={handleFileSelect}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Release Notes</label>
                    <textarea
                      value={uploadForm.notes}
                      onChange={(e) => setUploadForm({ ...uploadForm, notes: e.target.value })}
                      rows={3}
                      placeholder="What changed in this version?"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    />
                  </div>
                  {uploadForm.fileName && (
                    <p className="text-sm text-slate-500">Selected: {uploadForm.fileName}</p>
                  )}
                  <button
                    type="submit"
                    disabled={uploading || !uploadForm.fileBase64}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {uploading && <Loader2 size={16} className="animate-spin" />}
                    {uploading ? "Uploading..." : "Upload Release"}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Releases List */}
          {codeLoading ? (
            <div className="text-center py-12">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
              <p className="mt-2 text-sm text-slate-500">Loading releases...</p>
            </div>
          ) : codeReleases.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Code2 className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No code releases yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {codeReleases.map((release) => (
                <div key={release.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Package size={20} className="text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">v{release.version}</h3>
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {release.fileName}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatFileSize(release.fileSize)}
                          </span>
                        </div>
                        {release.notes && (
                          <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{release.notes}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(release.createdAt).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Download size={12} />
                            {release._count.downloads} download{release._count.downloads !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownload(release)}
                        disabled={downloadingId === release.id}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {downloadingId === release.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                        Download
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => viewDownloadHistory(release.id)}
                            className={`p-1.5 rounded-lg border transition ${viewHistoryId === release.id ? "bg-blue-50 border-blue-300 text-blue-600" : "border-slate-300 text-slate-500 hover:bg-slate-50"}`}
                            title="View download history"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteRelease(release.id)}
                            disabled={deletingId === release.id}
                            className="p-1.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                            title="Delete release"
                          >
                            {deletingId === release.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Download History Inline (admin) */}
                  {isAdmin && viewHistoryId === release.id && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <h4 className="text-xs font-semibold text-slate-700 uppercase mb-2">Download History</h4>
                      {historyLoading ? (
                        <p className="text-xs text-slate-400">Loading...</p>
                      ) : downloadHistory.length === 0 ? (
                        <p className="text-xs text-slate-400">No downloads yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {downloadHistory.map((log) => (
                            <div key={log.id} className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                              <span>
                                <span className="font-medium">{log.user.firstName} {log.user.lastName}</span>
                                <span className="text-slate-400 ml-1">({log.user.email})</span>
                                {log.user.company && <span className="text-slate-400 ml-1">- {log.user.company}</span>}
                              </span>
                              <span className="flex items-center gap-2">
                                {log.ipAddress && <span className="text-slate-400">{log.ipAddress}</span>}
                                <span>{new Date(log.downloadedAt).toLocaleString()}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
