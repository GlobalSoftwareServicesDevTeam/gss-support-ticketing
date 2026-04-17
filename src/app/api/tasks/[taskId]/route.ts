import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, projectName: true } },
      assignments: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  const body = await req.json();
  const { title, description, status, priority, dueDate, order, assigneeIds, startTime, estimatedDuration } = body;

  await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(order !== undefined && { order }),
      ...(startTime !== undefined && { startTime: startTime || null }),
      ...(estimatedDuration !== undefined && { estimatedDuration: estimatedDuration ? Number(estimatedDuration) : null }),
    },
  });

  if (assigneeIds !== undefined) {
    await prisma.taskAssignment.deleteMany({ where: { taskId } });
    if (assigneeIds.length > 0) {
      await prisma.taskAssignment.createMany({
        data: assigneeIds.map((userId: string) => ({ taskId, userId })),
      });
    }
  }

  const updated = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignments: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
    },
  });

  logAudit({
    action: "UPDATE",
    entity: "TASK",
    entityId: taskId,
    description: `Updated task "${title || updated?.title || taskId}"${status ? ` — status → ${status}` : ""}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { title, status, priority },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;

  await prisma.task.delete({ where: { id: taskId } });

  logAudit({
    action: "DELETE",
    entity: "TASK",
    entityId: taskId,
    description: `Deleted task #${taskId.slice(0, 8)}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ success: true });
}
