import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "25");
  const skip = (page - 1) * limit;

  const isAdmin = session.user.role === "ADMIN";
  const userCustomerId = (session.user as { customerId?: string }).customerId;

  const where: Record<string, unknown> = {};

  // Non-admins only see referrals linked to their customer
  if (!isAdmin && userCustomerId) {
    where.customerId = userCustomerId;
  } else if (!isAdmin) {
    return NextResponse.json({ referrals: [], total: 0 });
  }

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { referrerName: { contains: search } },
      { referrerEmail: { contains: search } },
      { refereeName: { contains: search } },
      { refereeEmail: { contains: search } },
      { refereeCompany: { contains: search } },
    ];
  }

  const [referrals, total] = await Promise.all([
    prisma.referral.findMany({
      where,
      include: {
        customer: { select: { id: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.referral.count({ where }),
  ]);

  return NextResponse.json({ referrals, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    referrerName,
    referrerEmail,
    referrerPhone,
    refereeName,
    refereeEmail,
    refereePhone,
    refereeCompany,
    service,
    notes,
    customerId,
  } = body;

  const userCustomerId = (session.user as { customerId?: string }).customerId;

  if (!referrerName || !referrerEmail || !refereeName || !refereeEmail) {
    return NextResponse.json(
      { error: "referrerName, referrerEmail, refereeName, and refereeEmail are required" },
      { status: 400 }
    );
  }

  const referral = await prisma.referral.create({
    data: {
      referrerName,
      referrerEmail,
      referrerPhone: referrerPhone || null,
      refereeName,
      refereeEmail,
      refereePhone: refereePhone || null,
      refereeCompany: refereeCompany || null,
      service: service || null,
      notes: notes || null,
      customerId: customerId || userCustomerId || null,
    },
  });

  logAudit({
    action: "CREATE",
    entity: "REFERRAL",
    entityId: referral.id,
    description: `Referral created: ${referrerName} referred ${refereeName} (${refereeEmail})`,
    userId: session.user.id,
  });

  return NextResponse.json(referral, { status: 201 });
}
