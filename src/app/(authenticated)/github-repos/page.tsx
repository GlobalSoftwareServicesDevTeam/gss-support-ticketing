"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Search,
  Lock,
  Unlock,
  ExternalLink,
  Building2,
  Plus,
  X,
  Loader2,
  Code2,
  Trash2,
  FolderKanban,
} from "lucide-react";
import { GitHubIcon } from "@/components/icons";
import Link from "next/link";

interface CustomerAssignment {
  id: string;
  customerId: string;
  customer: { id: string; company: string; emailAddress: string };
  assignedAt: string;
}

interface Repo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  isPrivate: boolean;
  language: string | null;
  createdAt: string;
  customers: CustomerAssignment[];
  projectId: string | null;
  project: { id: string; projectName: string } | null;
}

interface Customer {
  id: string;
  company: string;
  emailAddress: string;
}

export default function GitHubReposPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "ADMIN";

  const [repos, setRepos] = useState<Repo[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<{ id: string; projectName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [ghToken, setGhToken] = useState("");
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [assigningRepoId, setAssigningRepoId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const fetchRepos = useCallback(async () => {
    const res = await fetch(`/api/github/repos?search=${encodeURIComponent(search)}`);
    if (res.ok) setRepos(await res.json());
    setLoading(false);
  }, [search]);

  const fetchCustomers = useCallback(async () => {
    const res = await fetch("/api/customers?limit=1000");
    if (res.ok) {
      const data = await res.json();
      setCustomers(data.customers || data);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.projects || [];
      setProjects(list.map((p: { id: string; projectName: string }) => ({ id: p.id, projectName: p.projectName })));
    }
  }, []);

  useEffect(() => {
    if (session?.user && !isAdmin) router.push("/dashboard");
  }, [session, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) {
      fetchRepos();
      fetchCustomers();
      fetchProjects();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ghToken || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`Synced ${data.synced} repos from GitHub`);
        fetchRepos();
      } else {
        setSyncResult(data.error || "Sync failed");
      }
    } catch {
      setSyncResult("Network error");
    }
    setSyncing(false);
  };

  const handleAssign = async (repoId: string) => {
    if (!selectedCustomerId) return;
    const res = await fetch(`/api/github/repos/${repoId}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: selectedCustomerId }),
    });
    if (res.ok) {
      setAssigningRepoId(null);
      setSelectedCustomerId("");
      fetchRepos();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to assign");
    }
  };

  const handleUnassign = async (repoId: string, customerId: string) => {
    if (!confirm("Remove this customer from the repo?")) return;
    const res = await fetch(`/api/github/repos/${repoId}/customers/${customerId}`, {
      method: "DELETE",
    });
    if (res.ok) fetchRepos();
  };

  const handleDeleteRepo = async (repoId: string) => {
    if (!confirm("Remove this repo from the system? Customer assignments will also be removed.")) return;
    const res = await fetch(`/api/github/repos/${repoId}`, { method: "DELETE" });
    if (res.ok) fetchRepos();
  };

  const handleLinkProject = async (repoId: string, projectId: string) => {
    await fetch(`/api/github/repos/${repoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: projectId || null }),
    });
    fetchRepos();
  };

  const LANG_COLORS: Record<string, string> = {
    TypeScript: "bg-blue-500",
    JavaScript: "bg-yellow-400",
    Python: "bg-green-500",
    "C#": "bg-purple-500",
    Java: "bg-orange-500",
    PHP: "bg-indigo-400",
    HTML: "bg-red-400",
    CSS: "bg-pink-400",
    Go: "bg-cyan-500",
    Rust: "bg-orange-700",
    Ruby: "bg-red-600",
    Swift: "bg-orange-400",
    Kotlin: "bg-violet-500",
    Dart: "bg-sky-500",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <GitHubIcon size={28} /> GitHub Repositories
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sync repos from GitHub and assign them to customers
          </p>
        </div>
        <button
          onClick={() => setShowSyncModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600 transition shadow-sm"
        >
          <RefreshCw size={16} />
          Sync from GitHub
        </button>
      </div>

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Sync GitHub Repos</h2>
              <button onClick={() => { setShowSyncModal(false); setSyncResult(null); }} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Enter a GitHub Personal Access Token (PAT) with <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">repo</code> scope, or leave blank to use the server&apos;s configured GITHUB_PAT.
            </p>
            <input
              type="password"
              value={ghToken}
              onChange={(e) => setGhToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm mb-4 focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
            />
            {syncResult && (
              <div className={`text-sm mb-4 p-3 rounded-lg ${syncResult.startsWith("Synced") ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"}`}>
                {syncResult}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowSyncModal(false); setSyncResult(null); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
              >
                Close
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
              >
                {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {syncing ? "Syncing..." : "Sync"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repos..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
        />
      </div>

      {/* Repos List */}
      {repos.length === 0 ? (
        <div className="text-center py-20">
          <Code2 size={48} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">No repos synced yet. Click &quot;Sync from GitHub&quot; to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {repos
            .filter(
              (r) =>
                !search ||
                r.fullName.toLowerCase().includes(search.toLowerCase()) ||
                (r.description || "").toLowerCase().includes(search.toLowerCase())
            )
            .map((repo) => (
              <div
                key={repo.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5"
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Repo Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={repo.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                      >
                        {repo.fullName}
                        <ExternalLink size={14} />
                      </a>
                      {repo.isPrivate ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                          <Lock size={10} /> Private
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <Unlock size={10} /> Public
                        </span>
                      )}
                      {repo.language && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className={`w-2.5 h-2.5 rounded-full ${LANG_COLORS[repo.language] || "bg-slate-400"}`} />
                          {repo.language}
                        </span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {repo.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => handleDeleteRepo(repo.id)}
                      className="text-slate-400 hover:text-red-500 transition p-1"
                      title="Remove repo"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Linked Project */}
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FolderKanban size={14} />
                      Project
                    </h3>
                    <select
                      title="Link to project"
                      value={repo.projectId || ""}
                      onChange={(e) => handleLinkProject(repo.id, e.target.value)}
                      className="flex-1 max-w-xs px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                    >
                      <option value="">No project linked</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.projectName}
                        </option>
                      ))}
                    </select>
                    {repo.project && (
                      <Link
                        href={`/projects/${repo.project.id}`}
                        className="text-xs text-brand-500 hover:text-brand-600 font-medium"
                      >
                        View Project →
                      </Link>
                    )}
                  </div>
                </div>

                {/* Assigned Customers */}
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Building2 size={14} />
                      Assigned Customers ({repo.customers.length})
                    </h3>
                    <button
                      onClick={() => {
                        setAssigningRepoId(assigningRepoId === repo.id ? null : repo.id);
                        setSelectedCustomerId("");
                      }}
                      className="inline-flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 font-medium transition"
                    >
                      <Plus size={14} /> Assign
                    </button>
                  </div>

                  {repo.customers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {repo.customers.map((ca) => (
                        <span
                          key={ca.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-xs text-slate-700 dark:text-slate-300"
                        >
                          <Building2 size={12} className="text-slate-400" />
                          {ca.customer.company}
                          <button
                            onClick={() => handleUnassign(repo.id, ca.customerId)}
                            className="text-slate-400 hover:text-red-500 transition ml-0.5"
                            title="Remove assignment"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {repo.customers.length === 0 && assigningRepoId !== repo.id && (
                    <p className="text-xs text-slate-400">No customers assigned</p>
                  )}

                  {/* Assign Form */}
                  {assigningRepoId === repo.id && (
                    <div className="flex items-center gap-2 mt-2">
                      <select
                        title="Select a customer"
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                      >
                        <option value="">Select a customer...</option>
                        {customers
                          .filter((c) => !repo.customers.some((ca) => ca.customerId === c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.company} ({c.emailAddress})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => handleAssign(repo.id)}
                        disabled={!selectedCustomerId}
                        className="px-3 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => { setAssigningRepoId(null); setSelectedCustomerId(""); }}
                        className="px-3 py-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
