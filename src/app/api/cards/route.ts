import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: list saved cards for current user
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cards = await prisma.savedCard.findMany({
    where: { userId: session.user.id, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      gateway: true,
      cardBrand: true,
      last4: true,
      expiryMonth: true,
      expiryYear: true,
      nickname: true,
      isDefault: true,
      createdAt: true,
    },
  });

  return NextResponse.json(cards);
}

// POST: charge a saved card (PayFast ad-hoc)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { cardId, amount, description, invoiceNumber } = body;

  if (!cardId || !amount || amount <= 0) {
    return NextResponse.json({ error: "cardId and amount are required" }, { status: 400 });
  }

  // Verify the card belongs to this user
  const card = await prisma.savedCard.findFirst({
    where: { id: cardId, userId: session.user.id, isActive: true },
  });

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      gateway: "PAYFAST",
      amount,
      description: description || null,
      invoiceNumber: invoiceNumber || null,
      customerEmail: session.user.email,
      customerName: session.user.name,
      status: "PROCESSING",
      userId: session.user.id,
      savedCardId: card.id,
      metadata: JSON.stringify({ paymentType: "saved_card", cardId: card.id }),
    },
  });

  // Charge via PayFast ad-hoc API
  const { chargePayfastToken } = await import("@/lib/payfast");
  const result = await chargePayfastToken({
    token: card.token,
    amount,
    itemName: description || `Payment ${payment.id.slice(0, 8)}`,
    paymentId: payment.id,
    invoiceNumber,
  });

  if (!result.success) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", metadata: JSON.stringify({ error: result.error }) },
    });
    return NextResponse.json({ error: result.error || "Payment failed" }, { status: 400 });
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "COMPLETE",
      gatewayRef: result.pfPaymentId || null,
    },
  });

  return NextResponse.json({
    paymentId: payment.id,
    status: "COMPLETE",
    message: "Payment processed successfully",
  });
}
