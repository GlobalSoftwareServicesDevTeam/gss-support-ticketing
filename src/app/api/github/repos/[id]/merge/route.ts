import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { spawn } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const GITHUB_API = "https://api.github.com";

// In-memory merge job tracker
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

// POST: start an async merge of another repo's history into this repo
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

  // Check if a merge is already running for this repo
  const existing = mergeJobs.get(id);
  if (existing?.status === "running") {
    return NextResponse.json(
      { error: "A merge is already in progress for this repo." },
      { status: 409 }
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

  // Mark job as running and return immediately
  cleanOldJobs();
  mergeJobs.set(id, { status: "running", startedAt: Date.now() });

  // Create temp dir and script, then run in background
  const tmpDir = mkdtempSync(join(tmpdir(), "merge-"));
  const scriptPath = join(tmpDir, "merge.sh");

  const targetUrl = `https://x-access-token:${ghToken}@github.com/${targetFullName}.git`;
  const sourceUrl = `https://x-access-token:${srcToken}@github.com/${sourceRepo}.git`;

  // Write a shell script that performs the merge
  // Auto-detect source branch if it doesn't exist (e.g. main vs master)
  const script = `#!/bin/bash
set -e
cd "${tmpDir.replace(/\\/g, "/")}"
git clone -c core.longpaths=true --branch "${tgtBranch}" "${targetUrl}" repo
cd repo
git config core.longpaths true
git config user.name "gss-support-bot"
git config user.email "support@globalwebserve.com"
git remote add source "${sourceUrl}"

# Try the requested branch first, fall back to detecting default branch
SRC_BRANCH="${srcBranch}"
if ! git ls-remote --exit-code --heads source "$SRC_BRANCH" > /dev/null 2>&1; then
  # Detect the default branch from the remote HEAD
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

  // Spawn git bash to run the script (works on Windows with Git installed)
  const gitBash = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "/bin/bash";
  const child = spawn(gitBash, [scriptPath.replace(/\\/g, "/")], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

  child.on("close", async (code) => {
    try {
      if (code === 0 && stdout.includes("MERGE_SUCCESS")) {
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

        // Delete source repo from local database
        try {
          const [sOwner, sName] = sourceRepo.split("/");
          const localSource = await prisma.gitHubRepo.findFirst({
            where: { owner: sOwner, name: sName },
          });
          if (localSource) {
            await prisma.customerRepo.deleteMany({ where: { repoId: localSource.id } });
            await prisma.gitHubRepo.delete({ where: { id: localSource.id } });
          }
        } catch {
          // ignore DB cleanup failures
        }

        mergeJobs.set(id, {
          status: "success",
          message: `Successfully merged ${sourceRepo}/${srcBranch} into ${repo.fullName}/${tgtBranch}${sourceDeleted ? ". Source repo deleted." : ". Note: could not delete source repo on GitHub."}`,
          sourceDeleted,
          startedAt: Date.now(),
        });
      } else {
        // Extract useful error from stderr
        const errMsg = stderr.split("\n").filter(l => l.includes("fatal:") || l.includes("error:")).join("; ") || stderr.slice(-500) || `Exit code ${code}`;
        mergeJobs.set(id, {
          status: "error",
          message: `Merge failed: ${errMsg}`,
          startedAt: Date.now(),
        });
      }
    } catch (err) {
      mergeJobs.set(id, {
        status: "error",
        message: `Merge post-processing error: ${err instanceof Error ? err.message : String(err)}`,
        startedAt: Date.now(),
      });
    }

    // Clean up temp directory
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  child.unref();

  return NextResponse.json({
    success: true,
    message: "Merge started. Polling for status...",
    jobId: id,
  });
}
