import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

import { getSettings } from "@/lib/settings";

async function getNinjaConfig() {
  const s = await getSettings(["INVOICE_NINJA_URL", "INVOICE_NINJA_TOKEN"]);
  return {
    url: (s.INVOICE_NINJA_URL || process.env.INVOICE_NINJA_URL || "").replace(/\/+$/, ""),
    token: s.INVOICE_NINJA_TOKEN || process.env.INVOICE_NINJA_TOKEN || "",
  };
}

async function ninjaFetch(endpoint: string) {
  const { url: INVOICE_NINJA_URL, token: INVOICE_NINJA_TOKEN } = await getNinjaConfig();
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

  return res.json() as Promise<{ data: unknown[] }>;
}

function isInvoiceNinjaAuthError(error: unknown): boolean {
  const message = String(error || "").toLowerCase();
  return message.includes("invoice ninja api 401") ||
    message.includes("invoice ninja api 403") ||
    message.includes("invalid token") ||
    message.includes("unauthorized");
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url: INVOICE_NINJA_URL, token: INVOICE_NINJA_TOKEN } = await getNinjaConfig();
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
    if (isInvoiceNinjaAuthError(error)) {
      return NextResponse.json(
        {
          data: [],
          configured: true,
          integrationError: "Invoice Ninja authentication failed. Please update the API token.",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: "Failed to fetch Invoice Ninja data", configured: true }, { status: 502 });
  }
}
