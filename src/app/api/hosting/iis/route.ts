import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  isIisConfigured,
  listSites,
  getSite,
  startSite,
  stopSite,
} from "@/lib/iis";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET: List all IIS sites with customer assignments
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isIisConfigured();
  if (!configured) {
    return NextResponse.json({ error: "IIS API not configured. Go to System Settings → IIS Server." }, { status: 400 });
  }

  try {
    // Fetch sites from IIS and customer links from DB in parallel
    const [iisSites, dbSites] = await Promise.all([
      listSites(),
      prisma.iisSite.findMany({ include: { customer: { select: { id: true, company: true, contactPerson: true, emailAddress: true } } } }),
    ]);

    const dbMap = new Map(dbSites.map((s) => [s.iisSiteId, s]));

    const sites = iisSites.map((site) => {
      const linked = dbMap.get(site.id);
      const primaryBinding = site.bindings?.find((b) => b.hostname) || site.bindings?.[0];
      return {
        id: site.id,
        name: site.name,
        status: site.status,
        physicalPath: site.physical_path,
        autoStart: site.server_auto_start,
        bindings: site.bindings || [],
        hostname: primaryBinding?.hostname || "",
        port: primaryBinding?.port || 80,
        protocol: primaryBinding?.protocol || "http",
        // DB link info
        dbId: linked?.id || null,
        customerId: linked?.customerId || null,
        customerName: linked?.customer?.company || null,
        customerEmail: linked?.customer?.emailAddress || null,
        notes: linked?.notes || null,
      };
    });

    return NextResponse.json({ sites });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list IIS sites" },
      { status: 500 }
    );
  }
}

// POST: Actions on IIS sites (start, stop)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isIisConfigured();
  if (!configured) {
    return NextResponse.json({ error: "IIS API not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { action, siteId, siteName } = body;

  if (!siteId || !action) {
    return NextResponse.json({ error: "siteId and action required" }, { status: 400 });
  }

  try {
    let result;
    switch (action) {
      case "start":
        result = await startSite(siteId);
        break;
      case "stop":
        result = await stopSite(siteId);
        break;
      case "info":
        result = await getSite(siteId);
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    logAudit({
      action: "UPDATE",
      entity: "IIS_SITE",
      entityId: siteId,
      description: `IIS site "${siteName || siteId}" action: ${action}`,
      userId: session.user.id!,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ success: true, site: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : `Failed to ${action} site` },
      { status: 500 }
    );
  }
}
