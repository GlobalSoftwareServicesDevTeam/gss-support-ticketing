import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const idea = await prisma.projectIdea.findUnique({ where: { id } });
  if (!idea) {
    return NextResponse.json({ error: "Project idea not found" }, { status: 404 });
  }

  const body = await req.json();
  const { projectId, newProjectName, taskPriority, taskDueDate } = body;

  if (!projectId && !newProjectName) {
    return NextResponse.json(
      { error: "Either projectId or newProjectName is required" },
      { status: 400 }
    );
  }

  let targetProjectId = projectId;

  // Create a new project if requested
  if (!projectId && newProjectName) {
    const project = await prisma.project.create({
      data: {
        projectName: newProjectName,
        description: idea.description,
        status: "ACTIVE",
      },
    });
    targetProjectId = project.id;

    logAudit({
      action: "CREATE",
      entity: "PROJECT",
      entityId: project.id,
      description: `Project created from idea: ${newProjectName}`,
      userId: session.user.id,
    });
  }

  // Get max order for tasks in this project
  const maxOrder = await prisma.task.aggregate({
    where: { projectId: targetProjectId },
    _max: { order: true },
  });

  // Map idea priority to task priority
  const priorityMap: Record<string, string> = {
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    URGENT: "CRITICAL",
  };

  // Create the task
  const task = await prisma.task.create({
    data: {
      title: idea.title,
      description: idea.description,
      priority: taskPriority || priorityMap[idea.priority] || "MEDIUM",
      dueDate: taskDueDate ? new Date(taskDueDate) : null,
      order: (maxOrder._max.order || 0) + 1,
      projectId: targetProjectId,
    },
    include: {
      project: { select: { id: true, projectName: true } },
    },
  });

  // Update idea status to APPROVED/IN_PROGRESS
  await prisma.projectIdea.update({
    where: { id },
    data: { status: "APPROVED" },
  });

  logAudit({
    action: "CREATE",
    entity: "TASK",
    entityId: task.id,
    description: `Task created from project idea "${idea.title}" in project "${task.project.projectName}"`,
    userId: session.user.id,
  });

  logAudit({
    action: "UPDATE",
    entity: "PROJECT_IDEA",
    entityId: id,
    description: `Project idea "${idea.title}" converted to task in project "${task.project.projectName}"`,
    userId: session.user.id,
  });

  return NextResponse.json({
    task,
    projectId: targetProjectId,
    projectName: task.project.projectName,
  }, { status: 201 });
}
