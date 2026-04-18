import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const INVOICE_NINJA_URL = (process.env.INVOICE_NINJA_URL || "").replace(/\/+$/, "");
const INVOICE_NINJA_TOKEN = process.env.INVOICE_NINJA_TOKEN || "";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!INVOICE_NINJA_URL || !INVOICE_NINJA_TOKEN) {
      return NextResponse.json({ error: "Invoice Ninja not configured" }, { status: 400 });
    }

    const { id } = await params;

    const res = await fetch(`${INVOICE_NINJA_URL}/api/v1/invoices/${id}`, {
      headers: {
        "X-Api-Token": INVOICE_NINJA_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Invoice Ninja error: ${res.status}` }, { status: res.status });
    }

    const data = await res.json() as { data: unknown };
    return NextResponse.json(data.data);
  } catch (error) {
    console.error("Invoice [id] API error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
