import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";

// GET: list all GitHub accounts (PATs are NOT returned)
export async function GET() {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.gitHubAccount.findMany({
    select: {
      id: true,
      label: true,
      owner: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { repos: true } },
    },
    orderBy: { label: "asc" },
  });

  return NextResponse.json(accounts);
}

// POST: add a new GitHub account
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { label, pat } = await req.json();

  if (!label?.trim() || !pat?.trim()) {
    return NextResponse.json(
      { error: "Label and PAT are required" },
      { status: 400 }
    );
  }

  // Validate the PAT by calling GitHub API to determine owner
  const ghRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${pat.trim()}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!ghRes.ok) {
    return NextResponse.json(
      { error: "Invalid GitHub token - could not authenticate" },
      { status: 400 }
    );
  }

  const ghUser = await ghRes.json();
  const owner = ghUser.login as string;

  // Check for duplicate owner
  const existing = await prisma.gitHubAccount.findUnique({
    where: { owner },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Account for GitHub user "${owner}" already exists` },
      { status: 409 }
    );
  }

  const account = await prisma.gitHubAccount.create({
    data: {
      label: label.trim(),
      owner,
      patEncrypted: encrypt(pat.trim()),
    },
    select: {
      id: true,
      label: true,
      owner: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(account, { status: 201 });
}
