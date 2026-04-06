import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const referral = await prisma.referral.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, company: true, contactPerson: true, emailAddress: true } },
    },
  });

  if (!referral) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }

  // Non-admins can only view their own customer's referrals
  const userCustomerId = (session.user as { customerId?: string }).customerId;
  if (session.user.role !== "ADMIN" && referral.customerId !== userCustomerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(referral);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.referral.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.referrerName !== undefined) data.referrerName = body.referrerName;
  if (body.referrerEmail !== undefined) data.referrerEmail = body.referrerEmail;
  if (body.referrerPhone !== undefined) data.referrerPhone = body.referrerPhone || null;
  if (body.refereeName !== undefined) data.refereeName = body.refereeName;
  if (body.refereeEmail !== undefined) data.refereeEmail = body.refereeEmail;
  if (body.refereePhone !== undefined) data.refereePhone = body.refereePhone || null;
  if (body.refereeCompany !== undefined) data.refereeCompany = body.refereeCompany || null;
  if (body.service !== undefined) data.service = body.service || null;
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.customerId !== undefined) data.customerId = body.customerId || null;
  if (body.commissionRate !== undefined) data.commissionRate = parseFloat(body.commissionRate);
  if (body.commissionAmount !== undefined) data.commissionAmount = body.commissionAmount ? parseFloat(body.commissionAmount) : null;
  if (body.dealValue !== undefined) data.dealValue = body.dealValue ? parseFloat(body.dealValue) : null;

  if (body.status !== undefined) {
    data.status = body.status;
    if (body.status === "CONVERTED" && !existing.convertedAt) {
      data.convertedAt = new Date();
    }
    if (body.status === "PAID" && !existing.paidAt) {
      data.paidAt = new Date();
    }
  }

  const referral = await prisma.referral.update({ where: { id }, data });

  logAudit({
    action: "UPDATE",
    entity: "REFERRAL",
    entityId: id,
    description: `Updated referral: ${referral.referrerName} → ${referral.refereeName} (status: ${referral.status})`,
    userId: session.user.id,
  });

  return NextResponse.json(referral);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.referral.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }

  await prisma.referral.delete({ where: { id } });

  logAudit({
    action: "DELETE",
    entity: "REFERRAL",
    entityId: id,
    description: `Deleted referral: ${existing.referrerName} → ${existing.refereeName}`,
    userId: session.user.id,
  });

  return NextResponse.json({ success: true });
}
