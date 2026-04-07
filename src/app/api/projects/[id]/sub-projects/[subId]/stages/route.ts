import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST: create a stage in a sub-project
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { subId } = await params;
  const { name, description } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const maxOrder = await prisma.subProjectStage.aggregate({
    where: { subProjectId: subId },
    _max: { order: true },
  });

  const stage = await prisma.subProjectStage.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      subProjectId: subId,
      order: (maxOrder._max.order ?? -1) + 1,
    },
    include: {
      tasks: {
        include: {
          assignments: {
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          },
        },
      },
    },
  });

  return NextResponse.json(stage, { status: 201 });
}
