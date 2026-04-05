import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const INVOICE_NINJA_URL = (process.env.INVOICE_NINJA_URL || "").replace(/\/+$/, "");
const INVOICE_NINJA_TOKEN = process.env.INVOICE_NINJA_TOKEN || "";

async function ninjaFetch(endpoint: string) {
  if (!INVOICE_NINJA_URL || !INVOICE_NINJA_TOKEN) {
    return null;
  }

  const url = `${INVOICE_NINJA_URL}/api/v1/${endpoint}`;
  const res = await fetch(url, {
    headers: {
      "X-Api-Token": INVOICE_NINJA_TOKEN,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Invoice Ninja API ${res.status}: ${body}`);
  }

  return res.json();
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!INVOICE_NINJA_URL || !INVOICE_NINJA_TOKEN) {
      return NextResponse.json({ error: "Invoice Ninja not configured", configured: false }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "invoices";
    const clientId = searchParams.get("client_id");

    const allowedTypes = ["invoices", "quotes", "credits", "payments", "recurring_invoices"];
    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    let endpoint = type;
    if (clientId) {
      endpoint += `?client_id=${encodeURIComponent(clientId)}`;
    }

    const data = await ninjaFetch(endpoint);

    return NextResponse.json({ data: data?.data || [], configured: true });
  } catch (error) {
    console.error("Invoice API error:", error);
    return NextResponse.json({ error: String(error), configured: true }, { status: 500 });
  }
}
