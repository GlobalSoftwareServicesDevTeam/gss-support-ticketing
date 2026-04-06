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
    url: (config.PLESK_API_URL || PLESK_URL).replace(/\/+$/, ""),
    login: config.PLESK_API_LOGIN || PLESK_LOGIN,
    password: config.PLESK_API_PASSWORD || PLESK_PASSWORD,
  };
}

export async function isPleskConfiguredAsync(): Promise<boolean> {
  const creds = await getPleskCredentials();
  return !!(creds.url && creds.login && creds.password);
}

// ─── REST API v2 helper ──────────────────────────────

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

// ─── XML-RPC API helper (for service plans) ──────────

async function pleskXmlRpc(xmlBody: string): Promise<string> {
  const creds = await getPleskCredentials();
  if (!creds.url || !creds.login || !creds.password) {
    throw new Error("Plesk not configured");
  }

  const res = await fetch(`${creds.url}/enterprise/control/agent.php`, {
    method: "POST",
    headers: {
      HTTP_AUTH_LOGIN: creds.login,
      HTTP_AUTH_PASSWD: creds.password,
      "Content-Type": "text/xml",
    },
    body: xmlBody,
  });

  if (!res.ok) {
    throw new Error(`Plesk XML-RPC ${res.status}: ${await res.text()}`);
  }

  return res.text();
}

// ─── Clients (mapped from old "customers" endpoint) ──

export interface PleskCustomer {
  id: number;
  login: string;
  name: string;
  email: string;
}

export async function listServicePlans(): Promise<{ id: number; name: string }[]> {
  const xml = await pleskXmlRpc(
    "<packet><service-plan><get><filter/></get></service-plan></packet>"
  );
  const plans: { id: number; name: string }[] = [];
  // Parse <result><id>N</id><name>...</name></result> blocks
  const resultRegex = /<result>[\s\S]*?<status>ok<\/status>[\s\S]*?<id>(\d+)<\/id>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/result>/g;
  let match;
  while ((match = resultRegex.exec(xml)) !== null) {
    plans.push({ id: parseInt(match[1], 10), name: match[2] });
  }
  return plans;
}

export async function findCustomerByEmail(email: string): Promise<PleskCustomer | null> {
  try {
    const data = await pleskFetch("clients");
    const match = data.find(
      (c: { id: number; login: string; name: string; email: string }) =>
        c.email?.toLowerCase() === email.toLowerCase()
    );
    if (!match) return null;
    return {
      id: match.id,
      login: match.login,
      name: match.name || match.login,
      email: match.email,
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
    name: params.name,
    login: params.login,
    password: params.password,
    email: params.email,
    type: "customer",
    company: params.company || "",
  };

  const data = await pleskFetch("clients", {
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

// ─── Domains (mapped from old "subscriptions" endpoint) ─

export async function createSubscription(params: {
  customerId: number;
  domain: string;
  planName: string;
  login?: string;
  password?: string;
}): Promise<{ id: number; domain: string }> {
  const body: Record<string, unknown> = {
    name: params.domain,
    owner_client: { id: params.customerId },
    plan: { name: params.planName },
    hosting_type: "virtual",
    hosting_settings: {
      ftp_login: params.login || params.domain.replace(/\./g, "_").substring(0, 16),
      ftp_password: params.password || generatePassword(),
    },
  };

  const data = await pleskFetch("domains", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return { id: data.id, domain: params.domain };
}

export async function listSubscriptions(customerId?: number) {
  if (customerId) {
    return pleskFetch(`clients/${customerId}/domains`);
  }
  return pleskFetch("domains");
}

export async function getSubscription(subscriptionId: number) {
  return pleskFetch(`domains/${subscriptionId}`);
}

export async function suspendSubscription(subscriptionId: number) {
  return pleskFetch(`domains/${subscriptionId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status: "disabled" }),
  });
}

export async function activateSubscription(subscriptionId: number) {
  return pleskFetch(`domains/${subscriptionId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status: "active" }),
  });
}

export async function removeSubscription(subscriptionId: number) {
  return pleskFetch(`domains/${subscriptionId}`, {
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
  ttl?: number;
}

export async function getDnsRecords(domain: string): Promise<DnsRecord[]> {
  const data = await pleskFetch(`dns/records?domain=${encodeURIComponent(domain)}`);
  if (!Array.isArray(data)) return [];
  return data.map((r: { id: number; type: string; host: string; value: string; opt?: string; ttl?: number }) => ({
    id: r.id,
    type: r.type,
    host: r.host,
    value: r.value,
    opt: r.opt || undefined,
    ttl: r.ttl,
  }));
}

export async function addDnsRecord(domain: string, record: Omit<DnsRecord, "id">): Promise<DnsRecord> {
  const body: Record<string, unknown> = {
    type: record.type,
    host: record.host,
    value: record.value,
  };
  if (record.opt) body.opt = record.opt;

  const data = await pleskFetch(`dns/records?domain=${encodeURIComponent(domain)}`, {
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

  const data = await pleskFetch(`dns/records/${recordId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return data;
}

export async function deleteDnsRecord(recordId: number): Promise<void> {
  await pleskFetch(`dns/records/${recordId}`, {
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

// ─── Service Plan Details (via XML-RPC) ──────────────

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
    const plans = await listServicePlansFromXml();
    return plans.find((p) => p.id === planId) || null;
  } catch {
    return null;
  }
}

// Parse full plan data from XML-RPC response
async function listServicePlansFromXml(): Promise<PleskServicePlan[]> {
  const xml = await pleskXmlRpc(
    "<packet><service-plan><get><filter/></get></service-plan></packet>"
  );
  const plans: PleskServicePlan[] = [];
  const resultRegex = /<result>[\s\S]*?<status>ok<\/status>([\s\S]*?)<\/result>/g;
  let m;
  while ((m = resultRegex.exec(xml)) !== null) {
    const block = m[1];
    const id = parseInt(xmlVal(block, "id") || "0", 10);
    const name = xmlVal(block, "name") || "";
    const limits: Record<string, number> = {};
    const limitRegex = /<limit>\s*<name>([^<]+)<\/name>\s*<value>([^<]+)<\/value>\s*<\/limit>/g;
    let lm;
    while ((lm = limitRegex.exec(block)) !== null) {
      limits[lm[1]] = parseInt(lm[2], 10);
    }
    const hosting: { php?: boolean; ssl?: boolean; webstat?: string; cgi?: boolean } = {};
    const propRegex = /<property>\s*<name>([^<]+)<\/name>\s*<value>([^<]*)<\/value>\s*<\/property>/g;
    let pm;
    while ((pm = propRegex.exec(block)) !== null) {
      if (pm[1] === "php") hosting.php = pm[2] === "true";
      else if (pm[1] === "ssl") hosting.ssl = pm[2] === "true";
      else if (pm[1] === "cgi") hosting.cgi = pm[2] === "true";
      else if (pm[1] === "webstat") hosting.webstat = pm[2];
    }
    plans.push({ id, name, limits, hosting });
  }
  return plans;
}

function xmlVal(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block);
  return m ? m[1] : null;
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
  const plans = await listServicePlansFromXml();
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
    // Test REST API with server endpoint
    const server = await pleskFetch("server");
    // Also verify service plan listing via XML-RPC
    const plans = await listServicePlans();
    return {
      success: true,
      message: `Connected to ${server.hostname} (Plesk ${server.panel_version}). Found ${plans.length} service plan(s).`,
      planCount: plans.length,
    };
  } catch (err) {
    return { success: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
