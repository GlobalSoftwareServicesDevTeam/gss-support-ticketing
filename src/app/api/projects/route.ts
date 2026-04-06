import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getCustomerContext } from "@/lib/customer-context";
import { getCustomerUserIds } from "@/lib/customer-users";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let where: Record<string, unknown> = {};
  if (session.user.role !== "ADMIN") {
    const ctx = getCustomerContext(session);
    if (ctx && ctx.permissions.projects) {
      // Customer-scoped: see projects assigned to any user in the customer
      const customerUserIds = await getCustomerUserIds(ctx.customerId);
      where = { assignments: { some: { userId: { in: customerUserIds } } } };
    } else {
      where = { assignments: { some: { userId: session.user.id } } };
    }
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      _count: { select: { issues: true, tasks: true, documents: true } },
    },
    orderBy: { dateCreated: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { projectName, proposalDate, estimatedCompleteDate, onMaintenance, maintAmount, dateStarted, companyId, description, status, githubRepo } = body;

  if (!projectName) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      projectName,
      proposalDate: proposalDate ? new Date(proposalDate) : null,
      estimatedCompleteDate: estimatedCompleteDate ? new Date(estimatedCompleteDate) : null,
      onMaintenance: onMaintenance || false,
      maintAmount: maintAmount || null,
      dateStarted: dateStarted ? new Date(dateStarted) : null,
      companyId: companyId || null,
      description: description || null,
      status: status || "ACTIVE",
      githubRepo: githubRepo || null,
    },
  });

  logAudit({
    action: "CREATE",
    entity: "PROJECT",
    entityId: project.id,
    description: `Created project: ${projectName}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json(project, { status: 201 });
}
