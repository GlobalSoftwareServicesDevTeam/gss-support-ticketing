import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isInvoiceNinjaConfigured, convertQuoteToInvoice } from "@/lib/invoice-ninja";
import { logAudit } from "@/lib/audit";

// POST /api/quotes/ninja/convert – convert an Invoice Ninja quote to invoice
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isInvoiceNinjaConfigured()) {
    return NextResponse.json(
      { error: "Invoice Ninja not configured" },
      { status: 400 }
    );
  }

  try {
    const { quoteId } = await req.json();
    if (!quoteId) {
      return NextResponse.json(
        { error: "quoteId is required" },
        { status: 400 }
      );
    }

    const result = await convertQuoteToInvoice(quoteId);

    logAudit({
      action: "CONVERT",
      entity: "QUOTE",
      entityId: quoteId,
      description: `Converted Invoice Ninja quote to invoice ${result.number || result.id}`,
      userId: session.user.id,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ success: true, invoice: result });
  } catch (error) {
    console.error("Convert quote error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
