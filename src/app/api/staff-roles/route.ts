import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roles = await prisma.staffRole.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { users: true } },
    },
  });

  return NextResponse.json(roles);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, ...permissions } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  }

  const existing = await prisma.staffRole.findUnique({
    where: { name: name.trim() },
  });
  if (existing) {
    return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
  }

  const permissionFields = {
    canManageTickets: permissions.canManageTickets === true,
    canManageProjects: permissions.canManageProjects === true,
    canManageBilling: permissions.canManageBilling === true,
    canManageHosting: permissions.canManageHosting === true,
    canManageUsers: permissions.canManageUsers === true,
    canManageDocuments: permissions.canManageDocuments === true,
    canManageCode: permissions.canManageCode === true,
    canViewAuditLogs: permissions.canViewAuditLogs === true,
    canManageSettings: permissions.canManageSettings === true,
    canManageCustomers: permissions.canManageCustomers === true,
    canManageTasks: permissions.canManageTasks === true,
    canManageSentry: permissions.canManageSentry === true,
    canBulkEmail: permissions.canBulkEmail === true,
  };

  const role = await prisma.staffRole.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      ...permissionFields,
    },
  });

  logAudit({
    action: "CREATE",
    entity: "STAFF_ROLE",
    entityId: role.id,
    description: `Created staff role: ${role.name}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json(role, { status: 201 });
}
