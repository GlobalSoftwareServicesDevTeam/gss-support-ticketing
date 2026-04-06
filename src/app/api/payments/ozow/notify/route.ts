import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateOzowHash } from "@/lib/ozow";
import { handlePostPaymentSsl } from "@/lib/post-payment-ssl";
import { handlePostPaymentHosting } from "@/lib/post-payment-hosting";

// Ozow notification handler (webhook)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Validate hash
    if (!validateOzowHash(body)) {
      console.error("Ozow notify: Invalid hash");
      return NextResponse.json({ error: "Invalid hash" }, { status: 400 });
    }

    const transactionRef = body.TransactionReference;
    const transactionId = body.TransactionId;
    const ozowStatus = body.Status;
    const amount = parseFloat(body.Amount || "0");

    // 2. Look up the payment
    const payment = await prisma.payment.findUnique({ where: { id: transactionRef } });
    if (!payment) {
      console.error("Ozow notify: Payment not found:", transactionRef);
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // 3. Verify amount
    if (Math.abs(Number(payment.amount) - amount) > 0.01) {
      console.error("Ozow notify: Amount mismatch", { expected: payment.amount, received: amount });
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    // 4. Map Ozow status
    let status = "PROCESSING";
    if (ozowStatus === "Complete") status = "COMPLETE";
    else if (ozowStatus === "Cancelled") status = "CANCELLED";
    else if (ozowStatus === "Error" || ozowStatus === "Abandoned") status = "FAILED";
    else if (ozowStatus === "PendingInvestigation") status = "PROCESSING";

    // 5. Update payment
    await prisma.payment.update({
      where: { id: transactionRef },
      data: {
        status,
        gatewayRef: transactionId,
        metadata: JSON.stringify(body),
      },
    });

    // 6. Post-payment automation (SSL certificates, hosting provisioning, etc.)
    if (status === "COMPLETE") {
      handlePostPaymentSsl(transactionRef).catch((err) =>
        console.error("Post-payment SSL error:", err)
      );
      handlePostPaymentHosting(transactionRef).catch((err) =>
        console.error("Post-payment hosting error:", err)
      );
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Ozow notify error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
