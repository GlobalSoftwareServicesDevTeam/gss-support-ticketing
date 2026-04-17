import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

const GITHUB_API = "https://api.github.com";

async function getRepoToken(repo: { accountId: string | null; owner: string }): Promise<string | null> {
  // First try the directly linked account
  if (repo.accountId) {
    const account = await prisma.gitHubAccount.findUnique({ where: { id: repo.accountId } });
    if (account) return decrypt(account.patEncrypted);
  }
  // Fallback: find an account matching the repo owner
  const accounts = await prisma.gitHubAccount.findMany();
  for (const acc of accounts) {
    if (acc.label.toLowerCase() === repo.owner.toLowerCase() ||
        acc.owner.toLowerCase() === repo.owner.toLowerCase()) {
      return decrypt(acc.patEncrypted);
    }
  }
  return process.env.GITHUB_PAT || null;
}

// POST: rename a GitHub repo
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { newName } = await req.json();

  if (!newName || typeof newName !== "string") {
    return NextResponse.json({ error: "newName is required" }, { status: 400 });
  }

  // Validate repo name (GitHub rules: alphanumeric, hyphens, underscores, dots)
  if (!/^[a-zA-Z0-9._-]+$/.test(newName)) {
    return NextResponse.json(
      { error: "Invalid repo name. Only letters, numbers, hyphens, underscores, and dots are allowed." },
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

  // Rename on GitHub
  const res = await fetch(`${GITHUB_API}/repos/${repo.owner}/${repo.name}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: newName }),
  });

  if (!res.ok) {
    const error = await res.text();
    return NextResponse.json(
      { error: `GitHub API error: ${error}` },
      { status: res.status }
    );
  }

  const ghData = await res.json();

  // Update local database
  const updated = await prisma.gitHubRepo.update({
    where: { id },
    data: {
      name: ghData.name,
      fullName: ghData.full_name,
      htmlUrl: ghData.html_url,
      description: ghData.description,
    },
  });

  return NextResponse.json({
    success: true,
    repo: updated,
    message: `Repo renamed to ${ghData.full_name}`,
  });
}
