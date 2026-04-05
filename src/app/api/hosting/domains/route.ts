import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// POST: check domain availability
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

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/.test(cleanDomain)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  try {
    // Use DNS lookup to check if domain resolves (basic availability check)
    // For production, integrate with a registrar API (e.g., ResellerClub, OpenSRS)
    const { promises: dns } = require("dns");

    let available = false;
    let registered = false;

    try {
      await dns.resolve(cleanDomain);
      registered = true;
    } catch (err: unknown) {
      const dnsErr = err as { code?: string };
      if (dnsErr.code === "ENOTFOUND" || dnsErr.code === "ENODATA") {
        available = true;
      } else if (dnsErr.code === "SERVFAIL") {
        // Domain exists but DNS not configured
        registered = true;
      }
    }

    // Also check WHOIS-style via SOA record
    if (!registered && !available) {
      try {
        await dns.resolveSoa(cleanDomain);
        registered = true;
      } catch {
        available = true;
      }
    }

    return NextResponse.json({
      domain: cleanDomain,
      available,
      registered,
      message: available
        ? "Domain appears to be available!"
        : "Domain is already registered.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to check domain", details: String(error) },
      { status: 500 }
    );
  }
}
