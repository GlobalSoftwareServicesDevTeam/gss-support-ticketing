import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  isPleskConfigured,
  getDnsRecords,
  addDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
} from "@/lib/plesk";
import dns from "dns/promises";

// GET: get DNS records for a domain
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "domain parameter required" }, { status: 400 });
  }

  // Verify user owns this domain (or is admin)
  if (session.user.role !== "ADMIN") {
    const order = await prisma.hostingOrder.findFirst({
      where: {
        userId: session.user.id,
        domain: domain.toLowerCase(),
        orderType: { in: ["DOMAIN_REGISTER", "DOMAIN_TRANSFER", "HOSTING"] },
        status: "ACTIVE",
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Domain not found or not owned by you" }, { status: 403 });
    }
  }

  // Try Plesk first, fall back to DNS lookup
  if (isPleskConfigured()) {
    try {
      const records = await getDnsRecords(domain);
      return NextResponse.json({ source: "plesk", records });
    } catch (err) {
      // Plesk may not manage this domain, fall back to DNS lookup
      console.log(`Plesk DNS lookup failed for ${domain}:`, err);
    }
  }

  // Fallback: resolve DNS records via system DNS
  try {
    const records = await resolveDnsRecords(domain);
    return NextResponse.json({ source: "dns", records });
  } catch {
    return NextResponse.json({ source: "dns", records: [] });
  }
}

// POST: add a DNS record
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { domain, type, host, value, opt } = body;

  if (!domain || !type || !host || !value) {
    return NextResponse.json({ error: "domain, type, host, and value are required" }, { status: 400 });
  }

  const validTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];
  if (!validTypes.includes(type.toUpperCase())) {
    return NextResponse.json({ error: `Invalid record type. Valid: ${validTypes.join(", ")}` }, { status: 400 });
  }

  // Verify ownership
  if (session.user.role !== "ADMIN") {
    const order = await prisma.hostingOrder.findFirst({
      where: {
        userId: session.user.id,
        domain: domain.toLowerCase(),
        orderType: { in: ["DOMAIN_REGISTER", "DOMAIN_TRANSFER", "HOSTING"] },
        status: "ACTIVE",
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Domain not found or not owned by you" }, { status: 403 });
    }
  }

  if (!isPleskConfigured()) {
    return NextResponse.json({ error: "DNS management requires Plesk to be configured" }, { status: 400 });
  }

  try {
    const record = await addDnsRecord(domain, {
      type: type.toUpperCase(),
      host,
      value,
      opt: opt || undefined,
    });

    logAudit({
      action: "CREATE",
      entity: "DNS_RECORD",
      entityId: domain,
      description: `Added ${type} record for ${domain}: ${host} → ${value}`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: { domain, type, host, value, opt },
    });

    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add DNS record" },
      { status: 500 }
    );
  }
}

// PUT: update a DNS record
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { recordId, domain, type, host, value, opt } = body;

  if (!recordId) {
    return NextResponse.json({ error: "recordId is required" }, { status: 400 });
  }

  // Verify ownership
  if (session.user.role !== "ADMIN" && domain) {
    const order = await prisma.hostingOrder.findFirst({
      where: {
        userId: session.user.id,
        domain: domain.toLowerCase(),
        orderType: { in: ["DOMAIN_REGISTER", "DOMAIN_TRANSFER", "HOSTING"] },
        status: "ACTIVE",
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Domain not found or not owned by you" }, { status: 403 });
    }
  }

  if (!isPleskConfigured()) {
    return NextResponse.json({ error: "DNS management requires Plesk" }, { status: 400 });
  }

  try {
    const record = await updateDnsRecord(recordId, {
      type: type?.toUpperCase(),
      host,
      value,
      opt,
    });

    logAudit({
      action: "UPDATE",
      entity: "DNS_RECORD",
      entityId: String(recordId),
      description: `Updated DNS record #${recordId} for ${domain || "unknown"}: ${type || ""} ${host || ""} → ${value || ""}`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: { recordId, domain, type, host, value, opt },
    });

    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update DNS record" },
      { status: 500 }
    );
  }
}

// DELETE: remove a DNS record
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const recordId = searchParams.get("recordId");
  const domain = searchParams.get("domain");

  if (!recordId) {
    return NextResponse.json({ error: "recordId is required" }, { status: 400 });
  }

  // Verify ownership
  if (session.user.role !== "ADMIN" && domain) {
    const order = await prisma.hostingOrder.findFirst({
      where: {
        userId: session.user.id,
        domain: domain.toLowerCase(),
        orderType: { in: ["DOMAIN_REGISTER", "DOMAIN_TRANSFER", "HOSTING"] },
        status: "ACTIVE",
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Domain not found or not owned by you" }, { status: 403 });
    }
  }

  if (!isPleskConfigured()) {
    return NextResponse.json({ error: "DNS management requires Plesk" }, { status: 400 });
  }

  try {
    await deleteDnsRecord(Number(recordId));

    logAudit({
      action: "DELETE",
      entity: "DNS_RECORD",
      entityId: String(recordId),
      description: `Deleted DNS record #${recordId} for ${domain || "unknown"}`,
      userId: session.user.id,
      userName: session.user.name || undefined,
      metadata: { recordId, domain },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete DNS record" },
      { status: 500 }
    );
  }
}

// ─── Fallback DNS resolution ─────────────────────────

async function resolveDnsRecords(domain: string) {
  const records: { type: string; host: string; value: string; opt?: string }[] = [];

  // A records
  try {
    const a = await dns.resolve4(domain);
    a.forEach((ip) => records.push({ type: "A", host: domain, value: ip }));
  } catch { /* no A records */ }

  // AAAA records
  try {
    const aaaa = await dns.resolve6(domain);
    aaaa.forEach((ip) => records.push({ type: "AAAA", host: domain, value: ip }));
  } catch { /* no AAAA records */ }

  // CNAME records
  try {
    const cname = await dns.resolveCname(domain);
    cname.forEach((c) => records.push({ type: "CNAME", host: domain, value: c }));
  } catch { /* no CNAME records */ }

  // MX records
  try {
    const mx = await dns.resolveMx(domain);
    mx.forEach((m) => records.push({ type: "MX", host: domain, value: m.exchange, opt: String(m.priority) }));
  } catch { /* no MX records */ }

  // TXT records
  try {
    const txt = await dns.resolveTxt(domain);
    txt.forEach((t) => records.push({ type: "TXT", host: domain, value: t.join("") }));
  } catch { /* no TXT records */ }

  // NS records
  try {
    const ns = await dns.resolveNs(domain);
    ns.forEach((n) => records.push({ type: "NS", host: domain, value: n }));
  } catch { /* no NS records */ }

  // SOA record
  try {
    const soa = await dns.resolveSoa(domain);
    records.push({ type: "SOA", host: domain, value: `${soa.nsname} ${soa.hostmaster}`, opt: `serial:${soa.serial}` });
  } catch { /* no SOA record */ }

  return records;
}
