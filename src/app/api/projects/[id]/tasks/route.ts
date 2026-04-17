import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const tasks = await prisma.task.findMany({
    where: { projectId: id },
    include: {
      assignments: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
    },
    orderBy: [{ status: "asc" }, { order: "asc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { title, description, priority, startDate, dueDate, assigneeIds, startTime, estimatedDuration } = body;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const maxOrder = await prisma.task.aggregate({
    where: { projectId: id },
    _max: { order: true },
  });

  const task = await prisma.task.create({
    data: {
      title,
      description: description || null,
      priority: priority || "MEDIUM",
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      startTime: startTime || null,
      estimatedDuration: estimatedDuration ? Number(estimatedDuration) : null,
      order: (maxOrder._max.order || 0) + 1,
      projectId: id,
      assignments: assigneeIds?.length
        ? {
            create: assigneeIds.map((userId: string) => ({ userId })),
          }
        : undefined,
    },
    include: {
      assignments: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
    },
  });

  return NextResponse.json(task, { status: 201 });
}
