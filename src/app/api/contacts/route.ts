import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "all";
  const customerId = searchParams.get("customerId") || "";
  const fromDate = searchParams.get("fromDate") || "";
  const toDate = searchParams.get("toDate") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "25");
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { email: { contains: search } },
      { position: { contains: search } },
      { customer: { company: { contains: search } } },
    ];
  }

  if (customerId) {
    where.customerId = customerId;
  }

  if (fromDate || toDate) {
    const createdAt: Record<string, unknown> = {};
    if (fromDate) createdAt.gte = new Date(`${fromDate}T00:00:00.000Z`);
    if (toDate) createdAt.lte = new Date(`${toDate}T23:59:59.999Z`);
    where.createdAt = createdAt;
  }

  if (status === "active") {
    where.inviteAccepted = true;
  } else if (status === "invited") {
    where.inviteAccepted = false;
    where.invitedAt = { not: null };
  } else if (status === "not-invited") {
    where.invitedAt = null;
    where.inviteAccepted = false;
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        customer: { select: { id: true, company: true } },
      },
      orderBy: [{ customer: { company: "asc" } }, { firstName: "asc" }],
      skip,
      take: limit,
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({ contacts, total, page, limit });
}
