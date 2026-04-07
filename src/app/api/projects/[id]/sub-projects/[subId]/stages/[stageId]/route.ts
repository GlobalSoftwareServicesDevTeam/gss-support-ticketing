import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PUT: update a stage
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; stageId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { stageId } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.status !== undefined) data.status = body.status;
  if (body.order !== undefined) data.order = body.order;

  const updated = await prisma.subProjectStage.update({
    where: { id: stageId },
    data,
  });

  return NextResponse.json(updated);
}

// DELETE: delete a stage
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; stageId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { stageId } = await params;

  await prisma.subProjectStage.delete({ where: { id: stageId } });

  return NextResponse.json({ success: true });
}
