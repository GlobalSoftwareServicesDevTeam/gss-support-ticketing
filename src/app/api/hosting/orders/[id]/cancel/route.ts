import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  isInvoiceNinjaConfigured,
  cancelInvoice,
  stopRecurringInvoice,
} from "@/lib/invoice-ninja";
import {
  isPleskConfigured,
  suspendSubscription,
  removeSubscription,
} from "@/lib/plesk";

// POST: cancel invoice + stop recurring + optionally suspend hosting (admin only)
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
    const { suspendHosting, removeHosting } = body;

    const order = await prisma.hostingOrder.findUnique({
      where: { id },
      include: { user: true, product: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const results: Record<string, unknown> = {};

    // Cancel Invoice Ninja invoice
    if (isInvoiceNinjaConfigured()) {
      if (order.invoiceNinjaInvoiceId) {
        try {
          await cancelInvoice(order.invoiceNinjaInvoiceId);
          results.invoiceCancelled = true;
        } catch (err) {
          results.invoiceCancelError = String(err);
        }
      }

      // Stop recurring invoice
      if (order.recurringInvoiceId) {
        try {
          await stopRecurringInvoice(order.recurringInvoiceId);
          results.recurringInvoiceStopped = true;
        } catch (err) {
          results.recurringStopError = String(err);
        }
      }
    }

    // Suspend or remove Plesk subscription
    if (isPleskConfigured() && order.pleskSubscriptionId) {
      const subId = parseInt(order.pleskSubscriptionId, 10);
      if (!isNaN(subId)) {
        try {
          if (removeHosting) {
            await removeSubscription(subId);
            results.pleskSubscriptionRemoved = true;
          } else if (suspendHosting !== false) {
            await suspendSubscription(subId);
            results.pleskSubscriptionSuspended = true;
          }
        } catch (err) {
          results.pleskError = String(err);
        }
      }
    }

    // Update order status
    await prisma.hostingOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    results.orderCancelled = true;

    logAudit({
      action: "CANCEL",
      entity: "HOSTING_ORDER",
      entityId: id,
      description: `Cancelled order #${id.slice(0, 8)}${order.domain ? ` (${order.domain})` : ""} with invoice cancellation`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: { suspendHosting, removeHosting, ...results },
    });

    return NextResponse.json({
      message: "Order cancelled and invoice cancelled",
      ...results,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
