import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET /api/bulk-email – list campaigns
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status) where.status = status;

  const [campaigns, total] = await Promise.all([
    prisma.bulkEmailCampaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.bulkEmailCampaign.count({ where }),
  ]);

  return NextResponse.json({ campaigns, total, page, limit });
}

// POST /api/bulk-email – create campaign
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, subject, contentHtml, contentText, format, recipientFilter } = body;

  if (!name || !subject) {
    return NextResponse.json({ error: "name and subject are required" }, { status: 400 });
  }

  if (format === "html" && !contentHtml) {
    return NextResponse.json({ error: "HTML content is required for HTML format" }, { status: 400 });
  }

  if (format === "text" && !contentText) {
    return NextResponse.json({ error: "Plain text content is required for text format" }, { status: 400 });
  }

  const campaign = await prisma.bulkEmailCampaign.create({
    data: {
      name,
      subject,
      contentHtml: contentHtml || null,
      contentText: contentText || null,
      format: format || "html",
      recipientFilter: recipientFilter ? JSON.stringify(recipientFilter) : null,
      createdBy: session.user.id!,
      createdByName: session.user.name || null,
    },
  });

  logAudit({
    action: "CREATE",
    entity: "BULK_EMAIL",
    entityId: campaign.id,
    description: `Created bulk email campaign "${name}"`,
    userId: session.user.id!,
    userName: session.user.name || undefined,
  });

  return NextResponse.json(campaign, { status: 201 });
}
