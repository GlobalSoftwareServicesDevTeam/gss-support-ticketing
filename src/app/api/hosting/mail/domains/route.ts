import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPleskConfiguredAsync, listSubscriptions, findCustomerByEmail } from "@/lib/plesk";
import prisma from "@/lib/prisma";
import { getCustomerContext } from "@/lib/customer-context";

// GET: List domains available for email management
// Admin: all domains across all Plesk clients
// User: domains belonging to their customer's Plesk account
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  try {
    if (session.user.role === "ADMIN") {
      // Admin: list all domains
      const allDomains = await listSubscriptions();
      const domains = Array.isArray(allDomains)
        ? allDomains.map((d: { id: number; name: string; status: string }) => ({
            id: d.id,
            name: d.name,
            status: d.status || "active",
          }))
        : [];
      return NextResponse.json({ domains });
    }

    // Regular user: find their customer, then their Plesk account
    const ctx = getCustomerContext(session);
    if (!ctx) {
      return NextResponse.json({ domains: [] });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: ctx.customerId },
      select: { emailAddress: true },
    });

    if (!customer) {
      return NextResponse.json({ domains: [] });
    }

    const pleskCustomer = await findCustomerByEmail(customer.emailAddress);
    if (!pleskCustomer) {
      return NextResponse.json({ domains: [] });
    }

    const raw = await listSubscriptions(pleskCustomer.id);
    const domains = Array.isArray(raw)
      ? raw.map((d: { id: number; name: string; status: string }) => ({
          id: d.id,
          name: d.name,
          status: d.status || "active",
        }))
      : [];

    return NextResponse.json({ domains, pleskLogin: pleskCustomer.login });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to list domains" }, { status: 500 });
  }
}
