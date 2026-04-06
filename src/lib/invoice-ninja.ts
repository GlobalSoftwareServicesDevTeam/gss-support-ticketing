const INVOICE_NINJA_URL = (process.env.INVOICE_NINJA_URL || "").replace(/\/+$/, "");
const INVOICE_NINJA_TOKEN = process.env.INVOICE_NINJA_TOKEN || "";

export function isInvoiceNinjaConfigured(): boolean {
  return !!(INVOICE_NINJA_URL && INVOICE_NINJA_TOKEN);
}

async function ninjaFetch(endpoint: string, options: RequestInit = {}) {
  if (!isInvoiceNinjaConfigured()) throw new Error("Invoice Ninja not configured");

  const url = `${INVOICE_NINJA_URL}/api/v1/${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-Api-Token": INVOICE_NINJA_TOKEN,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Invoice Ninja API ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Clients ──────────────────────────────────────────

export interface INClient {
  id: string;
  name: string;
  display_name: string;
  contacts: { email: string; first_name: string; last_name: string }[];
}

export async function listClients(): Promise<INClient[]> {
  const data = await ninjaFetch("clients?per_page=500&is_deleted=false");
  return data.data || [];
}

export async function findClientByEmail(email: string): Promise<INClient | null> {
  const data = await ninjaFetch(`clients?email=${encodeURIComponent(email)}&per_page=5`);
  return data.data?.[0] || null;
}

export async function createClient(params: {
  name: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  company?: string;
  address?: string;
  vatNumber?: string;
}): Promise<INClient> {
  const body = {
    name: params.company || `${params.firstName} ${params.lastName}`,
    contacts: [
      {
        first_name: params.firstName,
        last_name: params.lastName,
        email: params.email,
        phone: params.phone || "",
      },
    ],
    vat_number: params.vatNumber || "",
    address1: params.address || "",
  };

  const data = await ninjaFetch("clients", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return data.data;
}

export async function getClient(clientId: string): Promise<INClient> {
  const data = await ninjaFetch(`clients/${clientId}`);
  return data.data;
}

// ─── Recurring Invoices ──────────────────────────────

export async function createRecurringInvoice(params: {
  clientId: string;
  amount: number;
  description: string;
  frequencyId?: number; // 5 = monthly
}): Promise<{ id: string }> {
  const body = {
    client_id: params.clientId,
    frequency_id: params.frequencyId || 5, // monthly
    auto_bill: "always",
    auto_bill_enabled: true,
    due_date_days: "1", // 1st of each month
    line_items: [
      {
        product_key: "Hosting",
        notes: params.description,
        cost: params.amount,
        quantity: 1,
      },
    ],
  };

  const data = await ninjaFetch("recurring_invoices", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return data.data;
}

export async function startRecurringInvoice(recurringInvoiceId: string) {
  // Start the recurring invoice (set to active)
  const data = await ninjaFetch(
    `recurring_invoices/${recurringInvoiceId}?start=true`,
    { method: "PUT", body: JSON.stringify({ status_id: "2" }) }
  );
  return data.data;
}

// ─── Invoices (proforma) ─────────────────────────────

export async function createProformaInvoice(params: {
  clientId: string;
  amount: number;
  description: string;
  dueDate?: string; // YYYY-MM-DD
}): Promise<{ id: string; number: string }> {
  const body = {
    client_id: params.clientId,
    due_date: params.dueDate || new Date().toISOString().split("T")[0],
    line_items: [
      {
        product_key: "Hosting",
        notes: params.description,
        cost: params.amount,
        quantity: 1,
      },
    ],
  };

  const data = await ninjaFetch("invoices", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return { id: data.data.id, number: data.data.number };
}

// ─── Invoice Actions ─────────────────────────────────

export async function getInvoice(invoiceId: string) {
  const data = await ninjaFetch(`invoices/${invoiceId}`);
  return data.data;
}

export async function cancelInvoice(invoiceId: string) {
  const data = await ninjaFetch(`invoices/${invoiceId}?action=cancel`, {
    method: "PUT",
    body: JSON.stringify({}),
  });
  return data.data;
}

export async function deleteInvoice(invoiceId: string) {
  const data = await ninjaFetch(`invoices/${invoiceId}`, {
    method: "DELETE",
  });
  return data.data;
}

// ─── Credit Notes ────────────────────────────────────

export async function createCredit(params: {
  clientId: string;
  amount: number;
  description: string;
}): Promise<{ id: string; number: string }> {
  const body = {
    client_id: params.clientId,
    line_items: [
      {
        product_key: "Credit",
        notes: params.description,
        cost: params.amount,
        quantity: 1,
      },
    ],
  };

  const data = await ninjaFetch("credits", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return { id: data.data.id, number: data.data.number };
}

// ─── Recurring Invoice Actions ───────────────────────

export async function stopRecurringInvoice(recurringInvoiceId: string) {
  const data = await ninjaFetch(
    `recurring_invoices/${recurringInvoiceId}?stop=true`,
    { method: "PUT", body: JSON.stringify({}) }
  );
  return data.data;
}

export async function getRecurringInvoice(recurringInvoiceId: string) {
  const data = await ninjaFetch(`recurring_invoices/${recurringInvoiceId}`);
  return data.data;
}

// ─── Quotes ──────────────────────────────────────────

export interface INQuote {
  id: string;
  number: string;
  date: string;
  due_date?: string;
  valid_until?: string;
  amount: number;
  balance: number;
  status_id: string;
  client_id: string;
  client?: { id: string; name: string; display_name?: string };
  line_items: Array<{
    product_key?: string;
    notes?: string;
    cost: number;
    quantity: number;
    line_total: number;
  }>;
  terms?: string;
  public_notes?: string;
  private_notes?: string;
  tax_name1?: string;
  tax_rate1?: number;
  discount?: number;
  partial?: number;
  is_deleted?: boolean;
  created_at?: number;
  updated_at?: number;
}

export async function listQuotes(params?: {
  clientId?: string;
  status?: string;
  perPage?: number;
}): Promise<INQuote[]> {
  const parts = [`per_page=${params?.perPage || 500}`, "is_deleted=false"];
  if (params?.clientId) parts.push(`client_id=${encodeURIComponent(params.clientId)}`);
  if (params?.status) parts.push(`status=${encodeURIComponent(params.status)}`);
  const data = await ninjaFetch(`quotes?${parts.join("&")}`);
  return data.data || [];
}

export async function getQuote(quoteId: string): Promise<INQuote> {
  const data = await ninjaFetch(`quotes/${quoteId}`);
  return data.data;
}

export async function convertQuoteToInvoice(quoteId: string): Promise<{ id: string; number: string }> {
  // Invoice Ninja: PUT with action=convert_to_invoice
  const data = await ninjaFetch(`quotes/${quoteId}?action=convert_to_invoice`, {
    method: "PUT",
    body: JSON.stringify({}),
  });
  // The response contains the invoice id
  return { id: data.data?.id || "", number: data.data?.number || "" };
}

export async function approveQuote(quoteId: string) {
  const data = await ninjaFetch(`quotes/${quoteId}?action=approve`, {
    method: "PUT",
    body: JSON.stringify({}),
  });
  return data.data;
}

export async function sendQuote(quoteId: string) {
  const data = await ninjaFetch(`quotes/${quoteId}?action=send_email`, {
    method: "PUT",
    body: JSON.stringify({}),
  });
  return data.data;
}
