"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  Pencil,
  GitMerge,
  ArrowRightLeft,
  UserCircle2,
  Settings,
} from "lucide-react";
import { GitHubIcon } from "@/components/icons";
import Link from "next/link";

interface CustomerAssignment {
  id: string;
  customerId: string;
  customer: { id: string; company: string; emailAddress: string };
  assignedAt: string;
}

interface GitHubAccount {
  id: string;
  label: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  _count: { repos: number };
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
  subProjectId: string | null;
  subProject: { id: string; name: string } | null;
  accountId: string | null;
  account: { id: string; label: string; owner: string } | null;
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
  const [subProjects, setSubProjects] = useState<Record<string, { id: string; name: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [ghToken, setGhToken] = useState("");
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [assigningRepoId, setAssigningRepoId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // Account state
  const [accounts, setAccounts] = useState<GitHubAccount[]>([]);
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [newAccountPat, setNewAccountPat] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string>("all");

  // Rename state
  const [renameRepoId, setRenameRepoId] = useState<string | null>(null);
  const [newRepoName, setNewRepoName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameResult, setRenameResult] = useState<string | null>(null);

  // Merge state
  const [mergeRepoId, setMergeRepoId] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState("");
  const [mergeSourceBranch, setMergeSourceBranch] = useState("main");
  const [mergeTargetBranch, setMergeTargetBranch] = useState("main");
  const [mergeConflictStrategy, setMergeConflictStrategy] = useState("ours");
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ message?: string; error?: string; localInstructions?: Record<string, string> } | null>(null);

  // Transfer state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferMode, setTransferMode] = useState<"single" | "all">("single");
  const [transferSource, setTransferSource] = useState("");
  const [transferSourceOwner, setTransferSourceOwner] = useState("");
  const [transferTarget, setTransferTarget] = useState("");
  const [transferTargetOptions, setTransferTargetOptions] = useState<string[]>([]);
  const [loadingTransferTargets, setLoadingTransferTargets] = useState(false);
  const [transferTargetOptionsError, setTransferTargetOptionsError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [transferResult, setTransferResult] = useState<{
    message?: string;
    error?: string;
    note?: string;
    summary?: { total: number; success: number; failed: number };
    failuresByStatus?: Record<string, number>;
    failedRepos?: Array<{ sourceRepo: string; error?: string; status?: number }>;
  } | null>(null);

  const transferOwnerOptions = useMemo(() => {
    const uniqueOwners = new Set<string>();
    for (const account of accounts) {
      if (account.owner?.trim()) uniqueOwners.add(account.owner.trim());
    }
    for (const repo of repos) {
      if (repo.owner?.trim()) uniqueOwners.add(repo.owner.trim());
    }
    return Array.from(uniqueOwners).sort((a, b) => a.localeCompare(b));
  }, [accounts, repos]);

  const isValidTransferTarget = useMemo(() => {
    if (transferMode !== "all") return true;
    if (!transferTarget.trim()) return false;
    return transferTargetOptions.some(
      (owner) => owner.toLowerCase() === transferTarget.trim().toLowerCase()
    );
  }, [transferMode, transferTarget, transferTargetOptions]);

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

  const fetchAccounts = useCallback(async () => {
    const res = await fetch("/api/github/accounts");
    if (res.ok) setAccounts(await res.json());
  }, []);

  useEffect(() => {
    if (session?.user && !isAdmin) router.push("/dashboard");
  }, [session, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) {
      fetchRepos();
      fetchCustomers();
      fetchProjects();
      fetchAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (transferMode !== "all") {
      setTransferTargetOptions([]);
      setTransferTargetOptionsError(null);
      setLoadingTransferTargets(false);
      return;
    }

    const owner = transferSourceOwner.trim();
    if (!owner) {
      setTransferTargetOptions([]);
      setTransferTargetOptionsError(null);
      setLoadingTransferTargets(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoadingTransferTargets(true);
      setTransferTargetOptionsError(null);
      try {
        const res = await fetch(`/api/github/repos/transfer?sourceOwner=${encodeURIComponent(owner)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setTransferTargetOptions([]);
          setTransferTargetOptionsError(data.error || "Failed to load target owners");
          return;
        }
        setTransferTargetOptions(Array.isArray(data.targetOwners) ? data.targetOwners : []);
        setTransferTarget((prev) => {
          if (!prev.trim()) return prev;
          const hasPrev = (Array.isArray(data.targetOwners) ? data.targetOwners : []).some(
            (v: string) => v.toLowerCase() === prev.trim().toLowerCase()
          );
          return hasPrev ? prev : "";
        });
      } catch {
        if (!cancelled) {
          setTransferTargetOptions([]);
          setTransferTargetOptionsError("Failed to load target owners");
        }
      } finally {
        if (!cancelled) setLoadingTransferTargets(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [transferMode, transferSourceOwner]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      if (accounts.length > 0) {
        // Sync all saved accounts
        const results: string[] = [];
        for (const acc of accounts) {
          const res = await fetch(`/api/github/accounts/${acc.id}/sync`, {
            method: "POST",
          });
          const data = await res.json();
          if (res.ok) {
            results.push(`${acc.label}: ${data.synced} repos`);
          } else {
            results.push(`${acc.label}: ${data.error || "failed"}`);
          }
        }
        setSyncResult(`Synced: ${results.join(", ")}`);
        fetchRepos();
        fetchAccounts();
      } else if (ghToken) {
        // Fallback: sync with manual token
        const res = await fetch("/api/github/repos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: ghToken }),
        });
        const data = await res.json();
        if (res.ok) {
          setSyncResult(`Synced ${data.synced} repos from GitHub`);
          fetchRepos();
        } else {
          setSyncResult(data.error || "Sync failed");
        }
      } else {
        setSyncResult("Add a GitHub account first, or enter a token below.");
      }
    } catch {
      setSyncResult("Network error");
    }
    setSyncing(false);
  };

  const handleSyncAccount = async (accountId: string) => {
    setSyncingAccountId(accountId);
    try {
      const res = await fetch(`/api/github/accounts/${accountId}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`Synced ${data.synced} repos from ${data.account}`);
        fetchRepos();
        fetchAccounts();
      }
    } catch { /* ignore */ }
    setSyncingAccountId(null);
  };

  const handleAddAccount = async () => {
    if (!newAccountLabel.trim() || !newAccountPat.trim()) return;
    setAddingAccount(true);
    setAccountError(null);
    try {
      const res = await fetch("/api/github/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newAccountLabel.trim(), pat: newAccountPat.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewAccountLabel("");
        setNewAccountPat("");
        fetchAccounts();
      } else {
        setAccountError(data.error || "Failed to add account");
      }
    } catch {
      setAccountError("Network error");
    }
    setAddingAccount(false);
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm("Remove this GitHub account? Repos will be kept but unlinked from this account.")) return;
    await fetch(`/api/github/accounts/${accountId}`, { method: "DELETE" });
    fetchAccounts();
    fetchRepos();
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
    // Fetch sub-projects for the newly selected project
    if (projectId) fetchSubProjects(projectId);
    fetchRepos();
  };

  const handleLinkSubProject = async (repoId: string, subProjectId: string) => {
    await fetch(`/api/github/repos/${repoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subProjectId: subProjectId || null }),
    });
    fetchRepos();
  };

  const fetchSubProjects = async (projectId: string) => {
    if (subProjects[projectId]) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/sub-projects`);
      if (res.ok) {
        const data = await res.json();
        setSubProjects((prev) => ({ ...prev, [projectId]: data.map((sp: { id: string; name: string }) => ({ id: sp.id, name: sp.name })) }));
      }
    } catch { /* ignore */ }
  };

  const handleRename = async () => {
    if (!renameRepoId || !newRepoName.trim()) return;
    setRenaming(true);
    setRenameResult(null);
    try {
      const res = await fetch(`/api/github/repos/${renameRepoId}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: newRepoName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setRenameResult(data.message);
        fetchRepos();
        setTimeout(() => { setRenameRepoId(null); setRenameResult(null); }, 2000);
      } else {
        setRenameResult(data.error || "Rename failed");
      }
    } catch {
      setRenameResult("Network error");
    }
    setRenaming(false);
  };

  const handleMerge = async () => {
    if (!mergeRepoId || !mergeSource.trim()) return;
    setMerging(true);
    setMergeResult(null);
    try {
      // Start the merge (returns immediately)
      const res = await fetch(`/api/github/repos/${mergeRepoId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceRepo: mergeSource.trim(),
          sourceBranch: mergeSourceBranch || "main",
          targetBranch: mergeTargetBranch || "main",
          conflictStrategy: mergeConflictStrategy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMergeResult({ error: data.error });
        setMerging(false);
        return;
      }

      // Poll for completion
      setMergeResult({ message: "Merge in progress... cloning and merging repos." });
      const jobId = data.jobId;
      const maxPoll = 300_000; // 5 min
      const start = Date.now();
      while (Date.now() - start < maxPoll) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const pollRes = await fetch(`/api/github/repos/${jobId}/merge`);
          const job = await pollRes.json();
          if (job.status === "success") {
            setMergeResult({ message: job.message });
            fetchRepos();
            break;
          } else if (job.status === "error") {
            setMergeResult({ error: job.message });
            break;
          }
          // still running — keep polling
        } catch {
          // network hiccup, keep trying
        }
      }
      if (Date.now() - start >= maxPoll) {
        setMergeResult({ message: "Merge is still running in the background. Refresh the page to check status." });
      }
    } catch {
      setMergeResult({ error: "Failed to start merge. Check your connection." });
    }
    setMerging(false);
  };

  const handleTransfer = async () => {
    if (transferMode === "single" && !transferSource.trim()) return;
    if (transferMode === "all" && (!transferSourceOwner.trim() || !transferTarget.trim())) return;
    setTransferring(true);
    setTransferResult(null);
    try {
      const res = await fetch("/api/github/repos/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferAll: transferMode === "all",
          sourceRepo: transferMode === "single" ? transferSource.trim() : undefined,
          sourceOwner: transferMode === "all" ? transferSourceOwner.trim() : undefined,
          targetOwner: transferTarget.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTransferResult({
          message: data.message,
          note: data.note,
          summary: data.summary,
          failuresByStatus: data.failuresByStatus,
          failedRepos: Array.isArray(data.results)
            ? data.results
                .filter((r: { ok?: boolean }) => !r.ok)
                .slice(0, 12)
                .map((r: { sourceRepo: string; error?: string; status?: number }) => ({
                  sourceRepo: r.sourceRepo,
                  error: r.error,
                  status: r.status,
                }))
            : [],
        });
        fetchRepos();
      } else {
        setTransferResult({ error: data.error });
      }
    } catch {
      setTransferResult({ error: "Network error" });
    }
    setTransferring(false);
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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAccountsModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 transition shadow-sm"
          >
            <Settings size={16} />
            Accounts ({accounts.length})
          </button>
          <button
            onClick={() => setShowTransferModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition shadow-sm"
          >
            <ArrowRightLeft size={16} />
            Transfer Repos
          </button>
          <button
            onClick={() => {
              if (accounts.length > 0) {
                handleSync();
              } else {
                setShowSyncModal(true);
              }
            }}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600 transition shadow-sm disabled:opacity-50"
          >
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {syncing ? "Syncing..." : `Sync ${accounts.length > 0 ? "All Accounts" : "from GitHub"}`}
          </button>
        </div>
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

      {/* Accounts Modal */}
      {showAccountsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCircle2 size={18} /> GitHub Accounts
              </h2>
              <button onClick={() => { setShowAccountsModal(false); setAccountError(null); }} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Add multiple GitHub accounts. Their repos will be synced and managed from a single console.
            </p>

            {/* Existing accounts */}
            {accounts.length > 0 && (
              <div className="space-y-2 mb-4">
                {accounts.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <UserCircle2 size={18} className="text-slate-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{acc.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">@{acc.owner} · {acc._count.repos} repos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSyncAccount(acc.id)}
                        disabled={syncingAccountId === acc.id}
                        title="Sync this account"
                        className="p-1.5 text-brand-500 hover:text-brand-600 transition disabled:opacity-50"
                      >
                        {syncingAccountId === acc.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(acc.id)}
                        title="Remove account"
                        className="p-1.5 text-red-400 hover:text-red-600 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  To delete a GitHub account, click the trash icon. This removes the saved account and unlinks repos in this system (it does not delete repos on GitHub).
                </p>
              </div>
            )}

            {accounts.length === 0 && (
              <div className="text-center py-4 mb-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                <UserCircle2 size={24} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400">No accounts added yet</p>
              </div>
            )}

            {/* Add account form */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Add Account</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Label *</label>
                  <input
                    type="text"
                    value={newAccountLabel}
                    onChange={(e) => setNewAccountLabel(e.target.value)}
                    placeholder='e.g. "GlobalWebServe" or "Personal"'
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Personal Access Token *</label>
                  <input
                    type="password"
                    value={newAccountPat}
                    onChange={(e) => setNewAccountPat(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">Needs <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">repo</code> scope. Token is encrypted at rest.</p>
                </div>
              </div>
              {accountError && (
                <div className="text-sm mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                  {accountError}
                </div>
              )}
              <div className="flex gap-3 justify-end mt-4">
                <button
                  onClick={() => { setShowAccountsModal(false); setAccountError(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  Close
                </button>
                <button
                  onClick={handleAddAccount}
                  disabled={addingAccount || !newAccountLabel.trim() || !newAccountPat.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
                >
                  {addingAccount ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {addingAccount ? "Adding..." : "Add Account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Repo Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowRightLeft size={18} /> Transfer Repositories
              </h2>
              <button onClick={() => { setShowTransferModal(false); setTransferResult(null); }} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Transfer one repo or all repos from one GitHub account owner to another. Source token must have admin access.
            </p>
            <div className="flex gap-2 mb-4 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
              <button
                onClick={() => {
                  setTransferMode("single");
                  setTransferResult(null);
                }}
                className={`flex-1 px-3 py-1.5 text-xs rounded-md transition ${transferMode === "single" ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}
              >
                Single Repo
              </button>
              <button
                onClick={() => {
                  setTransferMode("all");
                  setTransferResult(null);
                }}
                className={`flex-1 px-3 py-1.5 text-xs rounded-md transition ${transferMode === "all" ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}
              >
                All Repos
              </button>
            </div>
            <div className="space-y-3">
              {transferMode === "single" ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Source Repo (owner/name) *</label>
                  <input
                    type="text"
                    value={transferSource}
                    onChange={(e) => setTransferSource(e.target.value)}
                    placeholder="other-user/repo-name"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Source Owner (GitHub username/org) *</label>
                  <input
                    type="text"
                    value={transferSourceOwner}
                    onChange={(e) => {
                      setTransferSourceOwner(e.target.value);
                      setTransferTarget("");
                    }}
                    list="transfer-owner-options"
                    placeholder="source-account-owner"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                  />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose from the dropdown (existing accounts/synced owners) or type an owner. All synced repos for this owner will be transferred.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Target Owner/Org {transferMode === "all" ? "*" : "(leave blank for PAT owner)"}</label>
                  {transferMode === "all" ? (
                    <select
                      title="Target owner/org"
                      value={transferTarget}
                      onChange={(e) => setTransferTarget(e.target.value)}
                      disabled={loadingTransferTargets || !transferSourceOwner.trim() || transferTargetOptions.length === 0}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none disabled:opacity-60"
                    >
                      <option value="">
                        {loadingTransferTargets
                          ? "Loading target owners..."
                          : transferSourceOwner.trim()
                            ? (transferTargetOptions.length > 0 ? "Select target owner/org" : "No accessible target owners found")
                            : "Select source owner first"}
                      </option>
                      {transferTargetOptions.map((owner) => (
                        <option key={owner} value={owner}>{owner}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={transferTarget}
                      onChange={(e) => setTransferTarget(e.target.value)}
                      list="transfer-owner-options"
                      placeholder="GlobalWebServe"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                    />
                  )}
                  {transferMode === "all" && transferTargetOptionsError && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{transferTargetOptionsError}</p>
                  )}
              </div>
            </div>
            {transferOwnerOptions.length > 0 && (
              <datalist id="transfer-owner-options">
                {transferOwnerOptions.map((owner) => (
                  <option key={owner} value={owner} />
                ))}
              </datalist>
            )}
            {transferResult && (
              <div className={`text-sm mt-4 p-3 rounded-lg ${transferResult.message ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"}`}>
                {transferResult.message || transferResult.error}
                {transferResult.summary && (
                  <p className="mt-1 text-xs opacity-90">
                    Total: {transferResult.summary.total} · Success: {transferResult.summary.success} · Failed: {transferResult.summary.failed}
                  </p>
                )}
                {transferResult.failuresByStatus && Object.keys(transferResult.failuresByStatus).length > 0 && (
                  <p className="mt-1 text-xs opacity-90">
                    Failure status codes: {Object.entries(transferResult.failuresByStatus).map(([code, count]) => `${code}=${count}`).join(" · ")}
                  </p>
                )}
                {transferResult.failedRepos && transferResult.failedRepos.length > 0 && (
                  <div className="mt-2 max-h-44 overflow-y-auto rounded border border-red-200 dark:border-red-800 p-2 text-xs bg-white/50 dark:bg-black/10">
                    {transferResult.failedRepos.map((f) => (
                      <div key={f.sourceRepo} className="mb-1">
                        <span className="font-medium">{f.sourceRepo}</span>
                        <span className="opacity-90">: {f.error || `Failed${f.status ? ` (${f.status})` : ""}`}</span>
                      </div>
                    ))}
                  </div>
                )}
                {transferResult.note && <p className="mt-1 text-xs opacity-75">{transferResult.note}</p>}
              </div>
            )}
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => { setShowTransferModal(false); setTransferResult(null); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
              >
                Close
              </button>
              <button
                onClick={handleTransfer}
                disabled={
                  transferring ||
                  (transferMode === "single"
                    ? !transferSource.trim()
                    : (!transferSourceOwner.trim() || !transferTarget.trim() || !isValidTransferTarget || loadingTransferTargets))
                }
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition disabled:opacity-50"
              >
                {transferring ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
                {transferring ? "Transferring..." : transferMode === "all" ? "Transfer All" : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Repo Modal */}
      {renameRepoId && (() => {
        const renameRepo = repos.find((r) => r.id === renameRepoId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Pencil size={18} /> Rename Repository
                </h2>
                <button onClick={() => { setRenameRepoId(null); setRenameResult(null); }} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Rename <strong>{renameRepo?.fullName}</strong> on GitHub. GitHub will set up redirects from the old URL.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">New Name *</label>
                  <input
                    type="text"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder="new-repo-name"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                  />
                </div>
              </div>
              {renameResult && (
                <div className={`text-sm mt-4 p-3 rounded-lg ${renameResult.startsWith("Repo renamed") ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"}`}>
                  {renameResult}
                </div>
              )}
              <div className="flex gap-3 justify-end mt-4">
                <button
                  onClick={() => { setRenameRepoId(null); setRenameResult(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRename}
                  disabled={renaming || !newRepoName.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
                >
                  {renaming ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                  {renaming ? "Renaming..." : "Rename"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Merge History Modal */}
      {mergeRepoId && (() => {
        const mergeRepo = repos.find((r) => r.id === mergeRepoId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <GitMerge size={18} /> Merge Repository History
                </h2>
                <button onClick={() => { setMergeRepoId(null); setMergeResult(null); }} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Merge commit history from another repo into <strong>{mergeRepo?.fullName}</strong>.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Source Repo (owner/name) *</label>
                  <input
                    type="text"
                    value={mergeSource}
                    onChange={(e) => setMergeSource(e.target.value)}
                    placeholder="other-org/source-repo"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Source Branch</label>
                    <input
                      type="text"
                      value={mergeSourceBranch}
                      onChange={(e) => setMergeSourceBranch(e.target.value)}
                      placeholder="main"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Target Branch</label>
                    <input
                      type="text"
                      value={mergeTargetBranch}
                      onChange={(e) => setMergeTargetBranch(e.target.value)}
                      placeholder="main"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">On Conflict</label>
                  <select
                    value={mergeConflictStrategy}
                    onChange={(e) => setMergeConflictStrategy(e.target.value)}
                    title="Conflict resolution strategy"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                  >
                    <option value="ours">Keep target repo files (recommended)</option>
                    <option value="theirs">Keep source repo files</option>
                  </select>
                </div>
              </div>
              {mergeResult && (
                <div className={`text-sm mt-4 p-3 rounded-lg ${mergeResult.message ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"}`}>
                  {mergeResult.message || mergeResult.error}
                  {mergeResult.localInstructions && (
                    <div className="mt-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
                      <p className="font-medium text-slate-700 dark:text-slate-300 text-xs mb-2">Manual merge steps (for unrelated histories):</p>
                      <pre className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
{Object.values(mergeResult.localInstructions).join("\n")}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3 justify-end mt-4">
                <button
                  onClick={() => { setMergeRepoId(null); setMergeResult(null); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMerge}
                  disabled={merging || !mergeSource.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50"
                >
                  {merging ? <Loader2 size={14} className="animate-spin" /> : <GitMerge size={14} />}
                  {merging ? "Merging..." : "Merge History"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repos..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
          />
        </div>
        {accounts.length > 0 && (
          <select
            title="Filter by account"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
          >
            <option value="all">All Accounts</option>
            <option value="unlinked">No Account</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.label} (@{acc.owner})</option>
            ))}
          </select>
        )}
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className={`text-sm mb-4 p-3 rounded-lg ${syncResult.startsWith("Synced") ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"}`}>
          {syncResult}
          <button onClick={() => setSyncResult(null)} className="ml-2 text-xs underline opacity-70 hover:opacity-100">dismiss</button>
        </div>
      )}

      {/* Repos List */}
      {repos.length === 0 ? (
        <div className="text-center py-20">
          <Code2 size={48} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">No repos synced yet. Click &quot;Sync All Accounts&quot; to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {repos
            .filter(
              (r) =>
                (!search ||
                  r.fullName.toLowerCase().includes(search.toLowerCase()) ||
                  (r.description || "").toLowerCase().includes(search.toLowerCase())) &&
                (accountFilter === "all" ||
                  (accountFilter === "unlinked" ? !r.accountId : r.accountId === accountFilter))
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
                      {repo.account && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          <UserCircle2 size={10} /> {repo.account.label}
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
                  <div className="flex-shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => { setRenameRepoId(repo.id); setNewRepoName(repo.name); setRenameResult(null); }}
                      className="text-slate-400 hover:text-brand-500 transition p-1"
                      title="Rename repo"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => { setMergeRepoId(repo.id); setMergeSource(""); setMergeResult(null); }}
                      className="text-slate-400 hover:text-purple-500 transition p-1"
                      title="Merge history from another repo"
                    >
                      <GitMerge size={16} />
                    </button>
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
                  {repo.projectId && (
                    <div className="flex items-center gap-3 mt-2 ml-5">
                      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <FolderKanban size={12} />
                        Sub-Project
                      </h3>
                      <select
                        title="Link to sub-project"
                        value={repo.subProjectId || ""}
                        onChange={(e) => handleLinkSubProject(repo.id, e.target.value)}
                        onFocus={() => repo.projectId && fetchSubProjects(repo.projectId)}
                        className="flex-1 max-w-xs px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
                      >
                        <option value="">No sub-project linked</option>
                        {(subProjects[repo.projectId] || []).map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.name}
                          </option>
                        ))}
                      </select>
                      {repo.subProject && (
                        <span className="text-xs text-slate-500">{repo.subProject.name}</span>
                      )}
                    </div>
                  )}
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
