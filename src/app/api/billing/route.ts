import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  isInvoiceNinjaConfigured,
  listClients,
  findClientByEmail,
  createClient,
  getClient,
} from "@/lib/invoice-ninja";

// GET: get billing account info for current user, or list all clients (admin)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isInvoiceNinjaConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // Admin: list all IN clients for linking
  if (action === "list-clients" && session.user.role === "ADMIN") {
    try {
      const clients = await listClients();
      return NextResponse.json({ configured: true, clients });
    } catch (error) {
      return NextResponse.json({ error: String(error), configured: true }, { status: 500 });
    }
  }

  // Current user's billing account
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { invoiceNinjaClientId: true, email: true, firstName: true, lastName: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.invoiceNinjaClientId) {
    try {
      const client = await getClient(user.invoiceNinjaClientId);
      return NextResponse.json({ configured: true, linked: true, client });
    } catch {
      return NextResponse.json({ configured: true, linked: true, clientId: user.invoiceNinjaClientId });
    }
  }

  return NextResponse.json({ configured: true, linked: false });
}

// POST: create or link billing account
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isInvoiceNinjaConfigured()) {
    return NextResponse.json({ error: "Invoice Ninja not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { action, userId, clientId } = body;

  // Admin: link existing IN client to a user
  if (action === "link" && session.user.role === "ADMIN") {
    if (!userId || !clientId) {
      return NextResponse.json({ error: "userId and clientId are required" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { invoiceNinjaClientId: clientId },
    });

    return NextResponse.json({ message: "Billing account linked" });
  }

  // User: auto-create billing account
  if (action === "create") {
    const targetUserId = session.user.role === "ADMIN" && userId ? userId : session.user.id;

    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.invoiceNinjaClientId) {
      return NextResponse.json({ error: "User already has a billing account", clientId: user.invoiceNinjaClientId }, { status: 400 });
    }

    try {
      // Try to find existing client by email first
      let client = await findClientByEmail(user.email);

      if (!client) {
        client = await createClient({
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phoneNumber || undefined,
          company: user.company || undefined,
          address: user.companyAddress || undefined,
          vatNumber: user.companyVatNo || undefined,
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { invoiceNinjaClientId: client.id },
      });

      return NextResponse.json({ message: "Billing account created", clientId: client.id });
    } catch (error) {
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
