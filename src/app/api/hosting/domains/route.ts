import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { promises as dns } from "dns";

// POST: check domain availability (single or multiple TLDs)
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
  const cleanDomain = domain.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "");

  // Get domain products for TLD pricing
  const domainProducts = await prisma.hostingProduct.findMany({
    where: { type: "DOMAIN", isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  // If user entered just a name (no TLD), check all configured TLDs
  const hasTld = /\.[a-z]{2,}$/.test(cleanDomain);
  const domainsToCheck: string[] = [];

  if (hasTld) {
    domainsToCheck.push(cleanDomain);
  } else {
    // Extract TLD suffixes from domain product names (e.g. ".co.za Domain" → ".co.za")
    const tlds: string[] = [];
    for (const product of domainProducts) {
      const match = product.name.match(/(\.[a-z.]+)/i);
      if (match) tlds.push(match[1].toLowerCase());
    }
    // Default TLDs if no products configured
    const checkTlds = tlds.length > 0 ? tlds : [".co.za", ".com", ".co", ".net", ".org"];
    for (const tld of checkTlds) {
      domainsToCheck.push(cleanDomain.replace(/\.$/, "") + tld);
    }
    // Also add the exact input if it looks like a full domain
    if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/.test(cleanDomain) && !domainsToCheck.includes(cleanDomain)) {
      domainsToCheck.unshift(cleanDomain);
    }
  }

  // Validate all domains
  const validDomains = domainsToCheck.filter((d) =>
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/.test(d)
  );

  if (validDomains.length === 0) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  // Check availability for each domain
  const results = await Promise.all(
    validDomains.map(async (d) => {
      let available = false;
      let registered = false;

      try {
        await dns.resolve(d);
        registered = true;
      } catch (err: unknown) {
        const dnsErr = err as { code?: string };
        if (dnsErr.code === "ENOTFOUND" || dnsErr.code === "ENODATA") {
          available = true;
        } else if (dnsErr.code === "SERVFAIL") {
          registered = true;
        }
      }

      if (!registered && !available) {
        try {
          await dns.resolveSoa(d);
          registered = true;
        } catch {
          available = true;
        }
      }

      // Find matching domain product by TLD
      const domainTld = d.substring(d.indexOf("."));
      const matchingProduct = domainProducts.find((p) => {
        const productTld = p.name.match(/(\.[a-z.]+)/i);
        return productTld && productTld[1].toLowerCase() === domainTld;
      });

      return {
        domain: d,
        tld: domainTld,
        available,
        registered,
        price: matchingProduct ? Number(matchingProduct.monthlyPrice) : null,
        productId: matchingProduct?.id || null,
        productName: matchingProduct?.name || null,
        message: available ? "Available" : "Registered",
      };
    })
  );

  return NextResponse.json({
    query: cleanDomain,
    results,
    // For backwards compatibility when single domain checked
    domain: results[0]?.domain,
    available: results[0]?.available,
    registered: results[0]?.registered,
    message: results[0]?.available
      ? "Domain appears to be available!"
      : "Domain is already registered.",
  });
}
