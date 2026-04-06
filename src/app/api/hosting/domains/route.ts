import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  checkDomainAvailability,
  checkDomainMultipleTlds,
} from "@/lib/domains-api";

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

  try {
    let apiResults: {
      domain: string;
      sld: string;
      tld: string;
      available: boolean;
      registered: boolean;
      message: string;
      raw: unknown;
    }[];

    if (hasTld) {
      const result = await checkDomainAvailability(cleanDomain);
      apiResults = [result];
    } else {
      // Extract TLD suffixes from domain product names (e.g. ".co.za Domain" → ".co.za")
      const tlds: string[] = [];
      for (const product of domainProducts) {
        const match = product.name.match(/(\.[a-z.]+)/i);
        if (match) tlds.push(match[1].toLowerCase());
      }
      // Default TLDs if no products configured
      const checkTlds = tlds.length > 0 ? tlds : [".co.za", ".com", ".co", ".net", ".org"];
      apiResults = await checkDomainMultipleTlds(cleanDomain.replace(/\.$/, ""), checkTlds);
    }

    // Merge with product pricing
    const results = apiResults.map((r) => {
      const matchingProduct = domainProducts.find((p) => {
        const productTld = p.name.match(/(\.[a-z.]+)/i);
        return productTld && productTld[1].toLowerCase() === r.tld;
      });

      return {
        domain: r.domain,
        tld: r.tld,
        available: r.available,
        registered: r.registered,
        price: matchingProduct ? Number(matchingProduct.monthlyPrice) : null,
        productId: matchingProduct?.id || null,
        productName: matchingProduct?.name || null,
        message: r.available ? "Available" : r.registered ? "Registered" : r.message,
      };
    });

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
  } catch (error) {
    console.error("Domain check error:", error);
    return NextResponse.json(
      { error: "Failed to check domain availability. Please try again later." },
      { status: 502 }
    );
  }
}
