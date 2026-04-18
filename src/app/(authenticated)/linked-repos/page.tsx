"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  GitBranch,
  Link2,
  Plus,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  Loader2,
  ExternalLink,
  Lock,
  Unlock,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
} from "lucide-react";
import { GitHubIcon } from "@/components/icons";

interface PlatformRepo {
  id: string;
  fullName: string;
  htmlUrl: string;
  owner: string;
  name: string;
  isPrivate: boolean;
  language: string | null;
}

interface ClientLink {
  id: string;
  clientOwner: string;
  clientRepoName: string;
  clientRepoUrl: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  createdAt: string;
  repo: PlatformRepo;
  user?: { id: string; firstName: string; lastName: string; email: string };
}

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

export default function ClientReposPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [links, setLinks] = useState<ClientLink[]>([]);
  const [availableRepos, setAvailableRepos] = useState<PlatformRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncDirection, setSyncDirection] = useState<"push" | "pull" | null>(null);
  const [syncResult, setSyncResult] = useState<{ id: string; message?: string; error?: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Link form state
  const [linkPat, setLinkPat] = useState("");
  const [linkClientRepo, setLinkClientRepo] = useState("");
  const [linkRepoId, setLinkRepoId] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch("/api/client-repos");
      if (res.ok) setLinks(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchAvailableRepos = useCallback(async () => {
    try {
      const url = isAdmin ? "/api/github/repos" : "/api/github/my-repos";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAvailableRepos(
          (Array.isArray(data) ? data : []).map((r: PlatformRepo & Record<string, unknown>) => ({
            id: r.id,
            fullName: r.fullName,
            htmlUrl: r.htmlUrl,
            owner: r.owner,
            name: r.name,
            isPrivate: r.isPrivate,
            language: r.language,
          }))
        );
      }
    } catch { /* ignore */ }
  }, [isAdmin]);

  useEffect(() => {
    if (session?.user) {
      fetchLinks();
      fetchAvailableRepos();
    }
  }, [session, fetchLinks, fetchAvailableRepos]);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLinking(true);
    setLinkError(null);

    try {
      const res = await fetch("/api/client-repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pat: linkPat,
          clientRepoFullName: linkClientRepo,
          repoId: linkRepoId,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setShowLinkModal(false);
        setLinkPat("");
        setLinkClientRepo("");
        setLinkRepoId("");
        fetchLinks();
      } else {
        setLinkError(data.error || "Failed to link repo");
      }
    } catch {
      setLinkError("Network error");
    }
    setLinking(false);
  }

  async function handleSync(linkId: string, direction: "push" | "pull") {
    setSyncingId(linkId);
    setSyncDirection(direction);
    setSyncResult(null);

    try {
      const res = await fetch(`/api/client-repos/${linkId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const data = await res.json();

      if (res.ok) {
        setSyncResult({ id: linkId, message: data.message });
        fetchLinks();
      } else {
        setSyncResult({ id: linkId, error: data.error || "Sync failed" });
      }
    } catch {
      setSyncResult({ id: linkId, error: "Network error" });
    }

    setSyncingId(null);
    setSyncDirection(null);
  }

  async function handleDelete(linkId: string) {
    if (!confirm("Remove this repo link? This won't affect the repositories themselves.")) return;
    setDeletingId(linkId);
    try {
      const res = await fetch(`/api/client-repos/${linkId}`, { method: "DELETE" });
      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.id !== linkId));
      }
    } catch { /* ignore */ }
    setDeletingId(null);
  }

  const filtered = links.filter(
    (l) =>
      !search ||
      l.clientRepoName.toLowerCase().includes(search.toLowerCase()) ||
      l.clientOwner.toLowerCase().includes(search.toLowerCase()) ||
      l.repo.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (l.user?.firstName || "").toLowerCase().includes(search.toLowerCase()) ||
      (l.user?.lastName || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <GitBranch size={28} className="text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Linked Repositories</h1>
            <p className="text-sm text-slate-500">Link your GitHub repos to push and pull code with platform repos</p>
          </div>
        </div>
        <button
          onClick={() => {
            setShowLinkModal(true);
            setLinkError(null);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm flex items-center gap-2"
        >
          <Plus size={16} /> Link Repository
        </button>
      </div>

      {/* Search */}
      {links.length > 0 && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search linked repos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Loader2 size={24} className="animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Loading linked repos...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && links.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Link2 size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium mb-1">No linked repositories yet</p>
          <p className="text-sm text-slate-400 mb-4">
            Link your GitHub repository to a platform repo to push and pull code.
          </p>
          <button
            onClick={() => setShowLinkModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
          >
            Link Your First Repository
          </button>
        </div>
      )}

      {/* Linked repos list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((link) => (
            <div key={link.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-start justify-between">
                {/* Left: repo info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <GitHubIcon size={20} />
                    <span className="font-semibold text-slate-900">
                      {link.clientOwner}/{link.clientRepoName}
                    </span>
                    <a
                      href={link.clientRepoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-blue-600 transition"
                      title="Open on GitHub"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                    <span className="flex items-center gap-1">
                      <Link2 size={12} /> Linked to: <strong className="text-slate-700">{link.repo.fullName}</strong>
                    </span>
                    {link.repo.isPrivate ? (
                      <span className="flex items-center gap-1"><Lock size={12} /> Private</span>
                    ) : (
                      <span className="flex items-center gap-1"><Unlock size={12} /> Public</span>
                    )}
                    {link.repo.language && (
                      <span className="flex items-center gap-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${LANG_COLORS[link.repo.language] || "bg-gray-400"}`} />
                        {link.repo.language}
                      </span>
                    )}
                    {isAdmin && link.user && (
                      <span className="text-purple-600">
                        By: {link.user.firstName} {link.user.lastName}
                      </span>
                    )}
                  </div>

                  {/* Sync status */}
                  {link.lastSyncAt && (
                    <div className="flex items-center gap-2 text-xs">
                      <Clock size={12} className="text-slate-400" />
                      <span className="text-slate-400">
                        Last sync: {new Date(link.lastSyncAt).toLocaleString()}
                      </span>
                      {link.lastSyncStatus && (
                        <span className={`px-2 py-0.5 rounded-full ${
                          link.lastSyncStatus.startsWith("Error")
                            ? "bg-red-50 text-red-600"
                            : "bg-green-50 text-green-600"
                        }`}>
                          {link.lastSyncStatus}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Sync result for this link */}
                  {syncResult && syncResult.id === link.id && (
                    <div className={`mt-2 p-2 rounded-lg text-xs ${
                      syncResult.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                    }`}>
                      {syncResult.error ? (
                        <span className="flex items-center gap-1"><AlertCircle size={12} /> {syncResult.error}</span>
                      ) : (
                        <span className="flex items-center gap-1"><CheckCircle2 size={12} /> {syncResult.message}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-2 ml-4">
                  {/* Push: admin repo → client repo */}
                  <button
                    onClick={() => handleSync(link.id, "push")}
                    disabled={syncingId === link.id}
                    className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                    title="Push: Copy code from platform repo to your repo"
                  >
                    {syncingId === link.id && syncDirection === "push" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <ArrowUpCircle size={13} />
                    )}
                    Push
                  </button>

                  {/* Pull: client repo → admin repo (admin only) */}
                  {isAdmin && (
                    <button
                      onClick={() => handleSync(link.id, "pull")}
                      disabled={syncingId === link.id}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                      title="Pull: Copy code from client repo to platform repo"
                    >
                      {syncingId === link.id && syncDirection === "pull" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <ArrowDownCircle size={13} />
                      )}
                      Pull
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(link.id)}
                    disabled={deletingId === link.id}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                    title="Remove link"
                  >
                    {deletingId === link.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link Repo Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <Link2 size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">Link Repository</h2>
              </div>
              <button onClick={() => setShowLinkModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleLink} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Platform Repository *
                </label>
                <select
                  value={linkRepoId}
                  onChange={(e) => setLinkRepoId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm"
                  title="Select platform repo"
                  required
                >
                  <option value="">Select a platform repo to link to...</option>
                  {availableRepos.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fullName} {r.isPrivate ? "🔒" : "🔓"} {r.language ? `(${r.language})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">The admin&apos;s repository you want to sync with</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Your GitHub Repository *
                </label>
                <input
                  type="text"
                  value={linkClientRepo}
                  onChange={(e) => setLinkClientRepo(e.target.value)}
                  placeholder="owner/repo-name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-sm"
                  required
                />
                <p className="text-xs text-slate-400 mt-1">Full name of your repo, e.g. &quot;myuser/my-project&quot;</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  GitHub Personal Access Token *
                </label>
                <input
                  type="password"
                  value={linkPat}
                  onChange={(e) => setLinkPat(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 text-sm font-mono"
                  required
                />
                <p className="text-xs text-slate-400 mt-1">
                  A PAT with <strong>repo</strong> scope for your repository.{" "}
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=GSS+Support+Link"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    Create one here
                  </a>
                </p>
              </div>

              {linkError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle size={14} /> {linkError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={linking || !linkRepoId || !linkClientRepo || !linkPat}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {linking ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  {linking ? "Linking..." : "Link Repository"}
                </button>
              </div>
            </form>

            {/* How it works */}
            <div className="px-6 pb-6">
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-slate-600 uppercase mb-2">How it works</h3>
                <div className="space-y-2 text-xs text-slate-500">
                  <div className="flex items-start gap-2">
                    <ArrowUpCircle size={14} className="text-green-500 mt-0.5 shrink-0" />
                    <span><strong>Push:</strong> Copies the latest code from the platform repo to your repo</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <ArrowDownCircle size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <span><strong>Pull:</strong> Copies the latest code from your repo into the platform repo (admin only)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <RefreshCw size={14} className="text-slate-400 mt-0.5 shrink-0" />
                    <span>Your PAT is stored encrypted and only used for sync operations</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
