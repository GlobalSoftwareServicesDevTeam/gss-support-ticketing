import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  isInvoiceNinjaConfigured,
  convertQuoteToInvoice,
  approveQuote,
  sendQuote,
  createQuote,
  createInvoice,
  createCredit,
  sendInvoice,
  cancelInvoice,
  listClients,
} from "@/lib/invoice-ninja";

/**
 * POST /api/invoices/actions
 * Admin-only actions on Invoice Ninja documents.
 *
 * Body: { action: string, ...params }
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
    const { action } = body;

    switch (action) {
      case "convert_quote": {
        const { quoteId } = body;
        if (!quoteId) return NextResponse.json({ error: "quoteId is required" }, { status: 400 });

        const result = await convertQuoteToInvoice(quoteId);
        logAudit({
          action: "CREATE",
          entity: "INVOICE",
          entityId: result.id,
          description: `Converted quote to invoice ${result.number || result.id}`,
          userId: session.user.id,
          userName: session.user.name || undefined,
          metadata: { quoteId, invoiceId: result.id, invoiceNumber: result.number },
        });
        return NextResponse.json({ success: true, invoice: result });
      }

      case "approve_quote": {
        const { quoteId } = body;
        if (!quoteId) return NextResponse.json({ error: "quoteId is required" }, { status: 400 });

        const result = await approveQuote(quoteId);
        logAudit({
          action: "UPDATE",
          entity: "QUOTE",
          entityId: quoteId,
          description: `Approved quote ${quoteId}`,
          userId: session.user.id,
          userName: session.user.name || undefined,
        });
        return NextResponse.json({ success: true, quote: result });
      }

      case "send_quote": {
        const { quoteId } = body;
        if (!quoteId) return NextResponse.json({ error: "quoteId is required" }, { status: 400 });

        await sendQuote(quoteId);
        logAudit({
          action: "UPDATE",
          entity: "QUOTE",
          entityId: quoteId,
          description: `Sent quote ${quoteId} via email`,
          userId: session.user.id,
          userName: session.user.name || undefined,
        });
        return NextResponse.json({ success: true });
      }

      case "create_quote": {
        const { clientId, lineItems, dueDate, validUntil, discount, publicNotes, privateNotes, terms, taxName1, taxRate1 } = body;
        if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
        if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
          return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
        }

        const quote = await createQuote({ clientId, lineItems, dueDate, validUntil, discount, publicNotes, privateNotes, terms, taxName1, taxRate1 });
        logAudit({
          action: "CREATE",
          entity: "QUOTE",
          entityId: quote.id,
          description: `Created quote ${quote.number} for client ${clientId}`,
          userId: session.user.id,
          userName: session.user.name || undefined,
          metadata: { quoteId: quote.id, quoteNumber: quote.number, clientId },
        });
        return NextResponse.json({ success: true, quote });
      }

      case "create_invoice": {
        const { clientId, lineItems, dueDate, discount, publicNotes, privateNotes, terms, taxName1, taxRate1 } = body;
        if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
        if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
          return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
        }

        const invoice = await createInvoice({ clientId, lineItems, dueDate, discount, publicNotes, privateNotes, terms, taxName1, taxRate1 });
        logAudit({
          action: "CREATE",
          entity: "INVOICE",
          entityId: invoice.id,
          description: `Created invoice ${invoice.number} for client ${clientId}`,
          userId: session.user.id,
          userName: session.user.name || undefined,
          metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number, clientId },
        });
        return NextResponse.json({ success: true, invoice });
      }

      case "send_invoice": {
        const { invoiceId } = body;
        if (!invoiceId) return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });

        await sendInvoice(invoiceId);
        logAudit({
          action: "UPDATE",
          entity: "INVOICE",
          entityId: invoiceId,
          description: `Sent invoice ${invoiceId} via email`,
          userId: session.user.id,
          userName: session.user.name || undefined,
        });
        return NextResponse.json({ success: true });
      }

      case "cancel_invoice": {
        const { invoiceId } = body;
        if (!invoiceId) return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });

        await cancelInvoice(invoiceId);
        logAudit({
          action: "UPDATE",
          entity: "INVOICE",
          entityId: invoiceId,
          description: `Cancelled invoice ${invoiceId}`,
          userId: session.user.id,
          userName: session.user.name || undefined,
        });
        return NextResponse.json({ success: true });
      }

      case "create_credit": {
        const { clientId, lineItems, publicNotes } = body;
        if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });
        if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
          return NextResponse.json({ error: "At least one line item is required" }, { status: 400 });
        }

        const totalAmount = lineItems.reduce((s: number, li: { cost: number; quantity: number }) => s + li.cost * li.quantity, 0);
        const credit = await createCredit({ clientId, amount: totalAmount, description: publicNotes || lineItems.map((li: { productKey: string }) => li.productKey).join(", ") });
        logAudit({
          action: "CREATE",
          entity: "CREDIT",
          entityId: credit.id,
          description: `Created credit note ${credit.number} for R${totalAmount}`,
          userId: session.user.id,
          userName: session.user.name || undefined,
          metadata: { creditId: credit.id, creditNumber: credit.number, clientId, amount: totalAmount },
        });
        return NextResponse.json({ success: true, credit });
      }

      case "list_clients": {
        const clients = await listClients();
        return NextResponse.json({ clients });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("Invoice action error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
