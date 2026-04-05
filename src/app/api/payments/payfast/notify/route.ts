import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validatePayfastSignature, validatePayfastServer } from "@/lib/payfast";

// PayFast ITN (Instant Transaction Notification) handler
// This is called by PayFast servers, NOT by the user's browser
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const params = Object.fromEntries(new URLSearchParams(body));

    // 1. Validate signature
    if (!validatePayfastSignature(params)) {
      console.error("PayFast ITN: Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // 2. Validate with PayFast server
    const isValid = await validatePayfastServer(body);
    if (!isValid) {
      console.error("PayFast ITN: Server validation failed");
      return NextResponse.json({ error: "Server validation failed" }, { status: 400 });
    }

    const paymentId = params.m_payment_id;
    const pfPaymentId = params.pf_payment_id;
    const paymentStatus = params.payment_status;
    const amountGross = parseFloat(params.amount_gross || "0");

    // 3. Look up the payment
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      console.error("PayFast ITN: Payment not found:", paymentId);
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // 4. Verify amount matches
    if (Math.abs(Number(payment.amount) - amountGross) > 0.01) {
      console.error("PayFast ITN: Amount mismatch", { expected: payment.amount, received: amountGross });
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    // 5. Map PayFast status
    let status = "PROCESSING";
    if (paymentStatus === "COMPLETE") status = "COMPLETE";
    else if (paymentStatus === "FAILED") status = "FAILED";
    else if (paymentStatus === "CANCELLED") status = "CANCELLED";

    // 6. Update payment record
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        gatewayRef: pfPaymentId,
        metadata: JSON.stringify(params),
      },
    });

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("PayFast ITN error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
