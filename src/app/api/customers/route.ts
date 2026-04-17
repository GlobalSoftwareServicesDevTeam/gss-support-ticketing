import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getCustomerContext } from "@/lib/customer-context";

// GET: list all customers (admin) or customers linked to user's company
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const skip = (page - 1) * limit;

  const isAdmin = session.user.role === "ADMIN";

  // Non-admins can only see their own linked customer
  if (!isAdmin) {
    const ctx = getCustomerContext(session);
    if (!ctx) {
      return NextResponse.json({ customers: [], total: 0, page, limit });
    }
    const customer = await prisma.customer.findUnique({
      where: { id: ctx.customerId },
      include: { _count: { select: { contacts: true, issues: true } } },
    });
    return NextResponse.json({ customers: customer ? [customer] : [], total: customer ? 1 : 0, page: 1, limit });
  }

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { company: { contains: search } },
      { contactPerson: { contains: search } },
      { emailAddress: { contains: search } },
    ];
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        _count: { select: { contacts: true, issues: true } },
      },
      orderBy: { company: "asc" },
      skip,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  return NextResponse.json({ customers, total, page, limit });
}

// POST: create a new customer
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { company, contactPerson, emailAddress, phoneNumber, address, vatNumber, regNumber } = body;

  if (!company || !contactPerson || !emailAddress) {
    return NextResponse.json({ error: "company, contactPerson, and emailAddress are required" }, { status: 400 });
  }

  const existing = await prisma.customer.findUnique({ where: { emailAddress } });
  if (existing) {
    return NextResponse.json({ error: "A customer with this email already exists" }, { status: 409 });
  }

  const customer = await prisma.customer.create({
    data: {
      company,
      contactPerson,
      emailAddress,
      phoneNumber: phoneNumber || null,
      address: address || null,
      vatNumber: vatNumber || null,
      regNumber: regNumber || null,
    },
  });

  logAudit({
    action: "CREATE",
    entity: "CUSTOMER",
    entityId: customer.id,
    description: `Created customer: ${company} (${emailAddress})`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json(customer, { status: 201 });
}
