"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  GitCommit,
  GitBranch,
  Loader2,
  ExternalLink,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Clock,
  Code2,
  FileCode,
  Plus,
  Minus,
} from "lucide-react";

interface Commit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: {
    login: string;
    avatar_url: string;
    html_url: string;
  } | null;
  html_url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
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
}

export default function RepoCommitsPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const repoId = params.id as string;

  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [branch, setBranch] = useState("");
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [commitDetail, setCommitDetail] = useState<Record<string, { files: CommitFile[]; stats: { additions: number; deletions: number; total: number } }>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  interface CommitFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ page: String(page), per_page: "30" });
        if (branch) qs.set("sha", branch);
        const res = await fetch(`/api/github/repos/${repoId}/commits?${qs}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setCommits(data.commits);
          setBranches(data.branches);
          setRepo(data.repo);
        } else if (res.status === 403) {
          router.push("/code-history");
        }
      } catch {
        // ignore
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session, repoId, page, branch, router]);

  const fetchCommitDetail = async (sha: string) => {
    if (commitDetail[sha]) {
      setExpandedSha(expandedSha === sha ? null : sha);
      return;
    }
    setLoadingDetail(sha);
    setExpandedSha(sha);
    try {
      // For detail we'll fetch via the GitHub API through our proxy
      const res = await fetch(`/api/github/repos/${repoId}/commits/${sha}`);
      if (res.ok) {
        const data = await res.json();
        setCommitDetail((prev) => ({ ...prev, [sha]: { files: data.files, stats: data.stats } }));
      }
    } catch {
      // ignore
    }
    setLoadingDetail(null);
  };

  function timeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  }

  function formatDate(d: string): string {
    return new Date(d).toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Back */}
      <Link
        href="/code-history"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-500 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Repositories
      </Link>

      {/* Repo Header */}
      {repo && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  {repo.fullName}
                </h1>
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
                  <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                    {repo.language}
                  </span>
                )}
              </div>
              {repo.description && (
                <p className="text-sm text-slate-500 mt-1">{repo.description}</p>
              )}
            </div>
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              <ExternalLink size={14} /> View on GitHub
            </a>
          </div>

          {/* Branch Selector */}
          {branches.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <GitBranch size={16} className="text-slate-400" />
              <select
                value={branch}
                onChange={(e) => { setBranch(e.target.value); setPage(1); }}
                title="Select branch"
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 outline-none"
              >
                <option value="">Default branch</option>
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Commits List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <GitCommit size={16} /> Commits
          </h2>
          {loading && <Loader2 size={14} className="animate-spin text-brand-500" />}
        </div>

        {commits.length === 0 && !loading ? (
          <div className="text-center py-16 text-slate-500">
            <Code2 size={40} className="mx-auto mb-2 opacity-30" />
            No commits found
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {commits.map((commit) => {
              const firstLine = commit.commit.message.split("\n")[0];
              const restLines = commit.commit.message.split("\n").slice(1).join("\n").trim();
              const isExpanded = expandedSha === commit.sha;
              const detail = commitDetail[commit.sha];

              return (
                <div key={commit.sha}>
                  <div
                    className="px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition cursor-pointer"
                    onClick={() => fetchCommitDetail(commit.sha)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="flex-shrink-0 mt-0.5">
                        {commit.author?.avatar_url ? (
                          <Image
                            src={commit.author.avatar_url}
                            alt={commit.author.login}
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center">
                            <UserIcon size={14} className="text-slate-400" />
                          </div>
                        )}
                      </div>

                      {/* Message & Meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white leading-snug">
                          {firstLine}
                        </p>
                        {restLines && !isExpanded && (
                          <span className="text-xs text-slate-400 mt-0.5">...</span>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                          <span className="font-medium text-slate-600 dark:text-slate-300">
                            {commit.author?.login || commit.commit.author.name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            <span title={formatDate(commit.commit.author.date)}>
                              {timeAgo(commit.commit.author.date)}
                            </span>
                          </span>
                          <a
                            href={commit.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-brand-500 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {commit.sha.slice(0, 7)}
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="px-5 pb-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700/50">
                      {loadingDetail === commit.sha ? (
                        <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                          <Loader2 size={14} className="animate-spin" /> Loading commit details...
                        </div>
                      ) : detail ? (
                        <>
                          {/* Full commit message */}
                          {restLines && (
                            <pre className="text-xs text-slate-600 dark:text-slate-400 mt-3 mb-3 whitespace-pre-wrap font-sans leading-relaxed">
                              {restLines}
                            </pre>
                          )}

                          {/* Stats */}
                          <div className="flex items-center gap-4 text-xs mt-3 mb-3">
                            <span className="flex items-center gap-1 text-slate-500">
                              <FileCode size={12} /> {detail.files.length} file{detail.files.length !== 1 ? "s" : ""} changed
                            </span>
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <Plus size={12} /> {detail.stats.additions}
                            </span>
                            <span className="flex items-center gap-1 text-red-500">
                              <Minus size={12} /> {detail.stats.deletions}
                            </span>
                          </div>

                          {/* Changed Files */}
                          <div className="space-y-1">
                            {detail.files.map((f) => (
                              <div
                                key={f.filename}
                                className="flex items-center justify-between px-3 py-1.5 rounded text-xs bg-white dark:bg-gray-700/50 border border-slate-200 dark:border-slate-600"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
                                      f.status === "added"
                                        ? "bg-green-500"
                                        : f.status === "removed"
                                        ? "bg-red-500"
                                        : f.status === "renamed"
                                        ? "bg-blue-500"
                                        : "bg-yellow-500"
                                    }`}
                                  />
                                  <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                                    {f.filename}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                  {f.additions > 0 && (
                                    <span className="text-green-600 dark:text-green-400">+{f.additions}</span>
                                  )}
                                  {f.deletions > 0 && (
                                    <span className="text-red-500">-{f.deletions}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="py-3 text-xs text-slate-400">
                          Click to load details
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {commits.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} /> Newer
            </button>
            <span className="text-xs text-slate-400">Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={commits.length < 30}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Older <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
