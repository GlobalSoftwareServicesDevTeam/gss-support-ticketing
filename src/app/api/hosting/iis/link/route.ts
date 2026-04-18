import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// POST: Link an IIS site to a customer
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { iisSiteId, siteName, domain, physicalPath, customerId, notes } = body;

  if (!iisSiteId || !siteName) {
    return NextResponse.json({ error: "iisSiteId and siteName required" }, { status: 400 });
  }

  try {
    const link = await prisma.iisSite.upsert({
      where: { iisSiteId },
      update: {
        siteName,
        domain: domain || null,
        physicalPath: physicalPath || null,
        customerId: customerId || null,
        notes: notes || null,
      },
      create: {
        iisSiteId,
        siteName,
        domain: domain || null,
        physicalPath: physicalPath || null,
        customerId: customerId || null,
        notes: notes || null,
      },
      include: {
        customer: { select: { id: true, company: true } },
      },
    });

    logAudit({
      action: customerId ? "UPDATE" : "DELETE",
      entity: "IIS_SITE_LINK",
      entityId: iisSiteId,
      description: customerId
        ? `Linked IIS site "${siteName}" to customer ${link.customer?.company || customerId}`
        : `Unlinked IIS site "${siteName}" from customer`,
      userId: session.user.id!,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ success: true, link });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to link IIS site" },
      { status: 500 }
    );
  }
}

// DELETE: Unlink an IIS site from a customer
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const iisSiteId = searchParams.get("iisSiteId");

  if (!iisSiteId) {
    return NextResponse.json({ error: "iisSiteId required" }, { status: 400 });
  }

  try {
    const existing = await prisma.iisSite.findUnique({ where: { iisSiteId } });
    if (existing) {
      await prisma.iisSite.delete({ where: { iisSiteId } });

      logAudit({
        action: "DELETE",
        entity: "IIS_SITE_LINK",
        entityId: iisSiteId,
        description: `Removed IIS site link for "${existing.siteName}"`,
        userId: session.user.id!,
        userName: session.user.name || undefined,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to unlink site" },
      { status: 500 }
    );
  }
}
