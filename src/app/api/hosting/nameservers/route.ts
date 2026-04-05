import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import dns from "dns/promises";

// GET: get current nameservers for a domain
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

  try {
    const nameservers = await dns.resolveNs(domain);
    return NextResponse.json({ domain, nameservers });
  } catch {
    return NextResponse.json({ domain, nameservers: [], message: "Could not resolve nameservers" });
  }
}

// POST: update nameservers (creates a support request/order)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { domain, nameservers } = body;

  if (!domain || !Array.isArray(nameservers) || nameservers.length < 1) {
    return NextResponse.json(
      { error: "domain and at least 1 nameserver required" },
      { status: 400 }
    );
  }

  // Validate nameserver format
  const nsRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  for (const ns of nameservers) {
    if (!nsRegex.test(ns)) {
      return NextResponse.json(
        { error: `Invalid nameserver format: ${ns}` },
        { status: 400 }
      );
    }
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

  // Create a support order/request for nameserver change
  // (Nameserver changes at the registrar level typically require manual action or registrar API)
  const nsList = nameservers.slice(0, 4).map((ns: string) => ns.trim().toLowerCase());

  const order = await prisma.hostingOrder.create({
    data: {
      orderType: "DOMAIN_CHECK",
      status: "PENDING",
      domain: domain.toLowerCase(),
      notes: `Nameserver change request:\n${nsList.map((ns: string, i: number) => `NS${i + 1}: ${ns}`).join("\n")}`,
      userId: session.user.id,
    },
  });

  logAudit({
    action: "CREATE",
    entity: "NAMESERVER_REQUEST",
    entityId: order.id,
    description: `Nameserver change requested for ${domain}: ${nsList.join(", ")}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { domain, nameservers: nsList },
  });

  return NextResponse.json({
    success: true,
    orderId: order.id,
    message: "Nameserver change request submitted. Our team will update the nameservers for your domain.",
    nameservers: nsList,
  });
}
