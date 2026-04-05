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
  _count: { issues: number; tasks: number; documents: number };
}

type TabType = "overview" | "tasks" | "documents" | "tickets" | "code";

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
                      <label className="block text-sm font-medium text-slate-700 mb-1">File (zip/tar.gz) *</label>
                      <input
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
