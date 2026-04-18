import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getCustomerContext } from "@/lib/customer-context";
import { logAudit } from "@/lib/audit";

function canManageMobileApps(session: {
  user?: {
    role?: string;
    staffPermissions?: { manageSettings?: boolean };
  };
} | null): boolean {
  if (!session?.user) return false;
  if (session.user.role === "ADMIN") return true;
  return Boolean(session.user.staffPermissions?.manageSettings);
}

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
    select: { id: true, customerId: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!canManageMobileApps(session)) {
    const ctx = getCustomerContext(session);
    const isCustomerProject = ctx && project.customerId === ctx.customerId;
    const assignment = await prisma.projectAssignment.findFirst({
      where: { projectId: id, userId: session.user.id },
      select: { id: true },
    });
    if (!isCustomerProject && !assignment) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!project.customerId) {
    return NextResponse.json([]);
  }

  const apps = await prisma.mobileApp.findMany({
    where: { customerId: project.customerId },
    include: {
      customer: { select: { id: true, company: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(apps);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!canManageMobileApps(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, customerId: true, projectName: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.customerId) {
    return NextResponse.json({ error: "Project has no linked customer" }, { status: 400 });
  }

  const body = await req.json();
  const appId = typeof body.appId === "string" ? body.appId : "";
  if (!appId) {
    return NextResponse.json({ error: "appId is required" }, { status: 400 });
  }

  const app = await prisma.mobileApp.findUnique({
    where: { id: appId },
    select: { id: true, customerId: true, name: true },
  });

  if (!app || app.customerId !== project.customerId) {
    return NextResponse.json({ error: "Mobile app not found for this project" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.storeUrl !== undefined) data.storeUrl = String(body.storeUrl || "").trim() || null;
  if (body.packageName !== undefined) data.packageName = String(body.packageName || "").trim() || null;
  if (body.appleId !== undefined) data.appleId = String(body.appleId || "").trim() || null;
  if (body.iconUrl !== undefined) data.iconUrl = String(body.iconUrl || "").trim() || null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const updated = await prisma.mobileApp.update({
    where: { id: appId },
    data,
    include: {
      customer: { select: { id: true, company: true } },
    },
  });

  logAudit({
    action: "UPDATE",
    entity: "PROJECT",
    entityId: id,
    description: `Updated mobile app ${updated.name} from project ${project.projectName}`,
    userId: session!.user.id,
    userName: session!.user.name || undefined,
    metadata: {
      mobileAppId: updated.id,
      mobileAppName: updated.name,
      projectId: id,
    },
  });

  return NextResponse.json(updated);
}
