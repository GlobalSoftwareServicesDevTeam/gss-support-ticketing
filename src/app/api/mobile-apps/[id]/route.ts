import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: get a single mobile app with stats summary
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = (session.user as { role: string }).role === "ADMIN";
  const userCustomerId = (session.user as { customerId?: string }).customerId;

  const app = await prisma.mobileApp.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, company: true } },
      builds: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  if (!isAdmin && app.customerId !== userCustomerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(app);
}

// PATCH: update a mobile app (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, bundleId, storeUrl, packageName, appleId, iconUrl, isActive, customerId } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (bundleId !== undefined) data.bundleId = bundleId;
  if (storeUrl !== undefined) data.storeUrl = storeUrl || null;
  if (packageName !== undefined) data.packageName = packageName || null;
  if (appleId !== undefined) data.appleId = appleId || null;
  if (iconUrl !== undefined) data.iconUrl = iconUrl || null;
  if (isActive !== undefined) data.isActive = isActive;
  if (customerId !== undefined) data.customerId = customerId;

  const app = await prisma.mobileApp.update({
    where: { id },
    data,
    include: {
      customer: { select: { id: true, company: true } },
    },
  });

  return NextResponse.json(app);
}

// DELETE: remove a mobile app (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.mobileApp.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
