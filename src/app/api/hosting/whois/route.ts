import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// POST: WHOIS / RDAP lookup for a domain
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { domain } = body;

  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  // Clean domain input
  const cleanDomain = domain
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .replace(/\/.*$/, "");

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/.test(cleanDomain)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  try {
    // Use RDAP (Registration Data Access Protocol) - modern JSON-based WHOIS
    const rdapRes = await fetch(`https://rdap.org/domain/${encodeURIComponent(cleanDomain)}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!rdapRes.ok) {
      // Fallback: try direct TLD RDAP servers for .za domains
      if (cleanDomain.endsWith(".za")) {
        return await lookupZaDomain(cleanDomain);
      }
      return NextResponse.json(
        { error: `WHOIS lookup failed (${rdapRes.status}). Domain may not exist.` },
        { status: 404 }
      );
    }

    const rdap = await rdapRes.json();

    const result = {
      domain: rdap.ldhName || cleanDomain,
      handle: rdap.handle || null,
      status: rdap.status || [],

      // Registration dates
      events: (rdap.events || []).map((e: Record<string, unknown>) => ({
        action: e.eventAction,
        date: e.eventDate,
      })),
      registrationDate: rdap.events?.find((e: Record<string, unknown>) => e.eventAction === "registration")?.eventDate || null,
      expirationDate: rdap.events?.find((e: Record<string, unknown>) => e.eventAction === "expiration")?.eventDate || null,
      lastChanged: rdap.events?.find((e: Record<string, unknown>) => e.eventAction === "last changed")?.eventDate || null,

      // Registrar
      registrar: extractEntity(rdap.entities, "registrar"),

      // Registrant
      registrant: extractEntity(rdap.entities, "registrant"),

      // Nameservers
      nameservers: (rdap.nameservers || []).map((ns: Record<string, unknown>) => ns.ldhName || ns.unicodeName),

      // DNSSEC
      secureDNS: rdap.secureDNS || null,

      // Notices
      notices: (rdap.notices || []).slice(0, 3).map((n: Record<string, unknown>) => ({
        title: n.title,
        description: Array.isArray(n.description) ? n.description.join(" ") : n.description,
      })),

      // Links to full WHOIS
      links: (rdap.links || [])
        .filter((l: Record<string, unknown>) => l.rel === "self" || l.rel === "related")
        .map((l: Record<string, unknown>) => ({ rel: l.rel, href: l.href })),

      source: "rdap",
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("WHOIS lookup error:", error);
    return NextResponse.json(
      { error: "Failed to perform WHOIS lookup. Please try again." },
      { status: 502 }
    );
  }
}

function extractEntity(
  entities: Array<Record<string, unknown>> | undefined,
  role: string
): Record<string, unknown> | null {
  if (!entities) return null;
  const entity = entities.find(
    (e) => Array.isArray(e.roles) && e.roles.includes(role)
  );
  if (!entity) return null;

  const vcard = entity.vcardArray as [string, Array<Array<unknown>>] | undefined;
  const info: Record<string, unknown> = {
    handle: entity.handle || null,
    roles: entity.roles,
  };

  if (vcard && Array.isArray(vcard[1])) {
    for (const prop of vcard[1]) {
      if (!Array.isArray(prop) || prop.length < 4) continue;
      const [name, , , value] = prop;
      if (name === "fn") info.name = value;
      if (name === "org") info.organization = Array.isArray(value) ? value[0] : value;
      if (name === "email") info.email = value;
      if (name === "tel") info.phone = value;
      if (name === "adr") info.address = Array.isArray(value) ? value.filter(Boolean).join(", ") : value;
    }
  }

  return info;
}

async function lookupZaDomain(domain: string) {
  // For .za domains, try the ZA RDAP server directly
  try {
    const res = await fetch(`https://rdap.registry.net.za/domain/${encodeURIComponent(domain)}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "WHOIS data not available for this domain." },
        { status: 404 }
      );
    }

    const rdap = await res.json();
    return NextResponse.json({
      domain: rdap.ldhName || domain,
      handle: rdap.handle || null,
      status: rdap.status || [],
      events: (rdap.events || []).map((e: Record<string, unknown>) => ({
        action: e.eventAction,
        date: e.eventDate,
      })),
      registrationDate: rdap.events?.find((e: Record<string, unknown>) => e.eventAction === "registration")?.eventDate || null,
      expirationDate: rdap.events?.find((e: Record<string, unknown>) => e.eventAction === "expiration")?.eventDate || null,
      lastChanged: rdap.events?.find((e: Record<string, unknown>) => e.eventAction === "last changed")?.eventDate || null,
      registrar: extractEntity(rdap.entities, "registrar"),
      registrant: extractEntity(rdap.entities, "registrant"),
      nameservers: (rdap.nameservers || []).map((ns: Record<string, unknown>) => ns.ldhName || ns.unicodeName),
      secureDNS: rdap.secureDNS || null,
      notices: [],
      links: [],
      source: "rdap-za",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to look up .za domain WHOIS data." },
      { status: 502 }
    );
  }
}
