import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/schedule?token=<user-invite-token>&date=YYYY-MM-DD
// Public endpoint – shows a client their tasks for a specific date
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const dateStr = searchParams.get("date");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  // Lookup user by their invite token (reuse the permanent token)
  const user = await prisma.user.findFirst({
    where: { inviteToken: token, isDeleted: false },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  // Default to today if no date provided
  const targetDate = dateStr ? new Date(dateStr) : new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const tasks = await prisma.task.findMany({
    where: {
      assignments: { some: { userId: user.id } },
      dueDate: { gte: dayStart, lte: dayEnd },
    },
    include: {
      project: { select: { id: true, projectName: true } },
    },
    orderBy: [{ priority: "desc" }, { order: "asc" }],
  });

  return NextResponse.json({
    user: { firstName: user.firstName, lastName: user.lastName },
    date: dayStart.toISOString().split("T")[0],
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      project: t.project.projectName,
    })),
  });
}
