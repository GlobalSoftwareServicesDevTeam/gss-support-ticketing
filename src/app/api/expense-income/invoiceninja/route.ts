import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addIncome, clearInvoiceNinjaIncome } from "@/lib/expense-tracker";

type NinjaInvoice = {
  id: string;
  number: string;
  balance: number | string;
  status_id: number;
  client?: { display_name?: string; name?: string };
};

type NinjaQuote = {
  id: string;
  number: string;
  amount: number | string;
  due_date?: string;
  status_id: number;
  client?: { display_name?: string; name?: string };
};

type NinjaRecurring = {
  id: string;
  amount: number | string;
  next_send_date?: string;
  status_id: number;
  frequency_id?: number;
  client?: { display_name?: string; name?: string };
};

async function ensureAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function isConfigured(): boolean {
  const baseUrl = (process.env.INVOICE_NINJA_URL || process.env.INVOICENINJA_URL || "").trim();
  const token = (process.env.INVOICE_NINJA_TOKEN || process.env.INVOICENINJA_API_TOKEN || "").trim();
  return Boolean(baseUrl && token);
}

function config() {
  const baseUrl = (process.env.INVOICE_NINJA_URL || process.env.INVOICENINJA_URL || "").replace(/\/+$/, "");
  const token = process.env.INVOICE_NINJA_TOKEN || process.env.INVOICENINJA_API_TOKEN || "";
  return { baseUrl, token };
}

async function ninjaFetch<T>(endpoint: string): Promise<T[]> {
  const { baseUrl, token } = config();
  const url = `${baseUrl}/api/v1/${endpoint}`;
  const res = await fetch(url, {
    headers: {
      "X-Api-Token": token,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Invoice Ninja API ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { data?: T[] };
  return data.data || [];
}

export async function GET(req: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;

  const action = req.nextUrl.searchParams.get("action");
  if (action === "status") {
    return NextResponse.json({ configured: isConfigured() });
  }

  const monthId = Number(req.nextUrl.searchParams.get("monthId"));
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));

  if (!monthId || !year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "monthId, year and month required" }, { status: 400 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ error: "Invoice Ninja is not configured" }, { status: 400 });
  }

  try {
    await clearInvoiceNinjaIncome(monthId);
    const syncedItems: Array<{ source: string; amount: number; type: string; invoiceNinjaId: string }> = [];

    const invoices = await ninjaFetch<NinjaInvoice>("invoices?status=active&per_page=1000&include=client");
    for (const inv of invoices) {
      const balance = Number(inv.balance || 0);
      if (inv.status_id < 2 || inv.status_id > 3 || balance <= 0) continue;
      const clientName = inv.client?.display_name || inv.client?.name || "Unknown Client";
      syncedItems.push({
        source: `Invoice #${inv.number} - ${clientName}`,
        amount: balance,
        type: "invoice",
        invoiceNinjaId: String(inv.id),
      });
    }

    const now = new Date().toISOString().slice(0, 10);
    const quotes = await ninjaFetch<NinjaQuote>("quotes?status=active&per_page=1000&include=client");
    for (const quote of quotes) {
      if (quote.due_date && quote.due_date < now) continue;
      if (quote.status_id < 2 || quote.status_id > 3) continue;
      const clientName = quote.client?.display_name || quote.client?.name || "Unknown Client";
      syncedItems.push({
        source: `Quote #${quote.number} - ${clientName}`,
        amount: Number(quote.amount || 0),
        type: "quote",
        invoiceNinjaId: String(quote.id),
      });
    }

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const recurring = await ninjaFetch<NinjaRecurring>("recurring_invoices?status=active&per_page=1000&include=client");
    for (const ri of recurring) {
      if (ri.status_id < 2) continue;
      if (ri.next_send_date) {
        const nextSend = new Date(ri.next_send_date);
        if (nextSend < monthStart || nextSend > monthEnd) continue;
      }

      const clientName = ri.client?.display_name || ri.client?.name || "Unknown Client";
      syncedItems.push({
        source: `Recurring - ${clientName}${ri.frequency_id ? ` (freq:${ri.frequency_id})` : ""}`,
        amount: Number(ri.amount || 0),
        type: "recurring_invoice",
        invoiceNinjaId: String(ri.id),
      });
    }

    for (const item of syncedItems) {
      await addIncome(monthId, item.source, item.amount, 0, item.type, item.invoiceNinjaId);
    }

    return NextResponse.json({ synced: syncedItems.length, items: syncedItems });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
