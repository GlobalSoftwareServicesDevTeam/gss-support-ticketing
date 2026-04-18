import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PUT: update a sub-project
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, subId } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.status !== undefined) data.status = body.status;
  if (body.order !== undefined) data.order = body.order;

  // Handle repo linking: { repoIds: ["id1", "id2"] }
  if (body.repoIds !== undefined) {
    // Unlink all repos from this sub-project first, then link the specified ones
    await prisma.gitHubRepo.updateMany({
      where: { subProjectId: subId },
      data: { subProjectId: null },
    });
    if (Array.isArray(body.repoIds) && body.repoIds.length > 0) {
      // Also ensure repos are linked to the parent project
      await prisma.gitHubRepo.updateMany({
        where: { id: { in: body.repoIds } },
        data: { subProjectId: subId, projectId: id },
      });
    }
  }

  const updated = await prisma.subProject.update({
    where: { id: subId },
    data,
    include: {
      repos: { select: { id: true, fullName: true, htmlUrl: true, isPrivate: true, language: true } },
    },
  });

  return NextResponse.json(updated);
}

// DELETE: delete a sub-project and all its stages/tasks
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { subId } = await params;

  await prisma.subProject.delete({ where: { id: subId } });

  return NextResponse.json({ success: true });
}
