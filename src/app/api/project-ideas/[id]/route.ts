import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const idea = await prisma.projectIdea.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, company: true, contactPerson: true, emailAddress: true } },
    },
  });

  if (!idea) {
    return NextResponse.json({ error: "Project idea not found" }, { status: 404 });
  }

  const userCustomerId = (session.user as { customerId?: string }).customerId;
  if (session.user.role !== "ADMIN" && idea.customerId !== userCustomerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(idea);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.projectIdea.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Project idea not found" }, { status: 404 });
  }

  // Non-admins can only edit their own ideas that are still NEW
  const userCustomerId = (session.user as { customerId?: string }).customerId;
  const isAdmin = session.user.role === "ADMIN";
  if (!isAdmin) {
    if (existing.customerId !== userCustomerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status !== "NEW") {
      return NextResponse.json({ error: "Can only edit ideas with NEW status" }, { status: 403 });
    }
  }

  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.category !== undefined) data.category = body.category;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.status !== undefined && isAdmin) data.status = body.status;
  if (body.budget !== undefined) data.budget = body.budget ? parseFloat(body.budget) : null;
  if (body.timeline !== undefined) data.timeline = body.timeline || null;
  if (body.submittedBy !== undefined) data.submittedBy = body.submittedBy || null;
  if (body.contactEmail !== undefined) data.contactEmail = body.contactEmail || null;
  if (body.adminNotes !== undefined && isAdmin) data.adminNotes = body.adminNotes || null;
  if (body.customerId !== undefined && isAdmin) data.customerId = body.customerId || null;

  const idea = await prisma.projectIdea.update({ where: { id }, data });

  logAudit({
    action: "UPDATE",
    entity: "PROJECT_IDEA",
    entityId: id,
    description: `Updated project idea: ${idea.title} (status: ${idea.status})`,
    userId: session.user.id,
  });

  return NextResponse.json(idea);
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

  const existing = await prisma.projectIdea.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Project idea not found" }, { status: 404 });
  }

  await prisma.projectIdea.delete({ where: { id } });

  logAudit({
    action: "DELETE",
    entity: "PROJECT_IDEA",
    entityId: id,
    description: `Deleted project idea: ${existing.title}`,
    userId: session.user.id,
  });

  return NextResponse.json({ success: true });
}
