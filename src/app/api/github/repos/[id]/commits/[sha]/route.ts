import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const GITHUB_API = "https://api.github.com";

// GET: fetch a single commit detail with changed files
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sha: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, sha } = await params;
  const role = (session.user as { role: string }).role;
  const company = (session.user as { company?: string }).company;

  const repo = await prisma.gitHubRepo.findUnique({
    where: { id },
    include: {
      customers: {
        include: { customer: { select: { company: true } } },
      },
    },
  });

  if (!repo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Access check for non-admins
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
      { error: "GITHUB_PAT not configured" },
      { status: 500 }
    );
  }

  const ghRes = await fetch(
    `${GITHUB_API}/repos/${repo.owner}/${repo.name}/commits/${sha}`,
    {
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: "application/vnd.github+json",
      },
      next: { revalidate: 300 },
    }
  );

  if (!ghRes.ok) {
    return NextResponse.json(
      { error: "GitHub API error" },
      { status: ghRes.status }
    );
  }

  const data = await ghRes.json();

  return NextResponse.json({
    sha: data.sha,
    message: data.commit.message,
    author: data.commit.author,
    stats: data.stats,
    files: (data.files || []).map(
      (f: { filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
      })
    ),
  });
}
