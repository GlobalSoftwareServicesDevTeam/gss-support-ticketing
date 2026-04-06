/**
 * Domains.co.za API client
 * API docs: https://docs.domains.co.za/
 * Base URL: https://api.domains.co.za/api
 */

const API_BASE = "https://api.domains.co.za/api";

let cachedToken: string | null = null;
let tokenExpiry = 0;

// ─── Auth ───────────────────────────────────────────────

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const username = process.env.DOMAINS_API_USERNAME;
  const password = process.env.DOMAINS_API_PASSWORD;

  if (!username || !password) {
    throw new Error("DOMAINS_API_USERNAME and DOMAINS_API_PASSWORD are required");
  }

  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }),
  });

  const data = await res.json();

  if (data.intReturnCode !== 1 || !data.token) {
    throw new Error(`Domains.co.za login failed: ${data.strMessage || "Unknown error"}`);
  }

  cachedToken = data.token;
  // JWT tokens typically last 24h — refresh after 23h
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  return cachedToken!;
}

async function apiRequest(
  method: string,
  endpoint: string,
  params?: Record<string, string>,
  body?: Record<string, string>
) {
  const token = await getToken();
  let url = `${API_BASE}${endpoint}`;

  if (params) {
    const qs = new URLSearchParams(params);
    url += `?${qs.toString()}`;
  }

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };

  if (body && (method === "POST" || method === "PUT")) {
    options.body = new URLSearchParams(body);
  }

  const res = await fetch(url, options);
  return res.json();
}

// ─── Helpers ────────────────────────────────────────────

/** Split a full domain into sld and tld parts */
function splitDomain(domain: string): { sld: string; tld: string } {
  const clean = domain.trim().toLowerCase();

  // Handle multi-part TLDs like .co.za, .org.za, .net.za, .web.za, etc.
  const multiPartTlds = [
    ".co.za", ".org.za", ".net.za", ".web.za", ".nom.za",
    ".co.uk", ".org.uk", ".co.in", ".com.au", ".co.nz",
  ];

  for (const tld of multiPartTlds) {
    if (clean.endsWith(tld)) {
      return { sld: clean.slice(0, -tld.length), tld };
    }
  }

  // Single-part TLD (e.g. .com, .net, .africa)
  const lastDot = clean.lastIndexOf(".");
  if (lastDot > 0) {
    return { sld: clean.slice(0, lastDot), tld: clean.slice(lastDot) };
  }

  return { sld: clean, tld: "" };
}

// ─── Domain Operations ─────────────────────────────────

/** Check domain availability */
export async function checkDomainAvailability(domain: string) {
  const { sld, tld } = splitDomain(domain);
  if (!sld || !tld) {
    throw new Error("Invalid domain format");
  }

  const data = await apiRequest("GET", "/domain/check", { sld, tld: tld.replace(/^\./, "") });

  // Return codes: 0 = available, 1 = registered/taken
  return {
    domain: `${sld}${tld}`,
    sld,
    tld,
    available: data.intReturnCode === 0,
    registered: data.intReturnCode === 1,
    message: data.strMessage || (data.intReturnCode === 0 ? "Available" : "Registered"),
    raw: data,
  };
}

/** Check availability for multiple TLDs at once */
export async function checkDomainMultipleTlds(name: string, tlds: string[]) {
  const results = await Promise.all(
    tlds.map(async (tld) => {
      try {
        const fullDomain = `${name}${tld.startsWith(".") ? tld : `.${tld}`}`;
        return await checkDomainAvailability(fullDomain);
      } catch {
        return {
          domain: `${name}${tld.startsWith(".") ? tld : `.${tld}`}`,
          sld: name,
          tld: tld.startsWith(".") ? tld : `.${tld}`,
          available: false,
          registered: false,
          message: "Check failed",
          raw: null,
        };
      }
    })
  );
  return results;
}

/** Get list of available TLDs with pricing */
export async function getAvailableTlds() {
  const data = await apiRequest("GET", "/domain/tlds");
  return data;
}

/** Get TLD pricing */
export async function getTldPricing() {
  const data = await apiRequest("GET", "/reseller/prices", { format: "tld" });
  return data;
}

/** Register a new domain */
export async function registerDomain(params: {
  sld: string;
  tld: string;
  period?: string;
  registrantName: string;
  registrantEmail: string;
  registrantCountry?: string;
  registrantProvince?: string;
  registrantContactNumber: string;
  registrantPostalCode?: string;
  registrantAddress1: string;
  registrantCity: string;
  ns1?: string;
  ns2?: string;
}) {
  const body: Record<string, string> = {
    sld: params.sld,
    tld: params.tld.replace(/^\./, ""),
    period: params.period || "1",
    registrantName: params.registrantName,
    registrantEmail: params.registrantEmail,
    registrantCountry: params.registrantCountry || "ZA",
    registrantProvince: params.registrantProvince || "Gauteng",
    registrantContactNumber: params.registrantContactNumber,
    registrantPostalCode: params.registrantPostalCode || "0001",
    registrantAddress1: params.registrantAddress1,
    registrantCity: params.registrantCity,
  };

  if (params.ns1) body.ns1 = params.ns1;
  if (params.ns2) body.ns2 = params.ns2;

  const data = await apiRequest("POST", "/domain", undefined, body);

  return {
    success: data.intReturnCode === 1 || data.intReturnCode === 2,
    queued: data.intReturnCode === 2,
    message: data.strMessage,
    raw: data,
  };
}

/** Transfer a domain in */
export async function transferDomain(params: {
  sld: string;
  tld: string;
  eppKey?: string;
  registrantName: string;
  registrantEmail: string;
  registrantContactNumber: string;
  registrantAddress1: string;
  registrantCity: string;
}) {
  const body: Record<string, string> = {
    sld: params.sld,
    tld: params.tld.replace(/^\./, ""),
    registrantName: params.registrantName,
    registrantEmail: params.registrantEmail,
    registrantContactNumber: params.registrantContactNumber,
    registrantAddress1: params.registrantAddress1,
    registrantCity: params.registrantCity,
  };

  if (params.eppKey) body.auth = params.eppKey;

  const data = await apiRequest("POST", "/domain/transfer", undefined, body);

  return {
    success: data.intReturnCode === 1 || data.intReturnCode === 2,
    queued: data.intReturnCode === 2,
    message: data.strMessage,
    raw: data,
  };
}

/** Renew a domain */
export async function renewDomain(sld: string, tld: string, period = "1") {
  const data = await apiRequest("POST", "/domain/renew", undefined, {
    sld,
    tld: tld.replace(/^\./, ""),
    period,
  });

  return {
    success: data.intReturnCode === 1 || data.intReturnCode === 2,
    message: data.strMessage,
    raw: data,
  };
}

/** Get domain info */
export async function getDomainInfo(domain: string) {
  const { sld, tld } = splitDomain(domain);
  const data = await apiRequest("GET", "/domain", {
    sld,
    tld: tld.replace(/^\./, ""),
  });
  return data;
}

/** Get transfer status */
export async function getTransferStatus(domain: string) {
  const { sld, tld } = splitDomain(domain);
  const data = await apiRequest("GET", "/domain/transfer", {
    sld,
    tld: tld.replace(/^\./, ""),
  });
  return data;
}

/** Get account balance/funds */
export async function getAccountFunds() {
  const data = await apiRequest("GET", "/domain/funds");
  return data;
}

// ─── DNS Operations ─────────────────────────────────────

/** Get DNS records for a domain */
export async function getDnsRecords(domain: string) {
  const { sld, tld } = splitDomain(domain);
  const data = await apiRequest("GET", "/domain/dns", {
    sld,
    tld: tld.replace(/^\./, ""),
  });
  return data;
}

/** Add a DNS record */
export async function addDnsRecord(
  domain: string,
  record: { type: string; name: string; content: string; ttl?: string; prio?: string }
) {
  const { sld, tld } = splitDomain(domain);
  const body: Record<string, string> = {
    sld,
    tld: tld.replace(/^\./, ""),
    type: record.type,
    name: record.name,
    content: record.content,
    ttl: record.ttl || "3600",
  };
  if (record.prio) body.prio = record.prio;

  const data = await apiRequest("POST", "/domain/dns/entry", undefined, body);
  return data;
}

/** Update a DNS record */
export async function updateDnsRecord(
  domain: string,
  dnsId: string,
  record: { type: string; name: string; content: string; ttl?: string; prio?: string }
) {
  const { sld, tld } = splitDomain(domain);
  const body: Record<string, string> = {
    sld,
    tld: tld.replace(/^\./, ""),
    dnsId,
    type: record.type,
    name: record.name,
    content: record.content,
    ttl: record.ttl || "3600",
  };
  if (record.prio) body.prio = record.prio;

  const data = await apiRequest("PUT", "/domain/dns/entry", undefined, body);
  return data;
}

/** Delete a DNS record */
export async function deleteDnsRecord(domain: string, dnsId: string) {
  const { sld, tld } = splitDomain(domain);
  const data = await apiRequest("DELETE", "/domain/dns/entry", {
    sld,
    tld: tld.replace(/^\./, ""),
    dnsId,
  });
  return data;
}

/** Update nameservers */
export async function updateNameservers(
  domain: string,
  nameservers: { ns1: string; ns2: string; ns3?: string; ns4?: string }
) {
  const { sld, tld } = splitDomain(domain);
  const body: Record<string, string> = {
    sld,
    tld: tld.replace(/^\./, ""),
    ns1: nameservers.ns1,
    ns2: nameservers.ns2,
  };
  if (nameservers.ns3) body.ns3 = nameservers.ns3;
  if (nameservers.ns4) body.ns4 = nameservers.ns4;

  const data = await apiRequest("POST", "/domain/ns", undefined, body);
  return data;
}

export { splitDomain };
