import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// POST /api/issues/[id]/convert-to-task — Convert a ticket into a task
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { projectId, assigneeIds, startDate, dueDate } = body;

  if (!projectId) {
    return NextResponse.json({ error: "Project is required" }, { status: 400 });
  }

  // Fetch the issue
  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      customer: { select: { company: true } },
    },
  });

  if (!issue) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Check if already converted
  const existing = await prisma.task.findFirst({ where: { issueId: id } });
  if (existing) {
    return NextResponse.json(
      { error: "This ticket has already been converted to a task", taskId: existing.id },
      { status: 409 }
    );
  }

  // Build description from issue content
  const descParts: string[] = [];
  if (issue.initialNotes) descParts.push(issue.initialNotes);

  const meta: string[] = [];
  if (issue.user) meta.push(`Submitted by: ${issue.user.firstName} ${issue.user.lastName} (${issue.user.email})`);
  if (issue.customer) meta.push(`Customer: ${issue.customer.company}`);
  if (issue.kind) meta.push(`Type: ${issue.kind}`);
  meta.push(`Original ticket: #${issue.id.slice(0, 8)}`);

  if (meta.length) descParts.push("---\n" + meta.join("\n"));

  // Get next order number
  const maxOrder = await prisma.task.aggregate({
    where: { projectId },
    _max: { order: true },
  });

  // Create the task
  const task = await prisma.task.create({
    data: {
      title: issue.subject,
      description: descParts.join("\n\n") || null,
      priority: issue.priority,
      status: "TODO",
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      order: (maxOrder._max.order || 0) + 1,
      projectId,
      issueId: id,
      assignments: assigneeIds?.length
        ? { create: assigneeIds.map((userId: string) => ({ userId })) }
        : undefined,
    },
    include: {
      project: { select: { id: true, projectName: true } },
      assignments: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  // Audit log
  await logAudit({
    action: "CREATE",
    entity: "Task",
    entityId: task.id,
    userId: session.user.id!,
    description: `Converted ticket "${issue.subject}" to task in project ${task.project.projectName}`,
  });

  return NextResponse.json(task, { status: 201 });
}
