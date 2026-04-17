"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Search,
  Lock,
  Unlock,
  ExternalLink,
  Loader2,
  Code2,
  GitCommit,
  Clock,
} from "lucide-react";
import { GitHubIcon } from "@/components/icons";

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
  customers: {
    id: string;
    customer: { id: string; company: string };
  }[];
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

export default function CodeHistoryPage() {
  const { data: session } = useSession();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/github/my-repos");
        if (res.ok && !cancelled) setRepos(await res.json());
      } catch {
        // ignore
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session]);

  const filtered = repos.filter(
    (r) =>
      !search ||
      r.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <GitCommit size={28} /> Code History
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          View repositories and their latest commits
        </p>
      </div>

      {/* Search */}
      {repos.length > 0 && (
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
      )}

      {/* Repos */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <Code2 size={48} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-slate-500 dark:text-slate-400">
            {repos.length === 0
              ? "No repositories available. Contact your admin."
              : "No repos match your search."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((repo) => (
            <Link
              key={repo.id}
              href={`/code-history/${repo.id}`}
              className="block bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 hover:border-brand-300 dark:hover:border-brand-600 hover:shadow-md transition group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <GitHubIcon size={18} className="text-slate-400 group-hover:text-brand-500 transition flex-shrink-0" />
                    <span className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition">
                      {repo.fullName}
                    </span>
                    {repo.isPrivate ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        <Lock size={10} /> Private
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <Unlock size={10} /> Public
                      </span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {repo.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                    {repo.language && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${LANG_COLORS[repo.language] || "bg-slate-400"}`} />
                        {repo.language}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      Added {new Date(repo.createdAt).toLocaleDateString("en-ZA")}
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 rounded-lg group-hover:bg-brand-100 dark:group-hover:bg-brand-900/30 transition">
                    <GitCommit size={14} /> View Commits
                  </span>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-brand-500 transition p-1"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(repo.htmlUrl, "_blank", "noopener,noreferrer");
                    }}
                    title="Open on GitHub"
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
