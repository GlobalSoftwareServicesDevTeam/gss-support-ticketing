import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { spawn } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Allow up to 5 minutes for git clone + merge operations
export const maxDuration = 300;

const GITHUB_API = "https://api.github.com";

// In-memory merge job tracker (legacy, kept for any in-flight poll requests)
type MergeJob = {
  status: "running" | "success" | "error";
  message?: string;
  sourceDeleted?: boolean;
  startedAt: number;
};
const mergeJobs = new Map<string, MergeJob>();

// Clean up old jobs after 10 minutes
function cleanOldJobs() {
  const cutoff = Date.now() - 600_000;
  for (const [key, job] of mergeJobs) {
    if (job.startedAt < cutoff) mergeJobs.delete(key);
  }
}

async function getRepoToken(repo: { accountId: string | null; owner: string }): Promise<string | null> {
  if (repo.accountId) {
    const account = await prisma.gitHubAccount.findUnique({ where: { id: repo.accountId } });
    if (account) return decrypt(account.patEncrypted);
  }
  const accounts = await prisma.gitHubAccount.findMany();
  for (const acc of accounts) {
    if (acc.label.toLowerCase() === repo.owner.toLowerCase() ||
        acc.owner.toLowerCase() === repo.owner.toLowerCase()) {
      return decrypt(acc.patEncrypted);
    }
  }
  return process.env.GITHUB_PAT || null;
}

async function getTokenForOwner(owner: string): Promise<string | null> {
  const accounts = await prisma.gitHubAccount.findMany();
  for (const acc of accounts) {
    if (acc.label.toLowerCase() === owner.toLowerCase() ||
        acc.owner.toLowerCase() === owner.toLowerCase()) {
      return decrypt(acc.patEncrypted);
    }
  }
  return process.env.GITHUB_PAT || null;
}

// GET: poll merge job status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = mergeJobs.get(id);
  if (!job) {
    return NextResponse.json({ status: "not_found" });
  }
  return NextResponse.json(job);
}

// POST: merge another repo's history into this repo (synchronous — awaits git completion)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { sourceRepo, sourceBranch, targetBranch, conflictStrategy } = await req.json();

  if (!sourceRepo || typeof sourceRepo !== "string") {
    return NextResponse.json(
      { error: "sourceRepo is required (owner/name format)" },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(sourceRepo)) {
    return NextResponse.json(
      { error: "sourceRepo must be in owner/name format" },
      { status: 400 }
    );
  }

  const repo = await prisma.gitHubRepo.findUnique({ where: { id } });
  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const ghToken = await getRepoToken(repo);
  if (!ghToken) {
    return NextResponse.json(
      { error: "No GitHub token found. Link this repo to a GitHub account first." },
      { status: 400 }
    );
  }

  const srcBranch = sourceBranch || "main";
  const tgtBranch = targetBranch || "main";
  const targetFullName = `${repo.owner}/${repo.name}`;
  const strategy = conflictStrategy === "theirs" ? "theirs" : "ours";

  const [srcOwner] = sourceRepo.split("/");
  const srcToken = await getTokenForOwner(srcOwner) || ghToken;

  const tmpDir = mkdtempSync(join(tmpdir(), "merge-"));
  const scriptPath = join(tmpDir, "merge.sh");

  const targetUrl = `https://x-access-token:${ghToken}@github.com/${targetFullName}.git`;
  const sourceUrl = `https://x-access-token:${srcToken}@github.com/${sourceRepo}.git`;

  const script = `#!/bin/bash
set -e
cd "${tmpDir.replace(/\\/g, "/")}"
git clone -c core.longpaths=true --branch "${tgtBranch}" "${targetUrl}" repo
cd repo
git config core.longpaths true
git config user.name "gss-support-bot"
git config user.email "support@globalwebserve.com"
git remote add source "${sourceUrl}"

SRC_BRANCH="${srcBranch}"
if ! git ls-remote --exit-code --heads source "$SRC_BRANCH" > /dev/null 2>&1; then
  DEFAULT=$(git remote show source 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}')
  if [ -n "$DEFAULT" ]; then
    SRC_BRANCH="$DEFAULT"
    echo "Branch '${srcBranch}' not found, using default branch: $SRC_BRANCH"
  else
    echo "fatal: couldn't find branch '${srcBranch}' or detect default branch" >&2
    exit 1
  fi
fi

git fetch source "$SRC_BRANCH"
git merge FETCH_HEAD --allow-unrelated-histories -X "${strategy}" -m "Merge history from ${sourceRepo} ($SRC_BRANCH)"
git push origin "${tgtBranch}"
echo "MERGE_SUCCESS"
`;

  writeFileSync(scriptPath, script, { mode: 0o755 });

  const gitBash = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/bin/bash";

  // Run synchronously — await the child process to complete
  const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(gitBash, [scriptPath.replace(/\\/g, "/")], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });

  try {
    if (result.code === 0 && result.stdout.includes("MERGE_SUCCESS")) {
      // Delete source repo on GitHub
      let sourceDeleted = false;
      try {
        const delRes = await fetch(`${GITHUB_API}/repos/${sourceRepo}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${srcToken}`,
            Accept: "application/vnd.github+json",
          },
        });
        sourceDeleted = delRes.ok || delRes.status === 204;
      } catch {
        // ignore delete failures
      }

      // Delete source repo from local DB (cascade handles linked records)
      try {
        const [sOwner, sName] = sourceRepo.split("/");
        const localSource = await prisma.gitHubRepo.findFirst({ where: { owner: sOwner, name: sName } });
        if (localSource) {
          await prisma.gitHubRepo.delete({ where: { id: localSource.id } });
        }
      } catch {
        // ignore DB cleanup failures
      }

      return NextResponse.json({
        success: true,
        message: `Successfully merged ${sourceRepo}/${srcBranch} into ${targetFullName}/${tgtBranch}.${sourceDeleted ? " Source repo deleted." : " Note: could not delete source repo on GitHub."}`,
        sourceDeleted,
      });
    } else {
      const errMsg = result.stderr.split("\n")
        .filter(l => l.includes("fatal:") || l.includes("error:"))
        .join("; ") || result.stderr.slice(-500) || `Exit code ${result.code}`;
      return NextResponse.json({ error: `Merge failed: ${errMsg}` }, { status: 500 });
    }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
