import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  isGooglePlayConfigured,
  getCrashRateMetrics,
  getAnrRateMetrics,
  getExcessiveWakeupMetrics,
  getStuckWakelockMetrics,
  searchErrorIssues,
  searchErrorReports,
} from "@/lib/google-play";

// GET: fetch vitals & reporting data from Google Play Developer Reporting API
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
    return NextResponse.json({ error: "Reporting is only available for Google Play apps" }, { status: 400 });
  }
  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json({ error: "Google Play not configured" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "overview"; // overview, crashes, anrs, errors, issues
  const packageName = app.packageName || app.bundleId;

  // Default date range: last 30 days
  const endDate = searchParams.get("endDate") || new Date().toISOString().split("T")[0];
  const startDate = searchParams.get("startDate") || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  try {
    switch (type) {
      case "overview": {
        const [crashes, anrs, wakeups, wakelocks] = await Promise.all([
          getCrashRateMetrics(packageName, startDate, endDate).catch(() => ({ rows: [] })),
          getAnrRateMetrics(packageName, startDate, endDate).catch(() => ({ rows: [] })),
          getExcessiveWakeupMetrics(packageName, startDate, endDate).catch(() => ({ rows: [] })),
          getStuckWakelockMetrics(packageName, startDate, endDate).catch(() => ({ rows: [] })),
        ]);
        return NextResponse.json({ crashes, anrs, wakeups, wakelocks });
      }
      case "crashes":
        return NextResponse.json(await getCrashRateMetrics(packageName, startDate, endDate));
      case "anrs":
        return NextResponse.json(await getAnrRateMetrics(packageName, startDate, endDate));
      case "issues": {
        const filter = searchParams.get("filter") || undefined;
        const pageToken = searchParams.get("pageToken") || undefined;
        return NextResponse.json(await searchErrorIssues(packageName, filter, 50, pageToken));
      }
      case "errors": {
        const filter = searchParams.get("filter") || undefined;
        const pageToken = searchParams.get("pageToken") || undefined;
        return NextResponse.json(await searchErrorReports(packageName, filter, 50, pageToken));
      }
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reporting API error" },
      { status: 500 }
    );
  }
}
