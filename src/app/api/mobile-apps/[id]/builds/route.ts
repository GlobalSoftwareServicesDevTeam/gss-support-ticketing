import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list builds for a mobile app
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
  const status = searchParams.get("status") || "";

  const where: Record<string, unknown> = { appId: id };
  if (status) where.status = status;

  const builds = await prisma.appBuild.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(builds);
}

// POST: create/update a build record (admin only)
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

  const { version, buildNumber, status, trackOrChannel, releaseNotes, rejectionReason } = body;

  if (!version || !buildNumber || !status) {
    return NextResponse.json(
      { error: "version, buildNumber, and status are required" },
      { status: 400 }
    );
  }

  const validStatuses = ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "RELEASED"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const build = await prisma.appBuild.create({
    data: {
      appId: id,
      version,
      buildNumber,
      status,
      trackOrChannel: trackOrChannel || null,
      releaseNotes: releaseNotes || null,
      rejectionReason: rejectionReason || null,
      ...(status === "SUBMITTED" ? { submittedAt: new Date() } : {}),
      ...((status === "APPROVED" || status === "REJECTED") ? { reviewedAt: new Date() } : {}),
      ...(status === "RELEASED" ? { releasedAt: new Date() } : {}),
    },
  });

  return NextResponse.json(build, { status: 201 });
}
