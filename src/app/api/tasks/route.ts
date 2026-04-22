import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/tasks – all tasks across all projects (admin: all, user: assigned)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const dueDateFrom = searchParams.get("dueDateFrom");
  const dueDateTo = searchParams.get("dueDateTo");
  const projectId = searchParams.get("projectId");

  const isAdmin = session.user.role === "ADMIN";

  const where: Record<string, unknown> = {};

  if (!isAdmin) {
    where.assignments = { some: { userId: session.user.id } };
  }

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (projectId) where.projectId = projectId;

  if (dueDateFrom || dueDateTo) {
    where.dueDate = {};
    if (dueDateFrom) (where.dueDate as Record<string, unknown>).gte = new Date(dueDateFrom);
    if (dueDateTo) (where.dueDate as Record<string, unknown>).lte = new Date(dueDateTo);
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: { select: { id: true, projectName: true } },
      stage: {
        select: {
          id: true,
          name: true,
          subProject: { select: { id: true, name: true } },
        },
      },
      assignments: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { order: "asc" }],
  });

  if (!isAdmin) {
    return NextResponse.json(
      tasks.map((task) => ({
        ...task,
        completionPrivateNote: null,
      }))
    );
  }

  return NextResponse.json(tasks);
}
