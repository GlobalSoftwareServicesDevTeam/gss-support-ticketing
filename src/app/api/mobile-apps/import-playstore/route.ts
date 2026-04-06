import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isGooglePlayConfigured, getAppListing, getAppListings } from "@/lib/google-play";

/**
 * POST: Fetch app info from Google Play for given package names.
 * Body: { packageNames: string[], customerId?: string }
 * - If packageNames is empty, returns error
 * - Returns fetched app info for preview (doesn't create anything)
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json(
      { error: "Google Play is not configured. Add a Service Account key in System Settings." },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { packageNames, customerId, action } = body as {
    packageNames: string[];
    customerId?: string;
    action?: "preview" | "import";
  };

  if (!packageNames || !Array.isArray(packageNames) || packageNames.length === 0) {
    return NextResponse.json({ error: "packageNames array is required" }, { status: 400 });
  }

  // Limit to 50 packages per request
  const cleanNames = packageNames
    .map((n: string) => n.trim())
    .filter((n: string) => n.length > 0)
    .slice(0, 50);

  // Fetch info from Google Play
  const fetched = await getAppListings(cleanNames);

  if (action === "import" && customerId) {
    // Actually create the apps
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const app of fetched) {
      try {
        // Check if already exists
        const existing = await prisma.mobileApp.findFirst({
          where: {
            bundleId: app.packageName,
            platform: "GOOGLE_PLAY",
          },
        });

        if (existing) {
          skipped.push(app.packageName);
          continue;
        }

        await prisma.mobileApp.create({
          data: {
            name: app.title,
            bundleId: app.packageName,
            platform: "GOOGLE_PLAY",
            packageName: app.packageName,
            storeUrl: app.storeUrl,
            iconUrl: app.iconUrl || null,
            customerId,
          },
        });
        created.push(app.packageName);
      } catch (err) {
        errors.push(`${app.packageName}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      created,
      skipped,
      errors,
      notFound: cleanNames.filter((n) => !fetched.find((f) => f.packageName === n)),
    });
  }

  // Preview mode - just return fetched info
  return NextResponse.json({
    apps: fetched,
    notFound: cleanNames.filter((n) => !fetched.find((f) => f.packageName === n)),
  });
}

/**
 * GET: Fetch info for a single package name (for auto-fill in Add App form)
 * Query: ?packageName=com.example.app
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isGooglePlayConfigured())) {
    return NextResponse.json(
      { error: "Google Play is not configured" },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const packageName = searchParams.get("packageName");
  if (!packageName) {
    return NextResponse.json({ error: "packageName is required" }, { status: 400 });
  }

  const info = await getAppListing(packageName.trim());
  if (!info) {
    return NextResponse.json(
      { error: "App not found or not accessible with current credentials" },
      { status: 404 }
    );
  }

  return NextResponse.json(info);
}
