import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isGooglePlayConfigured, listReviews } from "@/lib/google-play";

// GET: fetch reviews from Google Play for an app
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

  const app = await prisma.mobileApp.findUnique({ where: { id } });
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (!isAdmin && app.customerId !== userCustomerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (app.platform !== "GOOGLE_PLAY") {
    return NextResponse.json({ error: "Only available for Google Play apps" }, { status: 400 });
  }
  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json({ error: "Google Play not configured" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const maxResults = parseInt(searchParams.get("maxResults") || "20");
  const packageName = app.packageName || app.bundleId;

  try {
    const reviews = await listReviews(packageName, maxResults);
    return NextResponse.json({ reviews });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch reviews" },
      { status: 500 }
    );
  }
}
