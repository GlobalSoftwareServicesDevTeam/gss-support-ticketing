import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: get stats for a mobile app
export async function GET(
  req: NextRequest,
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
    select: { id: true, customerId: true },
  });

  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }
  if (!isAdmin && app.customerId !== userCustomerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const country = searchParams.get("country");

  const where: Record<string, unknown> = { appId: id };

  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    where.date = dateFilter;
  }

  if (country) {
    where.country = country;
  } else {
    where.country = null; // aggregate (no country = totals)
  }

  const stats = await prisma.appStoreStatistic.findMany({
    where,
    orderBy: { date: "desc" },
    take: 365,
  });

  return NextResponse.json(stats);
}

// POST: manually add or sync stats (admin only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const app = await prisma.mobileApp.findUnique({ where: { id } });
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  // Manual stat entry
  const { date, downloads, updates, activeDevices, revenue, ratings, averageRating, crashes, uninstalls, country } = body;

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const stat = await prisma.appStoreStatistic.upsert({
    where: {
      appId_date_country: {
        appId: id,
        date: new Date(date),
        country: country || null,
      },
    },
    update: {
      downloads: downloads ?? undefined,
      updates: updates ?? undefined,
      activeDevices: activeDevices ?? undefined,
      revenue: revenue ?? undefined,
      ratings: ratings ?? undefined,
      averageRating: averageRating ?? undefined,
      crashes: crashes ?? undefined,
      uninstalls: uninstalls ?? undefined,
    },
    create: {
      appId: id,
      date: new Date(date),
      country: country || null,
      downloads: downloads || 0,
      updates: updates || 0,
      activeDevices: activeDevices || 0,
      revenue: revenue || 0,
      ratings: ratings || 0,
      averageRating: averageRating || 0,
      crashes: crashes || 0,
      uninstalls: uninstalls || 0,
    },
  });

  return NextResponse.json(stat, { status: 201 });
}
