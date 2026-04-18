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

// ─── One-Time Login URL for a customer ───────────────

export async function createSessionUrl(pleskCustomerLogin: string, clientIp?: string): Promise<string> {
  const creds = await getPleskCredentials();
  // Use XML-RPC to create a one-time login session for a customer
  // Pass client IP so the session is valid from the user's browser, not just the server
  const ipTag = clientIp ? `<user_ip>${clientIp}</user_ip>` : "";
  const xml = await pleskXmlRpc(
    `<packet>
      <server>
        <create_session>
          <login>${pleskCustomerLogin}</login>
          <data>
            ${ipTag}
            <starting_url>/</starting_url>
            <source_server></source_server>
          </data>
        </create_session>
      </server>
    </packet>`
  );

  // Check for Plesk error response
  const errorMatch = /<status>error<\/status>[\s\S]*?<errtext>([^<]+)<\/errtext>/.exec(xml);
  if (errorMatch) {
    throw new Error(`Plesk error: ${errorMatch[1]}`);
  }

  // Parse session ID from response
  const sessionIdMatch = /<id>([^<]+)<\/id>/.exec(xml);
  if (!sessionIdMatch) {
    throw new Error("Failed to create Plesk session — unexpected response");
  }

  return `${creds.url}/enterprise/rsession_init.php?PHPSESSID=${sessionIdMatch[1]}`;
}

// ─── Mail Account Management (via XML-RPC) ──────────

export interface PleskMailAccount {
  name: string; // local part (before @)
  domain: string;
  email: string; // full address
  mailbox: boolean;
  enabled: boolean;
  aliases: string[];
  autoresponder: boolean;
  mailboxQuota: number; // bytes, 0 = unlimited
  mailboxUsage: number; // bytes
}

/**
 * List mail accounts on a domain.
 */
export async function listMailAccounts(domain: string): Promise<PleskMailAccount[]> {
  const siteId = await getDomainPleskId(domain);

  const fullXml = await pleskXmlRpc(
    `<packet>
      <mail>
        <get_info>
          <filter>
            <site-id>${siteId}</site-id>
          </filter>
          <mailbox/>
          <aliases/>
          <autoresponder/>
          <mailbox-usage/>
        </get_info>
      </mail>
    </packet>`
  );

  const fullParsed = parseMailAccountsXml(fullXml, domain);
  if (fullParsed.accounts.length > 0) {
    return fullParsed.accounts;
  }

  if (fullParsed.errors.length === 0) {
    const compactXml = fullXml.replace(/\s+/g, " ").trim();
    console.warn(
      `[plesk.mail] Empty account list for domain ${domain} (site-id=${siteId}) from full get_info response. Sample: ${compactXml.slice(0, 600)}`
    );
  }

  // Some Plesk versions reject one of the extra datasets; retry with minimal get_info.
  if (fullParsed.errors.length > 0) {
    const fallbackXml = await pleskXmlRpc(
      `<packet>
        <mail>
          <get_info>
            <filter>
              <site-id>${siteId}</site-id>
            </filter>
          </get_info>
        </mail>
      </packet>`
    );

    const fallbackParsed = parseMailAccountsXml(fallbackXml, domain);
    if (fallbackParsed.accounts.length > 0) {
      return fallbackParsed.accounts;
    }
    if (fallbackParsed.errors.length > 0) {
      throw new Error(fallbackParsed.errors[0]);
    }

    const compactFallbackXml = fallbackXml.replace(/\s+/g, " ").trim();
    console.warn(
      `[plesk.mail] Empty account list for domain ${domain} (site-id=${siteId}) from fallback get_info response. Sample: ${compactFallbackXml.slice(0, 600)}`
    );
    return [];
  }

  return [];
}

function parseMailAccountsXml(
  xml: string,
  domain: string
): { accounts: PleskMailAccount[]; errors: string[] } {
  const accounts: PleskMailAccount[] = [];
  const errors: string[] = [];
  const resultBlocks = xml.match(/<result>[\s\S]*?<\/result>/g) || [];

  for (const block of resultBlocks) {
    const statusMatch = /<status>([^<]+)<\/status>/.exec(block);
    const status = statusMatch?.[1]?.toLowerCase() || "";
    if (status && status !== "ok") {
      const errText = xmlVal(block, "errtext") || "Unknown mail API error";
      errors.push(errText);
      continue;
    }

    // Most responses wrap account rows in <mailname>...</mailname>.
    // Some variants put account fields directly under <result>.
    const nameBlocks = block.match(/<mailname[\s\S]*?>[\s\S]*?<\/mailname>/g) || [block];

    for (const nameBlock of nameBlocks) {
      const rawName = xmlVal(nameBlock, "name") || xmlVal(nameBlock, "mailname");
      const name = rawName && !rawName.includes("@") ? rawName : rawName?.split("@")[0];
      if (!name) continue;

      const mailbox = /<mailbox>/.test(nameBlock) || /<mailbox>true<\/mailbox>/.test(nameBlock);
      const enabled = !/<enabled>false<\/enabled>/.test(nameBlock) && !/<status>disabled<\/status>/.test(nameBlock);
      const autoresponder = /<autoresponder>[\s\S]*?<status>on<\/status>[\s\S]*?<\/autoresponder>/.test(nameBlock);

      const aliases: string[] = [];
      const aliasMatches = nameBlock.match(/<alias>([^<]+)<\/alias>/g) || [];
      for (const am of aliasMatches) {
        const v = am.replace(/<\/?alias>/g, "");
        if (v) aliases.push(v);
      }

      let mailboxQuota = 0;
      let mailboxUsage = 0;

      const quotaMatch = /<mbox_quota>(\d+)<\/mbox_quota>/.exec(nameBlock);
      if (quotaMatch) mailboxQuota = parseInt(quotaMatch[1], 10);

      const usageMatch = /<mailbox-usage>(\d+)<\/mailbox-usage>/.exec(nameBlock);
      if (usageMatch) {
        mailboxUsage = parseInt(usageMatch[1], 10);
      } else {
        const usageBlockMatch = /<mailbox-usage>[\s\S]*?<\/mailbox-usage>/.exec(nameBlock);
        if (usageBlockMatch) {
          const n = /(\d+)/.exec(usageBlockMatch[0]);
          if (n) mailboxUsage = parseInt(n[1], 10);
        }
      }

      const email = `${name}@${domain}`;
      if (!accounts.some((a) => a.email === email)) {
        accounts.push({
          name,
          domain,
          email,
          mailbox,
          enabled,
          aliases,
          autoresponder,
          mailboxQuota,
          mailboxUsage,
        });
      }
    }
  }

  return { accounts, errors };
}

/**
 * Create a mail account on a domain.
 */
export async function createMailAccount(params: {
  domain: string;
  name: string; // local part before @
  password: string;
  mailbox?: boolean;
  quota?: number; // bytes, 0 = unlimited
}): Promise<void> {
  const domainId = await getDomainPleskId(params.domain);
  const mailboxEnabled = params.mailbox !== false;
  const quotaXml = params.quota ? `<mbox_quota>${params.quota}</mbox_quota>` : "";

  const xml = await pleskXmlRpc(
    `<packet>
      <mail>
        <create>
          <filter>
            <site-id>${domainId}</site-id>
            <mailname>
              <name>${escapeXml(params.name)}</name>
              <mailbox>
                <enabled>${mailboxEnabled}</enabled>
                ${quotaXml}
              </mailbox>
              <password>
                <value>${escapeXml(params.password)}</value>
                <type>plain</type>
              </password>
            </mailname>
          </filter>
        </create>
      </mail>
    </packet>`
  );

  const errorMatch = /<status>error<\/status>[\s\S]*?<errtext>([^<]+)<\/errtext>/.exec(xml);
  if (errorMatch) {
    throw new Error(errorMatch[1]);
  }
}

/**
 * Update a mail account (change password, enable/disable mailbox, quota).
 */
export async function updateMailAccount(params: {
  domain: string;
  name: string;
  password?: string;
  enabled?: boolean;
  quota?: number;
}): Promise<void> {
  const domainId = await getDomainPleskId(params.domain);

  let innerXml = "";
  if (params.password) {
    innerXml += `<password><value>${escapeXml(params.password)}</value><type>plain</type></password>`;
  }
  if (params.enabled !== undefined || params.quota !== undefined) {
    let mbXml = "";
    if (params.enabled !== undefined) mbXml += `<enabled>${params.enabled}</enabled>`;
    if (params.quota !== undefined) mbXml += `<mbox_quota>${params.quota}</mbox_quota>`;
    innerXml += `<mailbox>${mbXml}</mailbox>`;
  }

  if (!innerXml) return;

  const xml = await pleskXmlRpc(
    `<packet>
      <mail>
        <update>
          <set>
            <filter>
              <site-id>${domainId}</site-id>
              <mailname>
                <name>${escapeXml(params.name)}</name>
                ${innerXml}
              </mailname>
            </filter>
          </set>
        </update>
      </mail>
    </packet>`
  );

  const errorMatch = /<status>error<\/status>[\s\S]*?<errtext>([^<]+)<\/errtext>/.exec(xml);
  if (errorMatch) {
    throw new Error(errorMatch[1]);
  }
}

/**
 * Remove (delete) a mail account from a domain.
 */
export async function removeMailAccount(domain: string, name: string): Promise<void> {
  const domainId = await getDomainPleskId(domain);

  const xml = await pleskXmlRpc(
    `<packet>
      <mail>
        <remove>
          <filter>
            <site-id>${domainId}</site-id>
            <mailname>
              <name>${escapeXml(name)}</name>
            </mailname>
          </filter>
        </remove>
      </mail>
    </packet>`
  );

  const errorMatch = /<status>error<\/status>[\s\S]*?<errtext>([^<]+)<\/errtext>/.exec(xml);
  if (errorMatch) {
    throw new Error(errorMatch[1]);
  }
}

/**
 * Helper: get Plesk internal site ID for a domain name.
 */
async function getDomainPleskId(domain: string): Promise<number> {
  const xml = await pleskXmlRpc(
    `<packet>
      <site>
        <get>
          <filter>
            <name>${escapeXml(domain)}</name>
          </filter>
          <dataset><gen_info/></dataset>
        </get>
      </site>
    </packet>`
  );

  const idMatch = /<id>(\d+)<\/id>/.exec(xml);
  if (!idMatch) {
    // Fallback: try webspace (older Plesk structures)
    const xml2 = await pleskXmlRpc(
      `<packet>
        <webspace>
          <get>
            <filter>
              <name>${escapeXml(domain)}</name>
            </filter>
            <dataset><gen_info/></dataset>
          </get>
        </webspace>
      </packet>`
    );
    const id2 = /<id>(\d+)<\/id>/.exec(xml2);
    if (!id2) throw new Error(`Domain "${domain}" not found in Plesk`);
    return parseInt(id2[1], 10);
  }
  return parseInt(idMatch[1], 10);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Get webmail URL for a domain. Returns the standard Roundcube webmail URL on Plesk.
 */
export function getWebmailUrl(domain: string): string {
  return `https://webmail.${domain}`;
}

/**
 * Create a Plesk session URL that goes directly to webmail for a given email account.
 */
export async function createWebmailSessionUrl(pleskLogin: string): Promise<string> {
  const creds = await getPleskCredentials();
  const xml = await pleskXmlRpc(
    `<packet>
      <server>
        <create_session>
          <login>${escapeXml(pleskLogin)}</login>
          <data>
            <starting_url>/smb/email/addresses</starting_url>
            <source_server></source_server>
          </data>
        </create_session>
      </server>
    </packet>`
  );

  const errorMatch = /<status>error<\/status>[\s\S]*?<errtext>([^<]+)<\/errtext>/.exec(xml);
  if (errorMatch) {
    throw new Error(`Plesk error: ${errorMatch[1]}`);
  }

  const sessionIdMatch = /<id>([^<]+)<\/id>/.exec(xml);
  if (!sessionIdMatch) {
    throw new Error("Failed to create Plesk webmail session");
  }

  return `${creds.url}/enterprise/rsession_init.php?PHPSESSID=${sessionIdMatch[1]}`;
}
