import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getCustomerContext } from "@/lib/customer-context";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      issues: {
        select: { id: true, subject: true, status: true, priority: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      },
      tasks: {
        include: {
          assignments: {
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          },
        },
        orderBy: { order: "asc" },
      },
      documents: {
        select: { id: true, name: true, fileName: true, fileExt: true, fileSize: true, category: true, notes: true, uploadedAt: true, uploadedBy: true },
        orderBy: { uploadedAt: "desc" },
      },
      _count: { select: { issues: true, tasks: true, documents: true } },
      repos: {
        select: { id: true, fullName: true, htmlUrl: true, isPrivate: true, language: true },
        orderBy: { fullName: "asc" },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Non-admins: must be assigned to the project OR it must belong to their customer
  if (session.user.role !== "ADMIN") {
    const ctx = getCustomerContext(session);
    const isCustomerProject = ctx && project.customerId === ctx.customerId;
    const assignment = await prisma.projectAssignment.findFirst({
      where: { projectId: id, userId: session.user.id },
    });
    if (!isCustomerProject && !assignment) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json(project);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { projectName, proposalDate, estimatedCompleteDate, onMaintenance, maintAmount, dateStarted, companyId, description, status, githubRepo, customerId } = body;

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(projectName !== undefined && { projectName }),
      ...(proposalDate !== undefined && { proposalDate: proposalDate ? new Date(proposalDate) : null }),
      ...(estimatedCompleteDate !== undefined && { estimatedCompleteDate: estimatedCompleteDate ? new Date(estimatedCompleteDate) : null }),
      ...(onMaintenance !== undefined && { onMaintenance }),
      ...(maintAmount !== undefined && { maintAmount }),
      ...(dateStarted !== undefined && { dateStarted: dateStarted ? new Date(dateStarted) : null }),
      ...(companyId !== undefined && { companyId }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(githubRepo !== undefined && { githubRepo }),
      ...(customerId !== undefined && { customerId }),
    },
  });

  logAudit({
    action: "UPDATE",
    entity: "PROJECT",
    entityId: id,
    description: `Updated project: ${project.projectName}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json(project);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  await prisma.project.delete({ where: { id } });

  logAudit({
    action: "DELETE",
    entity: "PROJECT",
    entityId: id,
    description: `Deleted project #${id.slice(0, 8)}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ success: true });
}
