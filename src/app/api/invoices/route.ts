import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Agent, fetch as undiciFetch } from "undici";

const INVOICE_NINJA_URL = (process.env.INVOICE_NINJA_URL || "").replace(/\/+$/, "");
const INVOICE_NINJA_TOKEN = process.env.INVOICE_NINJA_TOKEN || "";

// Invoice Ninja may be on a shared host with mismatched SSL cert
const ninjaAgent = new Agent({ connect: { rejectUnauthorized: false } });

async function ninjaFetch(endpoint: string) {
  if (!INVOICE_NINJA_URL || !INVOICE_NINJA_TOKEN) {
    return null;
  }

  const url = `${INVOICE_NINJA_URL}/api/v1/${endpoint}`;
  const res = await undiciFetch(url, {
    headers: {
      "X-Api-Token": INVOICE_NINJA_TOKEN,
      "Content-Type": "application/json",
    },
    dispatcher: ninjaAgent,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Invoice Ninja API ${res.status}: ${body}`);
  }

  return res.json() as Promise<{ data: unknown[] }>;
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

    // For non-admins, find and enforce their Invoice Ninja client ID
    let resolvedClientId = clientId;
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
        // Fallback: check the user's own invoiceNinjaClientId
        const userRecord = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { invoiceNinjaClientId: true },
        });
        ninjaClientId = userRecord?.invoiceNinjaClientId || null;
      }
      if (!ninjaClientId) {
        return NextResponse.json({ data: [], configured: true });
      }
      resolvedClientId = ninjaClientId;
    }

    let endpoint = type;
    if (resolvedClientId) {
      endpoint += `?client_id=${encodeURIComponent(resolvedClientId)}`;
    }

    const data = await ninjaFetch(endpoint);

    return NextResponse.json({ data: (data as { data?: unknown[] } | null)?.data || [], configured: true });
  } catch (error) {
    console.error("Invoice API error:", error);
    return NextResponse.json({ error: String(error), configured: true }, { status: 500 });
  }
}
