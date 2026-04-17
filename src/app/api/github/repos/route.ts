import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const GITHUB_API = "https://api.github.com";

async function fetchGitHubRepos(token: string) {
  const repos: Array<{
    id: number;
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

// GET: list all synced GitHub repos
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { description: { contains: search } },
    ];
  }

  const repos = await prisma.gitHubRepo.findMany({
    where,
    include: {
      customers: {
        include: { customer: { select: { id: true, company: true } } },
      },
      project: { select: { id: true, projectName: true } },
      subProject: { select: { id: true, name: true } },
      account: { select: { id: true, label: true, owner: true } },
    },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json(repos);
}

// POST: sync repos from GitHub using a personal access token
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await req.json();
  const ghToken = token || process.env.GITHUB_PAT;

  if (!ghToken) {
    return NextResponse.json(
      { error: "No GitHub token provided and GITHUB_PAT not set" },
      { status: 400 }
    );
  }

  const ghRepos = await fetchGitHubRepos(ghToken);
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
      },
      create: {
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        htmlUrl: repo.html_url,
        isPrivate: repo.private,
        language: repo.language,
      },
    });
    synced++;
  }

  return NextResponse.json({ synced, total: ghRepos.length });
}
