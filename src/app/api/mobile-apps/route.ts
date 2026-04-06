import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list all mobile apps (admin sees all, users see their customer's apps)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const platform = searchParams.get("platform") || "";
  const customerId = searchParams.get("customerId") || "";

  const isAdmin = (session.user as { role: string }).role === "ADMIN";
  const userCustomerId = (session.user as { customerId?: string }).customerId;

  const where: Record<string, unknown> = { isActive: true };

  if (!isAdmin) {
    if (!userCustomerId) {
      return NextResponse.json([]);
    }
    where.customerId = userCustomerId;
  } else if (customerId) {
    where.customerId = customerId;
  }

  if (platform) where.platform = platform;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { bundleId: { contains: search } },
    ];
  }

  const apps = await prisma.mobileApp.findMany({
    where,
    include: {
      customer: { select: { id: true, company: true } },
      _count: { select: { stats: true, builds: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(apps);
}

// POST: create a new mobile app (admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, bundleId, platform, storeUrl, packageName, appleId, iconUrl, customerId } = body;

  if (!name || !bundleId || !platform || !customerId) {
    return NextResponse.json(
      { error: "name, bundleId, platform, and customerId are required" },
      { status: 400 }
    );
  }

  if (!["GOOGLE_PLAY", "APPLE"].includes(platform)) {
    return NextResponse.json({ error: "platform must be GOOGLE_PLAY or APPLE" }, { status: 400 });
  }

  const app = await prisma.mobileApp.create({
    data: {
      name,
      bundleId,
      platform,
      storeUrl: storeUrl || null,
      packageName: packageName || (platform === "GOOGLE_PLAY" ? bundleId : null),
      appleId: appleId || null,
      iconUrl: iconUrl || null,
      customerId,
    },
    include: {
      customer: { select: { id: true, company: true } },
    },
  });

  return NextResponse.json(app, { status: 201 });
}
