import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

const GITHUB_API = "https://api.github.com";

async function fetchGitHubRepos(token: string) {
  const repos: Array<{
    name: string;
    full_name: string;
    owner: { login: string };
    description: string | null;
    html_url: string;
    private: boolean;
    language: string | null;
  }> = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${GITHUB_API}/user/repos?per_page=100&page=${page}&sort=updated`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    repos.push(...data);
    if (data.length < 100) break;
    page++;
  }

  return repos;
}

// POST: sync repos for one or all accounts
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const account = await prisma.gitHubAccount.findUnique({
    where: { id },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  let pat: string;
  try {
    pat = decrypt(account.patEncrypted);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt PAT. Encryption key may have changed." },
      { status: 500 }
    );
  }

  const ghRepos = await fetchGitHubRepos(pat);
  let synced = 0;

  for (const repo of ghRepos) {
    await prisma.gitHubRepo.upsert({
      where: {
        owner_name: { owner: repo.owner.login, name: repo.name },
      },
      update: {
        description: repo.description,
        htmlUrl: repo.html_url,
        isPrivate: repo.private,
        language: repo.language,
        fullName: repo.full_name,
        accountId: account.id,
      },
      create: {
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        htmlUrl: repo.html_url,
        isPrivate: repo.private,
        language: repo.language,
        accountId: account.id,
      },
    });
    synced++;
  }

  return NextResponse.json({ synced, total: ghRepos.length, account: account.label });
}
