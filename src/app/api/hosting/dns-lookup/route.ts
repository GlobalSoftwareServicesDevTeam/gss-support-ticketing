import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { promises as dns } from "dns";

// POST: DNS record lookup for domain troubleshooting
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { domain, recordTypes } = body;

  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  // Clean domain input
  const cleanDomain = domain
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .replace(/\/.*$/, "");

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]{2,})*(\.[a-z]{2,})$/.test(cleanDomain)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  const types: string[] = Array.isArray(recordTypes) && recordTypes.length > 0
    ? recordTypes
    : ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"];

  const results: Record<string, unknown> = {};

  await Promise.all(
    types.map(async (type: string) => {
      try {
        switch (type.toUpperCase()) {
          case "A": {
            const records = await dns.resolve4(cleanDomain);
            results.A = records.map((ip) => ({ value: ip }));
            break;
          }
          case "AAAA": {
            const records = await dns.resolve6(cleanDomain);
            results.AAAA = records.map((ip) => ({ value: ip }));
            break;
          }
          case "MX": {
            const records = await dns.resolveMx(cleanDomain);
            results.MX = records
              .sort((a, b) => a.priority - b.priority)
              .map((r) => ({ value: r.exchange, priority: r.priority }));
            break;
          }
          case "NS": {
            const records = await dns.resolveNs(cleanDomain);
            results.NS = records.map((ns) => ({ value: ns }));
            break;
          }
          case "TXT": {
            const records = await dns.resolveTxt(cleanDomain);
            results.TXT = records.map((r) => ({ value: r.join("") }));
            break;
          }
          case "CNAME": {
            const records = await dns.resolveCname(cleanDomain);
            results.CNAME = records.map((r) => ({ value: r }));
            break;
          }
          case "SOA": {
            const record = await dns.resolveSoa(cleanDomain);
            results.SOA = [{
              nsname: record.nsname,
              hostmaster: record.hostmaster,
              serial: record.serial,
              refresh: record.refresh,
              retry: record.retry,
              expire: record.expire,
              minttl: record.minttl,
            }];
            break;
          }
          case "SRV": {
            const records = await dns.resolveSrv(cleanDomain);
            results.SRV = records.map((r) => ({
              value: r.name,
              port: r.port,
              priority: r.priority,
              weight: r.weight,
            }));
            break;
          }
          case "CAA": {
            const records = await dns.resolveCaa(cleanDomain);
            results.CAA = records.map((r) => ({
              critical: r.critical,
              issue: r.issue,
              issuewild: r.issuewild,
              iodef: r.iodef,
              contactemail: r.contactemail,
              contactphone: r.contactphone,
            }));
            break;
          }
        }
      } catch (err: unknown) {
        const dnsErr = err as { code?: string };
        if (dnsErr.code === "ENODATA" || dnsErr.code === "ENOTFOUND") {
          results[type.toUpperCase()] = [];
        } else {
          results[type.toUpperCase()] = { error: dnsErr.code || "lookup failed" };
        }
      }
    })
  );

  // Also do a reverse lookup for the A record IP
  let reverseDns: string[] | null = null;
  if (results.A && Array.isArray(results.A) && results.A.length > 0) {
    try {
      const firstIp = (results.A[0] as { value: string }).value;
      reverseDns = await dns.reverse(firstIp);
    } catch {
      reverseDns = null;
    }
  }

  return NextResponse.json({
    domain: cleanDomain,
    records: results,
    reverseDns,
    timestamp: new Date().toISOString(),
  });
}
