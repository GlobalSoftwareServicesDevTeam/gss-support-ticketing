import crypto from "crypto";
import { getPleskConfig } from "@/lib/settings";

const PLESK_URL = process.env.PLESK_API_URL || ""; // e.g. https://your-plesk:8443
const PLESK_LOGIN = process.env.PLESK_API_LOGIN || "";
const PLESK_PASSWORD = process.env.PLESK_API_PASSWORD || "";

export function isPleskConfigured(): boolean {
  return !!(PLESK_URL && PLESK_LOGIN && PLESK_PASSWORD);
}

async function getPleskCredentials() {
  const config = await getPleskConfig();
  return {
    url: config.PLESK_API_URL || PLESK_URL,
    login: config.PLESK_API_LOGIN || PLESK_LOGIN,
    password: config.PLESK_API_PASSWORD || PLESK_PASSWORD,
  };
}

export async function isPleskConfiguredAsync(): Promise<boolean> {
  const creds = await getPleskCredentials();
  return !!(creds.url && creds.login && creds.password);
}

async function pleskFetch(endpoint: string, options: RequestInit = {}) {
  const creds = await getPleskCredentials();
  if (!creds.url || !creds.login || !creds.password) {
    throw new Error("Plesk not configured");
  }

  const auth = Buffer.from(`${creds.login}:${creds.password}`).toString("base64");
  const url = `${creds.url}/api/v2/${endpoint}`;

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

// ─── DNS Zone Management ─────────────────────────────

export interface DnsRecord {
  id?: number;
  type: string; // A, AAAA, CNAME, MX, TXT, NS, SRV, CAA
  host: string;
  value: string;
  opt?: string; // priority for MX, weight/port for SRV
}

export async function getDnsRecords(domain: string): Promise<DnsRecord[]> {
  const data = await pleskFetch(`dns?domain=${encodeURIComponent(domain)}`);
  if (!Array.isArray(data)) return [];
  return data.map((r: { id: number; type: string; host: string; value: string; opt?: string }) => ({
    id: r.id,
    type: r.type,
    host: r.host,
    value: r.value,
    opt: r.opt || undefined,
  }));
}

export async function addDnsRecord(domain: string, record: Omit<DnsRecord, "id">): Promise<DnsRecord> {
  const body: Record<string, unknown> = {
    domain,
    type: record.type,
    host: record.host,
    value: record.value,
  };
  if (record.opt) body.opt = record.opt;

  const data = await pleskFetch("dns", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data;
}

export async function updateDnsRecord(recordId: number, record: Partial<DnsRecord>): Promise<DnsRecord> {
  const body: Record<string, unknown> = {};
  if (record.type) body.type = record.type;
  if (record.host !== undefined) body.host = record.host;
  if (record.value !== undefined) body.value = record.value;
  if (record.opt !== undefined) body.opt = record.opt;

  const data = await pleskFetch(`dns/${recordId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return data;
}

export async function deleteDnsRecord(recordId: number): Promise<void> {
  await pleskFetch(`dns/${recordId}`, {
    method: "DELETE",
  });
}

// ─── Domain / Site Info ──────────────────────────────

export async function getDomainInfo(domain: string) {
  try {
    const data = await pleskFetch(`domains?name=${encodeURIComponent(domain)}`);
    return Array.isArray(data) ? data[0] || null : data;
  } catch {
    return null;
  }
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

// ─── Detailed Service Plan Info ──────────────────────

export interface PleskServicePlan {
  id: number;
  name: string;
  limits?: {
    disk_space?: number; // bytes, -1 = unlimited
    max_traffic?: number; // bytes, -1 = unlimited
    max_db?: number;
    max_maillists?: number;
    max_box?: number; // email accounts
    mbox_quota?: number; // bytes per mailbox
    max_subdom?: number;
    max_webapps?: number;
    max_site?: number;
    max_wu?: number; // web users
    max_subftp_users?: number;
  };
  hosting?: {
    php?: boolean;
    ssl?: boolean;
    webstat?: string;
    cgi?: boolean;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === -1 || bytes === 0) return "Unlimited";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${Math.round(gb * 10) / 10} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

function formatLimit(val: number | undefined): string {
  if (val === undefined || val === -1) return "Unlimited";
  return String(val);
}

export async function getServicePlanDetails(planId: number): Promise<PleskServicePlan | null> {
  try {
    const data = await pleskFetch(`service-plans/${planId}`);
    return data;
  } catch {
    return null;
  }
}

export async function listServicePlansDetailed(): Promise<{
  id: number;
  name: string;
  diskSpace: string;
  bandwidth: string;
  databases: string;
  emailAccounts: string;
  emailStorage: string;
  ftpAccounts: string;
  subdomains: string;
  sslSupport: boolean;
  phpSupport: boolean;
}[]> {
  const plans = await pleskFetch("service-plans");
  const detailed = [];

  for (const plan of plans) {
    const limits = plan.limits || {};
    const hosting = plan.hosting || {};

    detailed.push({
      id: plan.id,
      name: plan.name,
      diskSpace: formatBytes(limits.disk_space ?? -1),
      bandwidth: formatBytes(limits.max_traffic ?? -1),
      databases: formatLimit(limits.max_db),
      emailAccounts: formatLimit(limits.max_box),
      emailStorage: limits.mbox_quota ? formatBytes(limits.mbox_quota) : "Default",
      ftpAccounts: formatLimit(limits.max_subftp_users),
      subdomains: formatLimit(limits.max_subdom),
      sslSupport: hosting.ssl !== false,
      phpSupport: hosting.php !== false,
    });
  }

  return detailed;
}

export async function testConnection(): Promise<{ success: boolean; message: string; planCount?: number }> {
  try {
    const configured = await isPleskConfiguredAsync();
    if (!configured) {
      return { success: false, message: "Plesk API credentials are not configured" };
    }
    const plans = await pleskFetch("service-plans");
    return { success: true, message: `Connected successfully. Found ${plans.length} service plan(s).`, planCount: plans.length };
  } catch (err) {
    return { success: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
