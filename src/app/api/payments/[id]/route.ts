import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

// PATCH /api/payments/[id] — Admin verifies or rejects a pending EFT payment
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action } = body; // "verify" or "reject"

  if (!["verify", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action. Use 'verify' or 'reject'" }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.status !== "PENDING") {
    return NextResponse.json({ error: `Cannot ${action} a payment with status ${payment.status}` }, { status: 400 });
  }

  const newStatus = action === "verify" ? "COMPLETE" : "FAILED";
  const amountFormatted = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(payment.amount));

  const updated = await prisma.payment.update({
    where: { id },
    data: { status: newStatus },
  });

  logAudit({
    action: action === "verify" ? "VERIFY" : "REJECT",
    entity: "PAYMENT",
    entityId: id,
    description: `${action === "verify" ? "Verified" : "Rejected"} EFT payment of ${amountFormatted}${payment.invoiceNumber ? ` for ${payment.invoiceNumber}` : ""} from ${payment.customerName || payment.customerEmail || "unknown"}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { paymentId: id, action, gateway: payment.gateway, amount: Number(payment.amount), invoiceNumber: payment.invoiceNumber },
  });

  // Notify the customer via email
  if (payment.customerEmail) {
    try {
      if (action === "verify") {
        await sendEmail({
          to: payment.customerEmail,
          subject: `Payment Confirmed — ${amountFormatted}${payment.invoiceNumber ? ` for ${payment.invoiceNumber}` : ""}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:#065f46;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
                <h2 style="margin:0;font-size:18px;">EFT Payment Confirmed</h2>
              </div>
              <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
                <p style="margin:0 0 16px;color:#4a5568;">Hi ${payment.customerName || "there"},</p>
                <p style="margin:0 0 16px;color:#4a5568;">Your EFT payment has been verified and confirmed. Thank you!</p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
                  <tr style="background:#f0fdf4;"><td style="padding:10px 14px;font-weight:600;color:#2d3748;width:140px;">Amount</td><td style="padding:10px 14px;color:#065f46;font-weight:700;font-size:16px;">${amountFormatted}</td></tr>
                  ${payment.invoiceNumber ? `<tr><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Invoice</td><td style="padding:10px 14px;color:#4a5568;">${payment.invoiceNumber}</td></tr>` : ""}
                  <tr style="background:#f0fdf4;"><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Status</td><td style="padding:10px 14px;"><span style="background:#dcfce7;color:#166534;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">CONFIRMED</span></td></tr>
                </table>
                <p style="margin:0;font-size:12px;color:#a0aec0;">GSS Support Portal</p>
              </div>
            </div>
          `,
        });
      } else {
        await sendEmail({
          to: payment.customerEmail,
          subject: `Payment Not Received — ${amountFormatted}${payment.invoiceNumber ? ` for ${payment.invoiceNumber}` : ""}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:#991b1b;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
                <h2 style="margin:0;font-size:18px;">EFT Payment Not Received</h2>
              </div>
              <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
                <p style="margin:0 0 16px;color:#4a5568;">Hi ${payment.customerName || "there"},</p>
                <p style="margin:0 0 16px;color:#4a5568;">We were unable to confirm receipt of your EFT payment. Please verify your transfer was completed correctly and contact us if you need assistance.</p>
                <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
                  <tr style="background:#fef2f2;"><td style="padding:10px 14px;font-weight:600;color:#2d3748;width:140px;">Amount</td><td style="padding:10px 14px;color:#991b1b;font-weight:700;font-size:16px;">${amountFormatted}</td></tr>
                  ${payment.invoiceNumber ? `<tr><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Invoice</td><td style="padding:10px 14px;color:#4a5568;">${payment.invoiceNumber}</td></tr>` : ""}
                  <tr style="background:#fef2f2;"><td style="padding:10px 14px;font-weight:600;color:#2d3748;">Status</td><td style="padding:10px 14px;"><span style="background:#fee2e2;color:#991b1b;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">NOT RECEIVED</span></td></tr>
                </table>
                <p style="margin:0 0 16px;color:#4a5568;">If you believe this is an error, please reply to this email or contact support.</p>
                <p style="margin:0;font-size:12px;color:#a0aec0;">GSS Support Portal</p>
              </div>
            </div>
          `,
        });
      }
    } catch {
      // Email failed — don't block the response
    }
  }

  return NextResponse.json({ success: true, payment: updated });
}
