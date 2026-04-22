import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { createPayment, isInvoiceNinjaConfigured } from "@/lib/invoice-ninja";
import { logAudit } from "@/lib/audit";

const INVOICE_NINJA_URL = (process.env.INVOICE_NINJA_URL || "").replace(/\/+$/, "");
const INVOICE_NINJA_TOKEN = process.env.INVOICE_NINJA_TOKEN || "";

async function ninjaFetch(endpoint: string) {
  const url = `${INVOICE_NINJA_URL}/api/v1/${endpoint}`;
  const res = await fetch(url, {
    headers: {
      "X-Api-Token": INVOICE_NINJA_TOKEN,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Invoice Ninja API ${res.status}: ${text}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.json() as Promise<any>;
}

/**
 * POST /api/payments/allocate
 * Admin-only: allocate a local payment to Invoice Ninja invoice(s).
 *
 * Body: {
 *   paymentId: string          â€” local Payment record ID
 *   invoices: [{ invoiceId: string, amount: number }]  â€” IN invoice allocations
 * }
 *
 * OR for a direct allocation without a local payment:
 * Body: {
 *   clientId: string           â€” Invoice Ninja client ID
 *   amount: number
 *   date?: string              â€” YYYY-MM-DD
 *   transactionReference?: string
 *   invoices: [{ invoiceId: string, amount: number }]
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isInvoiceNinjaConfigured()) {
      return NextResponse.json({ error: "Invoice Ninja not configured" }, { status: 400 });
    }

    const body = await req.json();
    const { paymentId, clientId, amount, date, transactionReference, invoices } = body;

    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      return NextResponse.json({ error: "At least one invoice allocation is required" }, { status: 400 });
    }

    // Validate each allocation
    for (const inv of invoices) {
      if (!inv.invoiceId || !inv.amount || inv.amount <= 0) {
        return NextResponse.json({ error: "Each invoice allocation requires invoiceId and a positive amount" }, { status: 400 });
      }
    }

    const totalAllocated = invoices.reduce((sum: number, inv: { amount: number }) => sum + inv.amount, 0);

    // Mode 1: Allocate an existing local payment
    if (paymentId) {
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      if (!payment) {
        return NextResponse.json({ error: "Payment not found" }, { status: 404 });
      }

      if (payment.status !== "COMPLETE") {
        return NextResponse.json({ error: "Only completed payments can be allocated" }, { status: 400 });
      }

      if (totalAllocated > Number(payment.amount)) {
        return NextResponse.json({ error: "Total allocation exceeds payment amount" }, { status: 400 });
      }

      // We need to find the Invoice Ninja client ID from the invoice
      const firstInvoice = await ninjaFetch(`invoices/${invoices[0].invoiceId}`);
      const ninjaClientId = firstInvoice.data?.client_id;
      if (!ninjaClientId) {
        return NextResponse.json({ error: "Could not determine client from invoice" }, { status: 400 });
      }

      // Create payment in Invoice Ninja
      const ninjaPayment = await createPayment({
        clientId: ninjaClientId,
        amount: totalAllocated,
        date: payment.createdAt.toISOString().split("T")[0],
        transactionReference: payment.gatewayRef || `GSS-${payment.id.slice(0, 8)}`,
        invoices: invoices.map((inv: { invoiceId: string; amount: number }) => ({
          invoiceId: inv.invoiceId,
          amount: inv.amount,
        })),
      });

      // Update local payment with invoice info
      const invoiceNumbers = invoices.map((inv: { invoiceId: string; invoiceNumber?: string }) => inv.invoiceNumber || inv.invoiceId).join(", ");
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          invoiceNumber: invoiceNumbers,
          metadata: JSON.stringify({
            ...(payment.metadata ? JSON.parse(payment.metadata as string) : {}),
            ninjaPaymentId: ninjaPayment.id,
            allocations: invoices,
          }),
        },
      });

      logAudit({
        action: "UPDATE",
        entity: "PAYMENT",
        entityId: paymentId,
        description: `Allocated payment R${totalAllocated} to invoices: ${invoiceNumbers}`,
        userId: session.user.id,
        userName: session.user.name || undefined,
        metadata: { ninjaPaymentId: ninjaPayment.id, invoices },
      });

      return NextResponse.json({
        success: true,
        ninjaPaymentId: ninjaPayment.id,
        message: `Payment allocated to ${invoices.length} invoice(s)`,
      });
    }

    // Mode 2: Direct allocation (no local payment)
    if (!clientId) {
      // Derive client ID from first invoice
      const firstInvoice = await ninjaFetch(`invoices/${invoices[0].invoiceId}`);
      const derivedClientId = firstInvoice.data?.client_id;
      if (!derivedClientId) {
        return NextResponse.json({ error: "Could not determine client from invoice" }, { status: 400 });
      }

      const ninjaPayment = await createPayment({
        clientId: derivedClientId,
        amount: amount || totalAllocated,
        date: date || new Date().toISOString().split("T")[0],
        transactionReference: transactionReference || "",
        invoices: invoices.map((inv: { invoiceId: string; amount: number }) => ({
          invoiceId: inv.invoiceId,
          amount: inv.amount,
        })),
      });

      logAudit({
        action: "CREATE",
        entity: "PAYMENT",
        entityId: ninjaPayment.id,
        description: `Created Invoice Ninja payment of R${amount || totalAllocated} for ${invoices.length} invoice(s)`,
        userId: session.user.id,
        userName: session.user.name || undefined,
        metadata: { ninjaPaymentId: ninjaPayment.id, invoices },
      });

      return NextResponse.json({
        success: true,
        ninjaPaymentId: ninjaPayment.id,
        message: `Payment of R${amount || totalAllocated} allocated to ${invoices.length} invoice(s)`,
      });
    }

    // Mode 2b: Direct with explicit clientId
    const ninjaPayment = await createPayment({
      clientId,
      amount: amount || totalAllocated,
      date: date || new Date().toISOString().split("T")[0],
      transactionReference: transactionReference || "",
      invoices: invoices.map((inv: { invoiceId: string; amount: number }) => ({
        invoiceId: inv.invoiceId,
        amount: inv.amount,
      })),
    });

    logAudit({
      action: "CREATE",
      entity: "PAYMENT",
      entityId: ninjaPayment.id,
      description: `Created Invoice Ninja payment of R${amount || totalAllocated} for client ${clientId}`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: { ninjaPaymentId: ninjaPayment.id, clientId, invoices },
    });

    return NextResponse.json({
      success: true,
      ninjaPaymentId: ninjaPayment.id,
      message: `Payment of R${amount || totalAllocated} allocated to ${invoices.length} invoice(s)`,
    });
  } catch (error) {
    console.error("Payment allocation error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
