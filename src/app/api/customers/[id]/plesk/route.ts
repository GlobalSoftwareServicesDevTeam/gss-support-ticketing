import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  findCustomerByEmail,
  listSubscriptions,
  isPleskConfiguredAsync,
} from "@/lib/plesk";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  // Get the customer's email from DB
  const { default: prisma } = await import("@/lib/prisma");
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { emailAddress: true, company: true },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Look up in Plesk by email
  const pleskCustomer = await findCustomerByEmail(customer.emailAddress);
  if (!pleskCustomer) {
    return NextResponse.json({
      found: false,
      email: customer.emailAddress,
      domains: [],
    });
  }

  // Get their domains/subscriptions
  let domains: { id: number; name: string; hosting_type: string; status: string; ipAddresses?: string[] }[] = [];
  try {
    const raw = await listSubscriptions(pleskCustomer.id);
    if (Array.isArray(raw)) {
      domains = raw.map((d: Record<string, unknown>) => ({
        id: d.id as number,
        name: d.name as string,
        hosting_type: (d.hosting_type as string) || "virtual",
        status: (d.status as string) || "active",
        ipAddresses: Array.isArray(d.ipAddresses) ? (d.ipAddresses as string[]) : [],
      }));
    }
  } catch {
    // domains list may fail, return customer info anyway
  }

  return NextResponse.json({
    found: true,
    email: customer.emailAddress,
    pleskCustomer: {
      id: pleskCustomer.id,
      login: pleskCustomer.login,
      name: pleskCustomer.name,
    },
    domains,
  });
}
