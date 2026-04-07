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

  const { default: prisma } = await import("@/lib/prisma");
  const { listSubscriptions } = await import("@/lib/plesk");

  // Get all customer emails from DB
  const customers = await prisma.customer.findMany({
    select: { emailAddress: true },
  });
  const customerEmails = new Set(
    customers.map((c) => c.emailAddress.toLowerCase())
  );

  // Get all Plesk clients
  const { getPleskConfig } = await import("@/lib/settings");
  const config = await getPleskConfig();
  const pleskUrl = (config.PLESK_API_URL || process.env.PLESK_API_URL || "").replace(/\/+$/, "");
  const pleskLogin = config.PLESK_API_LOGIN || process.env.PLESK_API_LOGIN || "";
  const pleskPassword = config.PLESK_API_PASSWORD || process.env.PLESK_API_PASSWORD || "";

  if (!pleskUrl || !pleskLogin || !pleskPassword) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  const authHeader = Buffer.from(`${pleskLogin}:${pleskPassword}`).toString("base64");

  let allPleskClients: { id: number; login: string; name: string; email: string }[] = [];
  try {
    const res = await fetch(`${pleskUrl}/api/v2/clients`, {
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (res.ok) {
      allPleskClients = await res.json();
    }
  } catch {
    return NextResponse.json({ error: "Failed to fetch Plesk clients" }, { status: 500 });
  }

  // Filter to only unassigned (no matching customer email)
  const unassigned = allPleskClients
    .filter((pc) => !customerEmails.has(pc.email?.toLowerCase()))
    .map((pc) => ({ id: pc.id, login: pc.login, name: pc.name, email: pc.email }));

  // For each unassigned client, get their domains
  const results = await Promise.allSettled(
    unassigned.map(async (client) => {
      let domains: { id: number; name: string; status: string }[] = [];
      try {
        const raw = await listSubscriptions(client.id);
        if (Array.isArray(raw)) {
          domains = raw.map((d: Record<string, unknown>) => ({
            id: d.id as number,
            name: d.name as string,
            status: (d.status as string) || "active",
          }));
        }
      } catch {
        // domains may fail
      }
      return { ...client, domains };
    })
  );

  const clients = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<unknown>).value);

  return NextResponse.json({ clients });
}
