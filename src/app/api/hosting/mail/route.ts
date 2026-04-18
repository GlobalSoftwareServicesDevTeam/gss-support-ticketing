import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPleskConfiguredAsync, listMailAccounts, createMailAccount, updateMailAccount, removeMailAccount, getWebmailUrl, listSubscriptions, findCustomerByEmail } from "@/lib/plesk";
import { logAudit } from "@/lib/audit";
import { getCustomerContext } from "@/lib/customer-context";
import prisma from "@/lib/prisma";

/**
 * Verify that a regular user has access to a specific domain
 * by checking if it belongs to their customer's Plesk account.
 */
async function verifyDomainAccess(session: { user?: { id?: string; role?: string; customerId?: string; contactId?: string; isPrimaryContact?: boolean; customerPermissions?: Record<string, boolean> } }, domain: string): Promise<boolean> {
  if (session.user?.role === "ADMIN") return true;

  const ctx = getCustomerContext(session);
  if (!ctx) return false;

  const customer = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: { emailAddress: true },
  });
  if (!customer) return false;

  const pleskCustomer = await findCustomerByEmail(customer.emailAddress);
  if (!pleskCustomer) return false;

  const subs = await listSubscriptions(pleskCustomer.id);
  if (!Array.isArray(subs)) return false;

  return subs.some((d: { name: string }) => d.name === domain);
}

// GET: List mail accounts for a domain
// Admin: any domain. User: only domains belonging to their customer.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "domain parameter is required" }, { status: 400 });
  }

  // Verify domain access for non-admin users
  const hasAccess = await verifyDomainAccess(session, domain);
  if (!hasAccess) {
    return NextResponse.json({ error: "You do not have access to this domain" }, { status: 403 });
  }

  try {
    const accounts = await listMailAccounts(domain);
    const webmailUrl = getWebmailUrl(domain);
    return NextResponse.json({ accounts, webmailUrl, domain });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to list mail accounts" }, { status: 500 });
  }
}

// POST: Create a new mail account
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { domain, name, password, quota } = body;

  if (!domain || !name || !password) {
    return NextResponse.json({ error: "domain, name, and password are required" }, { status: 400 });
  }

  // Validate email local part
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    return NextResponse.json({ error: "Invalid email name. Use only letters, numbers, dots, hyphens, and underscores." }, { status: 400 });
  }

  if (password.length < 5) {
    return NextResponse.json({ error: "Password must be at least 5 characters" }, { status: 400 });
  }

  try {
    await createMailAccount({
      domain,
      name,
      password,
      mailbox: true,
      quota: quota ? parseInt(quota, 10) : undefined,
    });

    logAudit({
      action: "CREATE",
      entity: "EMAIL_ACCOUNT",
      entityId: `${name}@${domain}`,
      description: `Created email account ${name}@${domain}`,
      userId: session.user.id!,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ success: true, email: `${name}@${domain}` }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create mail account" }, { status: 500 });
  }
}

// PATCH: Update a mail account (password, enable/disable, quota)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { domain, name, password, enabled, quota } = body;

  if (!domain || !name) {
    return NextResponse.json({ error: "domain and name are required" }, { status: 400 });
  }

  if (password && password.length < 5) {
    return NextResponse.json({ error: "Password must be at least 5 characters" }, { status: 400 });
  }

  try {
    await updateMailAccount({ domain, name, password, enabled, quota: quota !== undefined ? parseInt(quota, 10) : undefined });

    const changes: string[] = [];
    if (password) changes.push("password changed");
    if (enabled !== undefined) changes.push(enabled ? "enabled" : "disabled");
    if (quota !== undefined) changes.push(`quota set to ${quota}`);

    logAudit({
      action: "UPDATE",
      entity: "EMAIL_ACCOUNT",
      entityId: `${name}@${domain}`,
      description: `Updated email account ${name}@${domain}: ${changes.join(", ")}`,
      userId: session.user.id!,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update mail account" }, { status: 500 });
  }
}

// DELETE: Remove a mail account
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configured = await isPleskConfiguredAsync();
  if (!configured) {
    return NextResponse.json({ error: "Plesk not configured" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const name = searchParams.get("name");

  if (!domain || !name) {
    return NextResponse.json({ error: "domain and name parameters are required" }, { status: 400 });
  }

  try {
    await removeMailAccount(domain, name);

    logAudit({
      action: "DELETE",
      entity: "EMAIL_ACCOUNT",
      entityId: `${name}@${domain}`,
      description: `Deleted email account ${name}@${domain}`,
      userId: session.user.id!,
      userName: session.user.name || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete mail account" }, { status: 500 });
  }
}
