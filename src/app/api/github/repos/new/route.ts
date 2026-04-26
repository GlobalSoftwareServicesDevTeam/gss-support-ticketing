import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

const GITHUB_API = "https://api.github.com";

// POST: create a new GitHub repo and optionally link it to a project/subproject
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { accountId, repoName, isPrivate, description, projectId, subProjectId } = body;

  if (!accountId || !repoName || typeof repoName !== "string") {
    return NextResponse.json({ error: "accountId and repoName are required" }, { status: 400 });
  }

  // Validate repo name (GitHub rules)
  if (!/^[a-zA-Z0-9._-]+$/.test(repoName.trim())) {
    return NextResponse.json(
      { error: "Invalid repo name. Only letters, numbers, hyphens, underscores, and dots are allowed." },
      { status: 400 }
    );
  }

  const account = await prisma.gitHubAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    return NextResponse.json({ error: "GitHub account not found" }, { status: 404 });
  }

  const token = decrypt(account.patEncrypted);
  const owner = account.owner;

  // Check if the token belongs to an org or user to decide endpoint
  const userRes = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!userRes.ok) {
    return NextResponse.json({ error: "Invalid GitHub token for the selected account" }, { status: 400 });
  }

  const ghUser = await userRes.json();

  // Determine if we create under org or personal account
  const isOrg = ghUser.login.toLowerCase() !== owner.toLowerCase();

  const createUrl = isOrg
    ? `${GITHUB_API}/orgs/${owner}/repos`
    : `${GITHUB_API}/user/repos`;

  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: repoName.trim(),
      description: description?.trim() || undefined,
      private: Boolean(isPrivate),
      auto_init: true,
    }),
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    const errMsg =
      (errData as { message?: string; errors?: Array<{ message?: string }> }).message ||
      (errData as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ||
      "Failed to create repository on GitHub";
    return NextResponse.json({ error: errMsg }, { status: createRes.status });
  }

  const ghRepo = await createRes.json();

  // Save to DB and link to project/subproject
  const repo = await prisma.gitHubRepo.upsert({
    where: { owner_name: { owner: ghRepo.owner.login, name: ghRepo.name } },
    update: {
      description: ghRepo.description,
      htmlUrl: ghRepo.html_url,
      isPrivate: ghRepo.private,
      language: ghRepo.language,
      fullName: ghRepo.full_name,
      accountId: account.id,
      ...(projectId ? { projectId } : {}),
      ...(subProjectId ? { subProjectId } : {}),
    },
    create: {
      owner: ghRepo.owner.login,
      name: ghRepo.name,
      fullName: ghRepo.full_name,
      description: ghRepo.description,
      htmlUrl: ghRepo.html_url,
      isPrivate: ghRepo.private,
      language: ghRepo.language,
      accountId: account.id,
      ...(projectId ? { projectId } : {}),
      ...(subProjectId ? { subProjectId } : {}),
    },
  });

  return NextResponse.json({
    success: true,
    repo: {
      id: repo.id,
      fullName: repo.fullName,
      htmlUrl: repo.htmlUrl,
      isPrivate: repo.isPrivate,
      language: repo.language,
    },
    message: `Repository "${ghRepo.full_name}" created successfully.`,
  });
}
