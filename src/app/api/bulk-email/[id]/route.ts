import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET /api/bulk-email/[id] – get campaign with recipients
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.bulkEmailCampaign.findUnique({
    where: { id },
    include: {
      recipients: {
        orderBy: { sentAt: "desc" },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json(campaign);
}

// PUT /api/bulk-email/[id] – update draft campaign
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.bulkEmailCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "DRAFT") {
    return NextResponse.json({ error: "Only draft campaigns can be edited" }, { status: 400 });
  }

  const body = await req.json();
  const { name, subject, contentHtml, contentText, format, recipientFilter } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (subject !== undefined) data.subject = subject;
  if (contentHtml !== undefined) data.contentHtml = contentHtml;
  if (contentText !== undefined) data.contentText = contentText;
  if (format !== undefined) data.format = format;
  if (recipientFilter !== undefined) {
    data.recipientFilter = recipientFilter ? JSON.stringify(recipientFilter) : null;
  }

  const updated = await prisma.bulkEmailCampaign.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

// DELETE /api/bulk-email/[id] – delete draft campaign
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.bulkEmailCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status === "SENDING") {
    return NextResponse.json({ error: "Cannot delete a campaign that is currently sending" }, { status: 400 });
  }

  await prisma.bulkEmailCampaign.delete({ where: { id } });

  logAudit({
    action: "DELETE",
    entity: "BULK_EMAIL",
    entityId: id,
    description: `Deleted bulk email campaign "${campaign.name}"`,
    userId: session.user.id!,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ success: true });
}
