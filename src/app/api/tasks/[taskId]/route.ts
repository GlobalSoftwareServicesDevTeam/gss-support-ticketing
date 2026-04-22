import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";

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

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({
      ...task,
      completionPrivateNote: null,
    });
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
  const {
    title,
    description,
    status,
    priority,
    startDate,
    dueDate,
    order,
    assigneeIds,
    startTime,
    estimatedDuration,
    stageId,
    testCompleted,
    completionClientNote,
    completionPrivateNote,
    completionSendClientNote,
    followUpType,
    followUpAt,
    followUpNotes,
  } = body;

  const isAdmin = session.user.role === "ADMIN";

  // Non-admin users can only update tasks they're assigned to
  if (!isAdmin) {
    const assignment = await prisma.taskAssignment.findFirst({
      where: { taskId, userId: session.user.id },
    });
    if (!assignment) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (completionPrivateNote !== undefined || completionSendClientNote === true) {
      return NextResponse.json({ error: "Only admins can update private completion notes or send client completion email." }, { status: 403 });
    }
  }

  const taskBefore = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        select: {
          projectName: true,
          customer: {
            select: {
              company: true,
              emailAddress: true,
            },
          },
        },
      },
    },
  });

  if (!taskBefore) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(status !== undefined && { status }),
    ...(priority !== undefined && { priority }),
    ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
    ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
    ...(order !== undefined && { order }),
    ...(startTime !== undefined && { startTime: startTime || null }),
    ...(estimatedDuration !== undefined && { estimatedDuration: estimatedDuration ? Number(estimatedDuration) : null }),
    ...(stageId !== undefined && { stageId: stageId || null }),
    ...(testCompleted !== undefined && { testCompleted: Boolean(testCompleted) }),
    ...(completionClientNote !== undefined && { completionClientNote: completionClientNote ? String(completionClientNote) : null }),
    ...(isAdmin && completionPrivateNote !== undefined && { completionPrivateNote: completionPrivateNote ? String(completionPrivateNote) : null }),
    ...(followUpType !== undefined && { followUpType: followUpType || null }),
    ...(followUpAt !== undefined && { followUpAt: followUpAt ? new Date(followUpAt) : null }),
    ...(followUpNotes !== undefined && { followUpNotes: followUpNotes ? String(followUpNotes) : null }),
  };

  if (status !== undefined) {
    updateData.completedAt = status === "DONE" ? new Date() : null;
  }

  await prisma.task.update({
    where: { id: taskId },
    data: updateData,
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
      project: {
        select: {
          projectName: true,
          customer: {
            select: {
              company: true,
              emailAddress: true,
            },
          },
        },
      },
      assignments: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
    },
  });

  let clientNotification: { sent: boolean; reason?: string } | undefined;
  if (completionSendClientNote === true && status === "DONE") {
    const to = updated?.project?.customer?.emailAddress || "";
    const note = String(completionClientNote || "").trim();

    if (!to) {
      clientNotification = { sent: false, reason: "No customer email found for this project." };
    } else if (!note) {
      clientNotification = { sent: false, reason: "Client completion note is empty." };
    } else {
      try {
        await sendEmail({
          to,
          subject: `Task Completed: ${updated?.title || taskId}`,
          html: `
            <p>Hello${updated?.project?.customer?.company ? ` ${updated.project.customer.company}` : ""},</p>
            <p>The task <strong>${updated?.title || taskId}</strong> has been completed.</p>
            <p><strong>What to do next:</strong></p>
            <div style="white-space: pre-wrap; border-left: 4px solid #2563eb; padding: 10px 12px; background: #f8fafc;">${note}</div>
            <p style="margin-top: 16px;">Regards,<br/>Global Software Services Support</p>
          `,
        });
        clientNotification = { sent: true };
      } catch {
        clientNotification = { sent: false, reason: "Email sending failed." };
      }
    }
  }

  logAudit({
    action: "UPDATE",
    entity: "TASK",
    entityId: taskId,
    description: `Updated task "${title || updated?.title || taskId}"${status ? ` — status → ${status}` : ""}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { title, status, priority },
  });

  return NextResponse.json({ ...updated, clientNotification });
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

  // Only admins can delete tasks
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
