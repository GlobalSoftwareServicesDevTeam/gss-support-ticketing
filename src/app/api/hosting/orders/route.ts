import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list orders for current user (or all for admin)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> =
    session.user.role === "ADMIN" ? {} : { userId: session.user.id };
  if (status) where.status = status;

  const orders = await prisma.hostingOrder.findMany({
    where,
    include: {
      product: { select: { name: true, type: true, monthlyPrice: true } },
      user: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orders);
}

// POST: create a new hosting order
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { orderType, domain, productId, notes, period } = body;

  const validTypes = [
    "HOSTING",
    "DOMAIN_REGISTER",
    "DOMAIN_TRANSFER",
    "SSL",
    "ADDITIONAL_HOSTING",
    "QUOTE_REQUEST",
  ];
  if (!orderType || !validTypes.includes(orderType)) {
    return NextResponse.json({ error: "Invalid orderType" }, { status: 400 });
  }

  // Validate product exists if provided
  let amount = null;
  if (productId) {
    const product = await prisma.hostingProduct.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      return NextResponse.json({ error: "Product not found or inactive" }, { status: 400 });
    }
    amount = product.monthlyPrice;
  }

  const order = await prisma.hostingOrder.create({
    data: {
      orderType,
      domain: domain?.trim().toLowerCase() || null,
      productId: productId || null,
      notes: notes || null,
      amount,
      period: period || 1,
      userId: session.user.id,
    },
    include: {
      product: { select: { name: true, type: true, monthlyPrice: true } },
    },
  });

  return NextResponse.json(order, { status: 201 });
}
