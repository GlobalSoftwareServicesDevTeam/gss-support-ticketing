import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const role = await prisma.staffRole.findUnique({
    where: { id },
    include: {
      users: {
        where: { isDeleted: false },
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  return NextResponse.json(role);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, description, ...permissions } = body;

  const existing = await prisma.staffRole.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  if (name && name.trim() !== existing.name) {
    const nameConflict = await prisma.staffRole.findUnique({
      where: { name: name.trim() },
    });
    if (nameConflict) {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description?.trim() || null;

  const permissionKeys = [
    "canManageTickets", "canManageProjects", "canManageBilling", "canManageHosting",
    "canManageUsers", "canManageDocuments", "canManageCode", "canViewAuditLogs",
    "canManageSettings", "canManageCustomers", "canManageTasks", "canManageSentry", "canBulkEmail",
  ];

  for (const key of permissionKeys) {
    if (permissions[key] !== undefined) {
      updateData[key] = permissions[key] === true;
    }
  }

  const role = await prisma.staffRole.update({
    where: { id },
    data: updateData,
  });

  logAudit({
    action: "UPDATE",
    entity: "STAFF_ROLE",
    entityId: role.id,
    description: `Updated staff role: ${role.name}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json(role);
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

  const role = await prisma.staffRole.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  if (role._count.users > 0) {
    return NextResponse.json(
      { error: `Cannot delete role "${role.name}" — it is assigned to ${role._count.users} user(s). Reassign them first.` },
      { status: 400 }
    );
  }

  await prisma.staffRole.delete({ where: { id } });

  logAudit({
    action: "DELETE",
    entity: "STAFF_ROLE",
    entityId: role.id,
    description: `Deleted staff role: ${role.name}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ message: "Role deleted" });
}
