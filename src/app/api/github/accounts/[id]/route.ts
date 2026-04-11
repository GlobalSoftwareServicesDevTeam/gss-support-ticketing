import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";

// PUT: update a GitHub account (label and/or PAT)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.label !== undefined) data.label = body.label.trim();

  // If updating PAT, validate it and update owner
  if (body.pat?.trim()) {
    const ghRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${body.pat.trim()}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!ghRes.ok) {
      return NextResponse.json(
        { error: "Invalid GitHub token" },
        { status: 400 }
      );
    }
    const ghUser = await ghRes.json();
    data.owner = ghUser.login;
    data.patEncrypted = encrypt(body.pat.trim());
  }

  const updated = await prisma.gitHubAccount.update({
    where: { id },
    data,
    select: {
      id: true,
      label: true,
      owner: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
}

// DELETE: remove a GitHub account (repos stay, just unlinked)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Unlink repos from this account
  await prisma.gitHubRepo.updateMany({
    where: { accountId: id },
    data: { accountId: null },
  });

  await prisma.gitHubAccount.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
