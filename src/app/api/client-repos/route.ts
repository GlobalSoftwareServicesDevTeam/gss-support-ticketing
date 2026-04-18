import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { getCustomerContext } from "@/lib/customer-context";

const GITHUB_API = "https://api.github.com";

/** Validate a PAT and extract repo info */
async function validateClientRepo(pat: string, repoFullName: string) {
  const res = await fetch(`${GITHUB_API}/repos/${repoFullName}`, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) return null;
  return res.json();
}

/** GET /api/client-repos — list user's linked repos */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  if (isAdmin) {
    // Admins see all client links
    const links = await prisma.clientGitHubLink.findMany({
      include: {
        repo: {
          select: { id: true, fullName: true, htmlUrl: true, owner: true, name: true, isPrivate: true, language: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch user names for display
    const userIds = [...new Set(links.map((l: { userId: string }) => l.userId))] as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return NextResponse.json(
      links.map((l) => ({
        id: l.id,
        clientOwner: l.clientOwner,
        clientRepoName: l.clientRepoName,
        clientRepoUrl: l.clientRepoUrl,
        lastSyncAt: l.lastSyncAt,
        lastSyncStatus: l.lastSyncStatus,
        createdAt: l.createdAt,
        repo: l.repo,
        user: userMap[l.userId] || { id: l.userId, firstName: "Unknown", lastName: "", email: "" },
      }))
    );
  }

  // Non-admin: only their own links
  const links = await prisma.clientGitHubLink.findMany({
    where: { userId: session.user.id! },
    include: {
      repo: {
        select: { id: true, fullName: true, htmlUrl: true, owner: true, name: true, isPrivate: true, language: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    links.map((l) => ({
      id: l.id,
      clientOwner: l.clientOwner,
      clientRepoName: l.clientRepoName,
      clientRepoUrl: l.clientRepoUrl,
      lastSyncAt: l.lastSyncAt,
      lastSyncStatus: l.lastSyncStatus,
      createdAt: l.createdAt,
      repo: l.repo,
    }))
  );
}

/** POST /api/client-repos — link a client repo to a platform repo */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { pat, clientRepoFullName, repoId } = body;

  if (!pat || !clientRepoFullName || !repoId) {
    return NextResponse.json({ error: "pat, clientRepoFullName, and repoId are required" }, { status: 400 });
  }

  // Validate the PAT and repo exist
  const repoInfo = await validateClientRepo(pat, clientRepoFullName);
  if (!repoInfo) {
    return NextResponse.json({ error: "Could not access the repository. Check PAT and repo name." }, { status: 400 });
  }

  // Verify the platform repo exists and user has access
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";
  const platformRepo = await prisma.gitHubRepo.findUnique({
    where: { id: repoId },
    include: { customers: true },
  });

  if (!platformRepo) {
    return NextResponse.json({ error: "Platform repository not found" }, { status: 404 });
  }

  // Non-admins: verify they have access to this repo via customer assignment
  if (!isAdmin) {
    const ctx = getCustomerContext(session);
    const company = (session.user as { company?: string }).company;
    const hasAccess = platformRepo.customers.some(
      (cr) => (ctx && cr.customerId === ctx.customerId) || false
    );
    if (!hasAccess && !company) {
      return NextResponse.json({ error: "You don't have access to this repository" }, { status: 403 });
    }
  }

  // Check if already linked
  const existing = await prisma.clientGitHubLink.findUnique({
    where: { userId_repoId: { userId: session.user.id!, repoId } },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a repo linked to this platform repo. Delete the existing link first." }, { status: 409 });
  }

  // Verify the client has push access to their repo
  if (!repoInfo.permissions?.push) {
    return NextResponse.json({ error: "Your PAT does not have push access to this repository" }, { status: 403 });
  }

  const link = await prisma.clientGitHubLink.create({
    data: {
      userId: session.user.id!,
      repoId,
      clientOwner: repoInfo.owner.login,
      clientRepoName: repoInfo.name,
      clientRepoUrl: repoInfo.html_url,
      patEncrypted: encrypt(pat),
    },
    include: {
      repo: {
        select: { id: true, fullName: true, htmlUrl: true, owner: true, name: true },
      },
    },
  });

  return NextResponse.json({
    id: link.id,
    clientOwner: link.clientOwner,
    clientRepoName: link.clientRepoName,
    clientRepoUrl: link.clientRepoUrl,
    repo: link.repo,
  }, { status: 201 });
}
