import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

const GITHUB_API = "https://api.github.com";

/**
 * Get the default branch of a repo
 */
async function getDefaultBranch(token: string, owner: string, name: string): Promise<string | null> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.default_branch || "main";
}

/**
 * Get latest commit SHA on a branch
 */
async function getBranchSha(token: string, owner: string, name: string, branch: string): Promise<string | null> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/git/refs/heads/${branch}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.object?.sha || null;
}

/**
 * Get commit details
 */
async function getCommit(token: string, owner: string, name: string, sha: string) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/commits/${sha}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Get tree for a commit
 */
async function getTree(token: string, owner: string, name: string, sha: string) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/git/trees/${sha}?recursive=1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Get a blob (file content)
 */
async function getBlob(token: string, owner: string, name: string, sha: string) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/git/blobs/${sha}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Create a blob in a repo
 */
async function createBlob(token: string, owner: string, name: string, content: string, encoding: string) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/git/blobs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ content, encoding }),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Create a tree in a repo
 */
async function createTree(token: string, owner: string, name: string, baseTree: string | null, tree: Array<{ path: string; mode: string; type: string; sha: string }>) {
  const body: Record<string, unknown> = { tree };
  if (baseTree) body.base_tree = baseTree;
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/git/trees`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Create a commit in a repo
 */
async function createCommit(token: string, owner: string, name: string, message: string, tree: string, parents: string[]) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/git/commits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree, parents }),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Update a branch reference
 */
async function updateRef(token: string, owner: string, name: string, branch: string, sha: string) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${name}/git/refs/heads/${branch}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({ sha, force: false }),
  });
  return res.ok;
}

/** Get admin token for a platform repo */
async function getAdminToken(repo: { accountId: string | null; owner: string }): Promise<string | null> {
  if (repo.accountId) {
    const account = await prisma.gitHubAccount.findUnique({ where: { id: repo.accountId } });
    if (account) return decrypt(account.patEncrypted);
  }
  const accounts = await prisma.gitHubAccount.findMany();
  for (const acc of accounts) {
    if (acc.owner.toLowerCase() === repo.owner.toLowerCase()) {
      return decrypt(acc.patEncrypted);
    }
  }
  return process.env.GITHUB_PAT || null;
}

/**
 * POST /api/client-repos/[id]/sync — push or pull code between client and platform repos
 * Body: { direction: "push" | "pull", branch?: string }
 * push = copy code from platform (admin) repo → client repo
 * pull = copy code from client repo → platform (admin) repo
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  const link = await prisma.clientGitHubLink.findUnique({
    where: { id },
    include: { repo: true },
  });

  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  // Only owner or admin can sync
  if (!isAdmin && link.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { direction } = body;

  if (!direction || !["push", "pull"].includes(direction)) {
    return NextResponse.json({ error: "direction must be 'push' or 'pull'" }, { status: 400 });
  }

  // Get tokens
  const clientPat = decrypt(link.patEncrypted);
  const adminToken = await getAdminToken(link.repo);

  if (!adminToken) {
    return NextResponse.json({ error: "Could not find admin token for platform repo" }, { status: 500 });
  }

  try {
    let sourceToken: string, sourceOwner: string, sourceName: string;
    let destToken: string, destOwner: string, destName: string;

    if (direction === "push") {
      // push: platform → client
      sourceToken = adminToken;
      sourceOwner = link.repo.owner;
      sourceName = link.repo.name;
      destToken = clientPat;
      destOwner = link.clientOwner;
      destName = link.clientRepoName;
    } else {
      // pull: client → platform
      sourceToken = clientPat;
      sourceOwner = link.clientOwner;
      sourceName = link.clientRepoName;
      destToken = adminToken;
      destOwner = link.repo.owner;
      destName = link.repo.name;
    }

    // Get default branches
    const sourceBranch = await getDefaultBranch(sourceToken, sourceOwner, sourceName);
    const destBranch = await getDefaultBranch(destToken, destOwner, destName);
    if (!sourceBranch) {
      return NextResponse.json({ error: `Could not get default branch for ${sourceOwner}/${sourceName}` }, { status: 500 });
    }
    if (!destBranch) {
      return NextResponse.json({ error: `Could not get default branch for ${destOwner}/${destName}` }, { status: 500 });
    }

    // Get source latest commit
    const sourceSha = await getBranchSha(sourceToken, sourceOwner, sourceName, sourceBranch);
    if (!sourceSha) {
      return NextResponse.json({ error: `Could not get latest commit from source repo` }, { status: 500 });
    }

    // Get dest latest commit
    const destSha = await getBranchSha(destToken, destOwner, destName, destBranch);
    if (!destSha) {
      return NextResponse.json({ error: `Could not get latest commit from destination repo` }, { status: 500 });
    }

    // Get source tree
    const sourceCommit = await getCommit(sourceToken, sourceOwner, sourceName, sourceSha);
    if (!sourceCommit) {
      return NextResponse.json({ error: "Could not get source commit" }, { status: 500 });
    }

    const sourceTree = await getTree(sourceToken, sourceOwner, sourceName, sourceCommit.commit.tree.sha);
    if (!sourceTree || !sourceTree.tree) {
      return NextResponse.json({ error: "Could not get source tree" }, { status: 500 });
    }

    // Copy blobs from source to dest
    const newTreeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];

    for (const item of sourceTree.tree) {
      if (item.type !== "blob") continue;

      // Get blob content from source
      const blob = await getBlob(sourceToken, sourceOwner, sourceName, item.sha);
      if (!blob) continue;

      // Create blob in destination
      const newBlob = await createBlob(destToken, destOwner, destName, blob.content, blob.encoding);
      if (!newBlob) continue;

      newTreeItems.push({
        path: item.path,
        mode: item.mode,
        type: "blob",
        sha: newBlob.sha,
      });
    }

    if (newTreeItems.length === 0) {
      return NextResponse.json({ error: "No files to sync" }, { status: 400 });
    }

    // Create new tree in destination
    const newTree = await createTree(destToken, destOwner, destName, null, newTreeItems);
    if (!newTree) {
      return NextResponse.json({ error: "Failed to create tree in destination" }, { status: 500 });
    }

    // Create commit
    const directionLabel = direction === "push" ? "Push" : "Pull";
    const commitMsg = `${directionLabel} sync from ${sourceOwner}/${sourceName} (${sourceBranch})`;
    const newCommit = await createCommit(destToken, destOwner, destName, commitMsg, newTree.sha, [destSha]);
    if (!newCommit) {
      return NextResponse.json({ error: "Failed to create commit in destination" }, { status: 500 });
    }

    // Update branch ref
    const updated = await updateRef(destToken, destOwner, destName, destBranch, newCommit.sha);
    if (!updated) {
      return NextResponse.json({
        error: "Failed to update branch. The destination branch may have diverged — try a force push from the repo directly.",
      }, { status: 500 });
    }

    // Update sync status
    await prisma.clientGitHubLink.update({
      where: { id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: `${directionLabel}: ${newTreeItems.length} files synced`,
      },
    });

    return NextResponse.json({
      message: `${directionLabel} complete: ${newTreeItems.length} files synced to ${destOwner}/${destName}`,
      commit: newCommit.sha,
      filesCount: newTreeItems.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Sync error:", message);

    await prisma.clientGitHubLink.update({
      where: { id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: `Error: ${message}`,
      },
    });

    return NextResponse.json({ error: "Sync failed", detail: message }, { status: 500 });
  }
}

/** GET /api/client-repos/[id]/sync — get sync status */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  const link = await prisma.clientGitHubLink.findUnique({
    where: { id },
    select: { userId: true, lastSyncAt: true, lastSyncStatus: true },
  });

  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  if (!isAdmin && link.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    lastSyncAt: link.lastSyncAt,
    lastSyncStatus: link.lastSyncStatus,
  });
}
