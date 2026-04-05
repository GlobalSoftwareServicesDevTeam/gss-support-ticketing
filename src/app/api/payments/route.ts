import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildPayfastForm, isPayfastConfigured } from "@/lib/payfast";
import { buildOzowPaymentUrl, isOzowConfigured } from "@/lib/ozow";

// GET: list payments for current user (or all for admin)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const where: Record<string, unknown> =
    session.user.role === "ADMIN" ? {} : { userId: session.user.id };

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payment.count({ where }),
  ]);

  return NextResponse.json({
    payments,
    total,
    page,
    limit,
    gateways: {
      payfast: isPayfastConfigured(),
      ozow: isOzowConfigured(),
    },
  });
}

// POST: initiate a payment
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { gateway, amount, description, invoiceNumber, paymentType } = body;

  if (!gateway || !amount || amount <= 0) {
    return NextResponse.json({ error: "gateway and amount are required" }, { status: 400 });
  }

  if (!["PAYFAST", "OZOW", "EFT"].includes(gateway)) {
    return NextResponse.json({ error: "Invalid gateway. Use PAYFAST, OZOW, or EFT" }, { status: 400 });
  }

  // Build metadata for payment type tracking
  const metadata = paymentType ? JSON.stringify({ paymentType }) : null;

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      gateway,
      amount,
      description: description || null,
      invoiceNumber: invoiceNumber || null,
      customerEmail: session.user.email,
      customerName: session.user.name,
      status: gateway === "EFT" ? "PENDING" : "PROCESSING",
      userId: session.user.id,
      metadata,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "https://support.globaltest.net.za";

  if (gateway === "PAYFAST") {
    if (!isPayfastConfigured()) {
      return NextResponse.json({ error: "PayFast not configured" }, { status: 400 });
    }

    const nameParts = (session.user.name || "").split(" ");
    const formData = buildPayfastForm(
      {
        amount,
        itemName: description || `Payment ${payment.id.slice(0, 8)}`,
        invoiceNumber,
        customerEmail: session.user.email || undefined,
        customerFirstName: nameParts[0] || undefined,
        customerLastName: nameParts.slice(1).join(" ") || undefined,
        paymentId: payment.id,
      },
      baseUrl
    );

    return NextResponse.json({
      paymentId: payment.id,
      gateway: "PAYFAST",
      redirect: formData,
    });
  }

  if (gateway === "OZOW") {
    if (!isOzowConfigured()) {
      return NextResponse.json({ error: "Ozow not configured" }, { status: 400 });
    }

    const ozowData = buildOzowPaymentUrl(
      {
        amount,
        transactionRef: payment.id,
        bankRef: invoiceNumber || payment.id.slice(0, 16),
        customerEmail: session.user.email || undefined,
      },
      baseUrl
    );

    return NextResponse.json({
      paymentId: payment.id,
      gateway: "OZOW",
      redirect: ozowData,
    });
  }

  // EFT: just return the payment record — user pays manually
  return NextResponse.json({
    paymentId: payment.id,
    gateway: "EFT",
    message: "Please use the bank details provided to complete your EFT payment.",
  });
}
