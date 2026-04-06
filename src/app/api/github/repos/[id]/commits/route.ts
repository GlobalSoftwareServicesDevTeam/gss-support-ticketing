import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const GITHUB_API = "https://api.github.com";

// GET: fetch commits for a repo from GitHub
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const role = (session.user as { role: string }).role;
  const company = (session.user as { company?: string }).company;

  // Find the repo
  const repo = await prisma.gitHubRepo.findUnique({
    where: { id },
    include: {
      customers: {
        include: { customer: { select: { id: true, company: true } } },
      },
    },
  });

  if (!repo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Non-admin users can only see repos assigned to their company's customer
  if (role !== "ADMIN") {
    const hasAccess = repo.customers.some(
      (cr: { customer: { company: string } }) => cr.customer.company === company
    );
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const ghToken = process.env.GITHUB_PAT;
  if (!ghToken) {
    return NextResponse.json(
      { error: "GITHUB_PAT not configured on server" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const page = searchParams.get("page") || "1";
  const perPage = searchParams.get("per_page") || "30";
  const sha = searchParams.get("sha") || ""; // branch name or sha

  let url = `${GITHUB_API}/repos/${repo.owner}/${repo.name}/commits?per_page=${perPage}&page=${page}`;
  if (sha) url += `&sha=${encodeURIComponent(sha)}`;

  const ghRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
    },
    next: { revalidate: 60 }, // cache for 60s
  });

  if (!ghRes.ok) {
    const err = await ghRes.text();
    return NextResponse.json(
      { error: "GitHub API error", detail: err },
      { status: ghRes.status }
    );
  }

  const commits = await ghRes.json();

  // Also fetch branches for the branch selector
  const branchesRes = await fetch(
    `${GITHUB_API}/repos/${repo.owner}/${repo.name}/branches?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: "application/vnd.github+json",
      },
      next: { revalidate: 300 },
    }
  );

  let branches: string[] = [];
  if (branchesRes.ok) {
    const branchData = await branchesRes.json();
    branches = branchData.map((b: { name: string }) => b.name);
  }

  return NextResponse.json({ commits, branches, repo });
}
