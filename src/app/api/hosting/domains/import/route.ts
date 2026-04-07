import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// POST: bulk import domains (admin only)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { domains } = body as {
    domains: {
      domain: string;
      expiryDate?: string;
      status?: string;
      customerId?: string;
      projectId?: string;
      notes?: string;
      amount?: number;
    }[];
  };

  if (!Array.isArray(domains) || domains.length === 0) {
    return NextResponse.json({ error: "domains array is required" }, { status: 400 });
  }

  if (domains.length > 500) {
    return NextResponse.json({ error: "Maximum 500 domains per import" }, { status: 400 });
  }

  const validStatuses = ["PENDING", "ACTIVE", "CANCELLED", "EXPIRED"];
  const results: { domain: string; status: "created" | "skipped" | "error"; reason?: string }[] = [];

  for (const entry of domains) {
    const domainName = entry.domain?.trim().toLowerCase();
    if (!domainName) {
      results.push({ domain: entry.domain || "(empty)", status: "error", reason: "Empty domain name" });
      continue;
    }

    // Check for existing domain
    const existing = await prisma.hostingOrder.findFirst({
      where: {
        domain: domainName,
        orderType: { in: ["DOMAIN_REGISTER", "DOMAIN_TRANSFER"] },
        status: { not: "CANCELLED" },
      },
    });

    if (existing) {
      results.push({ domain: domainName, status: "skipped", reason: "Already exists" });
      continue;
    }

    // Validate customerId if provided
    if (entry.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: entry.customerId } });
      if (!customer) {
        results.push({ domain: domainName, status: "error", reason: "Customer not found" });
        continue;
      }
    }

    // Validate projectId if provided
    if (entry.projectId) {
      const project = await prisma.project.findUnique({ where: { id: entry.projectId } });
      if (!project) {
        results.push({ domain: domainName, status: "error", reason: "Project not found" });
        continue;
      }
    }

    const status = entry.status && validStatuses.includes(entry.status) ? entry.status : "ACTIVE";

    try {
      await prisma.hostingOrder.create({
        data: {
          orderType: "DOMAIN_REGISTER",
          domain: domainName,
          status,
          userId: session.user.id,
          expiryDate: entry.expiryDate ? new Date(entry.expiryDate) : null,
          customerId: entry.customerId || null,
          projectId: entry.projectId || null,
          notes: entry.notes || null,
          amount: entry.amount ?? null,
          period: 12,
        },
      });
      results.push({ domain: domainName, status: "created" });
    } catch (err) {
      results.push({ domain: domainName, status: "error", reason: String(err) });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  logAudit({
    action: "IMPORT",
    entity: "HOSTING_ORDER",
    entityId: "bulk",
    description: `Imported ${created} domains (${skipped} skipped, ${errors} errors)`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { created, skipped, errors },
  });

  return NextResponse.json({ results, summary: { created, skipped, errors } });
}
