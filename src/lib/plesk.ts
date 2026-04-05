import crypto from "crypto";

const PLESK_URL = process.env.PLESK_API_URL || ""; // e.g. https://your-plesk:8443
const PLESK_LOGIN = process.env.PLESK_API_LOGIN || "";
const PLESK_PASSWORD = process.env.PLESK_API_PASSWORD || "";

export function isPleskConfigured(): boolean {
  return !!(PLESK_URL && PLESK_LOGIN && PLESK_PASSWORD);
}

async function pleskFetch(endpoint: string, options: RequestInit = {}) {
  if (!isPleskConfigured()) throw new Error("Plesk not configured");

  const auth = Buffer.from(`${PLESK_LOGIN}:${PLESK_PASSWORD}`).toString("base64");
  const url = `${PLESK_URL}/api/v2/${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Plesk API ${res.status}: ${text}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export interface PleskCustomer {
  id: number;
  login: string;
  name: string;
  email: string;
}

export async function listServicePlans(): Promise<{ id: number; name: string }[]> {
  const data = await pleskFetch("service-plans");
  return data.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name }));
}

export async function findCustomerByEmail(email: string): Promise<PleskCustomer | null> {
  try {
    const data = await pleskFetch("customers");
    const match = data.find(
      (c: { contact: { email: string } }) =>
        c.contact?.email?.toLowerCase() === email.toLowerCase()
    );
    if (!match) return null;
    return {
      id: match.id,
      login: match.login,
      name: match.contact?.name || match.login,
      email: match.contact?.email,
    };
  } catch {
    return null;
  }
}

export async function createCustomer(params: {
  name: string;
  login: string;
  password: string;
  email: string;
  company?: string;
}): Promise<PleskCustomer> {
  const body = {
    login: params.login,
    password: params.password,
    contact: {
      name: params.name,
      email: params.email,
      company: params.company || "",
    },
  };

  const data = await pleskFetch("customers", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    id: data.id,
    login: data.login || params.login,
    name: params.name,
    email: params.email,
  };
}

export async function createSubscription(params: {
  customerId: number;
  domain: string;
  planName: string;
  login?: string;
  password?: string;
}): Promise<{ id: number; domain: string }> {
  const body: Record<string, unknown> = {
    name: params.domain,
    owner: { id: params.customerId },
    plan: { name: params.planName },
    hosting_type: "virtual",
    hosting: {
      ftp_login: params.login || params.domain.replace(/\./g, "_").substring(0, 16),
      ftp_password: params.password || generatePassword(),
    },
  };

  const data = await pleskFetch("subscriptions", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return { id: data.id, domain: params.domain };
}

export async function listSubscriptions(customerId?: number) {
  const endpoint = customerId ? `subscriptions?customer_id=${customerId}` : "subscriptions";
  return pleskFetch(endpoint);
}

export async function getSubscription(subscriptionId: number) {
  return pleskFetch(`subscriptions/${subscriptionId}`);
}

export async function suspendSubscription(subscriptionId: number) {
  return pleskFetch(`subscriptions/${subscriptionId}/suspend`, {
    method: "PUT",
  });
}

export async function activateSubscription(subscriptionId: number) {
  return pleskFetch(`subscriptions/${subscriptionId}/activate`, {
    method: "PUT",
  });
}

export async function removeSubscription(subscriptionId: number) {
  return pleskFetch(`subscriptions/${subscriptionId}`, {
    method: "DELETE",
  });
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let pass = "";
  const array = new Uint8Array(12);
  crypto.randomFillSync(array);
  for (const byte of array) {
    pass += chars[byte % chars.length];
  }
  return pass;
}
