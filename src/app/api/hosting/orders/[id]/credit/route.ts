import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  isInvoiceNinjaConfigured,
  createCredit,
} from "@/lib/invoice-ninja";

// POST: issue a credit note for a user tied to a hosting order (admin only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { amount, description } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const order = await prisma.hostingOrder.findUnique({
      where: { id },
      include: { user: true, product: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!isInvoiceNinjaConfigured()) {
      return NextResponse.json({ error: "Invoice Ninja not configured" }, { status: 400 });
    }

    const clientId = order.user.invoiceNinjaClientId;
    if (!clientId) {
      return NextResponse.json({ error: "User does not have a billing account" }, { status: 400 });
    }

    const desc =
      description ||
      `Credit for ${order.product?.name || order.orderType}${order.domain ? ` - ${order.domain}` : ""}`;

    const credit = await createCredit({
      clientId,
      amount: Number(amount),
      description: desc,
    });

    return NextResponse.json({
      message: "Credit note created",
      creditId: credit.id,
      creditNumber: credit.number,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
