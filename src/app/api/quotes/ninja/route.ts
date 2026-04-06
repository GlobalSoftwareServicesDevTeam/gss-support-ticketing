import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isInvoiceNinjaConfigured, listQuotes } from "@/lib/invoice-ninja";

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
    const clientId = searchParams.get("client_id") || undefined;
    const status = searchParams.get("status") || undefined;

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
