import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list sub-projects for a project (with stages and task counts)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const subProjects = await prisma.subProject.findMany({
    where: { projectId: id },
    include: {
      stages: {
        include: {
          tasks: {
            include: {
              assignments: {
                include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
              },
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(subProjects);
}

// POST: create a new sub-project
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { name, description } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Get next order
  const maxOrder = await prisma.subProject.aggregate({
    where: { projectId: id },
    _max: { order: true },
  });

  const subProject = await prisma.subProject.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      projectId: id,
      order: (maxOrder._max.order ?? -1) + 1,
    },
    include: {
      stages: { include: { tasks: { include: { assignments: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } } } } },
    },
  });

  return NextResponse.json(subProject, { status: 201 });
}
