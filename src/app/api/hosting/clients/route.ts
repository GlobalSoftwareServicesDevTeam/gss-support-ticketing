import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPleskConfiguredAsync } from "@/lib/plesk";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  // Dynamic imports to avoid bundling issues
  const { default: prisma } = await import("@/lib/prisma");
  const { findCustomerByEmail, listSubscriptions, createSessionUrl } = await import("@/lib/plesk");

  // Get all customers from DB
  const customers = await prisma.customer.findMany({
    select: { id: true, company: true, contactPerson: true, emailAddress: true },
    orderBy: { company: "asc" },
  });

  // For each customer, find their Plesk account and domains
  const results = await Promise.allSettled(
    customers.map(async (cust) => {
      const pleskCustomer = await findCustomerByEmail(cust.emailAddress);
      if (!pleskCustomer) {
        return {
          customerId: cust.id,
          company: cust.company,
          contactPerson: cust.contactPerson,
          email: cust.emailAddress,
          found: false,
          pleskCustomer: null,
          domains: [],
          sessionUrl: null,
        };
      }

      let domains: { id: number; name: string; hosting_type: string; status: string }[] = [];
      try {
        const raw = await listSubscriptions(pleskCustomer.id);
        if (Array.isArray(raw)) {
          domains = raw.map((d: Record<string, unknown>) => ({
            id: d.id as number,
            name: d.name as string,
            hosting_type: (d.hosting_type as string) || "virtual",
            status: (d.status as string) || "active",
          }));
        }
      } catch {
        // domains may fail
      }

      let sessionUrl: string | null = null;
      try {
        sessionUrl = await createSessionUrl(pleskCustomer.login);
      } catch {
        // session URL may fail
      }

      return {
        customerId: cust.id,
        company: cust.company,
        contactPerson: cust.contactPerson,
        email: cust.emailAddress,
        found: true,
        pleskCustomer: {
          id: pleskCustomer.id,
          login: pleskCustomer.login,
          name: pleskCustomer.name,
        },
        domains,
        sessionUrl,
      };
    })
  );

  const clients = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<unknown>).value);

  return NextResponse.json({ clients });
}
