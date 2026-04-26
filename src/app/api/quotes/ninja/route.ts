import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isInvoiceNinjaConfigured, listQuotes } from "@/lib/invoice-ninja";
import prisma from "@/lib/prisma";

// GET /api/quotes/ninja – list quotes from Invoice Ninja
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isInvoiceNinjaConfigured()) {
    return NextResponse.json({ data: [], configured: false });
  }

  try {
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status") || undefined;

    // For non-admins, resolve and enforce their Invoice Ninja client ID
    let clientId: string | undefined;
    if (session.user.role !== "ADMIN") {
      let ninjaClientId: string | null = null;
      const customerId = (session.user as { customerId?: string }).customerId;
      if (customerId) {
        const customer = await prisma.customer.findUnique({
          where: { id: customerId },
          select: { invoiceNinjaClientId: true },
        });
        ninjaClientId = customer?.invoiceNinjaClientId || null;
      }
      if (!ninjaClientId) {
        const userRecord = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { invoiceNinjaClientId: true },
        });
        ninjaClientId = userRecord?.invoiceNinjaClientId || null;
      }
      if (!ninjaClientId) {
        return NextResponse.json({ data: [], configured: true });
      }
      clientId = ninjaClientId;
    } else {
      clientId = searchParams.get("client_id") || undefined;
    }

    const quotes = await listQuotes({ clientId, status });
    return NextResponse.json({ data: quotes, configured: true });
  } catch (error) {
    console.error("Invoice Ninja quotes error:", error);
    return NextResponse.json(
      { error: String(error), configured: true },
      { status: 500 }
    );
  }
}
