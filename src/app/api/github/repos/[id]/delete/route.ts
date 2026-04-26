import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

const GITHUB_API = "https://api.github.com";

async function getRepoToken(repo: { accountId: string | null; owner: string }): Promise<string | null> {
  if (repo.accountId) {
    const account = await prisma.gitHubAccount.findUnique({ where: { id: repo.accountId } });
    if (account) return decrypt(account.patEncrypted);
  }
  const accounts = await prisma.gitHubAccount.findMany();
  for (const acc of accounts) {
    if (
      acc.label.toLowerCase() === repo.owner.toLowerCase() ||
      acc.owner.toLowerCase() === repo.owner.toLowerCase()
    ) {
      return decrypt(acc.patEncrypted);
    }
  }
  return process.env.GITHUB_PAT || null;
}

// POST: permanently delete a GitHub repo (on GitHub + from local DB)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const repo = await prisma.gitHubRepo.findUnique({ where: { id } });
  if (!repo) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const token = await getRepoToken(repo);
  if (!token) {
    return NextResponse.json(
      { error: "No GitHub token found for this repo. Link it to a GitHub account first." },
      { status: 400 }
    );
  }

  // Delete from GitHub
  const ghRes = await fetch(`${GITHUB_API}/repos/${repo.owner}/${repo.name}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  // 204 = deleted, 404 = already gone — both are acceptable
  if (!ghRes.ok && ghRes.status !== 404) {
    const body = await ghRes.text();
    return NextResponse.json(
      { error: `GitHub API error (${ghRes.status}): ${body}` },
      { status: ghRes.status }
    );
  }

  // Remove from local DB
  await prisma.gitHubRepo.delete({ where: { id } });

  return NextResponse.json({ success: true, message: `Repository "${repo.fullName}" permanently deleted.` });
}
