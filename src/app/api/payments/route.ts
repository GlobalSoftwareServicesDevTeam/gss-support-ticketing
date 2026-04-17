import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildPayfastForm, isPayfastConfigured } from "@/lib/payfast";
import { buildOzowPaymentUrl, isOzowConfigured } from "@/lib/ozow";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { getCustomerContext } from "@/lib/customer-context";
import { getCustomerUserIds } from "@/lib/customer-users";

// GET: list payments for current user (or all for admin)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const where: Record<string, unknown> = {};
  if (session.user.role === "ADMIN") {
    // Admin sees all
  } else {
    const ctx = getCustomerContext(session);
    if (ctx && ctx.permissions.billing) {
      const customerUserIds = await getCustomerUserIds(ctx.customerId);
      where.userId = { in: customerUserIds };
    } else {
      where.userId = session.user.id;
    }
  }

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
  const { gateway, amount, description, invoiceNumber, paymentType, saveCard } = body;

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

  logAudit({
    action: "PAYMENT",
    entity: "PAYMENT",
    entityId: payment.id,
    description: `Initiated ${gateway} payment of R${amount}${invoiceNumber ? ` for invoice ${invoiceNumber}` : ""}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { gateway, amount, invoiceNumber },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "https://support.globalsoftwareservices.co.za";

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
        saveCard: saveCard === true,
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
  // Notify admin about the EFT payment
  try {
    const amountFormatted = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);
    await sendEmail({
      to: "navis@globalsoftwareservices.co.za",
      subject: `EFT Payment Recorded — ${amountFormatted}${invoiceNumber ? ` for ${invoiceNumber}` : ""}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1a2b47;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;font-size:18px;">New EFT Payment Recorded</h2>
          </div>
          <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
            <p style="margin:0 0 16px;color:#4a5568;">A client has indicated they will make an EFT payment. <strong>Funds have not been allocated</strong> — please verify receipt in your bank account before marking this payment as complete.</p>
            <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
              <tr style="background:#f7fafc;"><td style="padding:10px 14px;font-weight:600;color:#2d3748;width:140px;">Customer</td><td style="padding:10px 14px;color:#4a5568;">${session.user.name || "—"} (${session.user.email || "—"})</td></tr>
              <tr><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Amount</td><td style="padding:10px 14px;color:#4a5568;font-weight:700;font-size:16px;">${amountFormatted}</td></tr>
              ${invoiceNumber ? `<tr style="background:#f7fafc;"><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Invoice</td><td style="padding:10px 14px;color:#4a5568;">${invoiceNumber}</td></tr>` : ""}
              ${description ? `<tr><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Description</td><td style="padding:10px 14px;color:#4a5568;">${description}</td></tr>` : ""}
              <tr style="background:#f7fafc;"><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Payment ID</td><td style="padding:10px 14px;color:#4a5568;font-family:monospace;font-size:13px;">${payment.id}</td></tr>
              <tr><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Status</td><td style="padding:10px 14px;"><span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">PENDING</span></td></tr>
            </table>
            <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;padding:12px 16px;margin:0 0 16px;">
              <p style="margin:0;font-size:13px;color:#92400e;"><strong>Action required:</strong> Confirm the funds have been received in your bank account, then update the payment status in the portal.</p>
            </div>
            <p style="margin:0;font-size:12px;color:#a0aec0;">GSS Support Portal</p>
          </div>
        </div>
      `,
    });
  } catch {
    // Email failed but payment was recorded — don't block the response
  }

  return NextResponse.json({
    paymentId: payment.id,
    gateway: "EFT",
    message: "Please use the bank details provided to complete your EFT payment.",
  });
}
