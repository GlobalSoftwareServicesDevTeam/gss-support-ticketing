import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isGooglePlayConfigured, listInAppProducts, getInAppProduct } from "@/lib/google-play";

// GET: list in-app products from Google Play
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
  const sku = searchParams.get("sku");
  const packageName = app.packageName || app.bundleId;

  try {
    if (sku) {
      const product = await getInAppProduct(packageName, sku);
      return NextResponse.json(product);
    }
    const data = await listInAppProducts(packageName);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch products" },
      { status: 500 }
    );
  }
}
