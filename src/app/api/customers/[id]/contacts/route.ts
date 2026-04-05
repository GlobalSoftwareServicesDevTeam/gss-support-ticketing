import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// GET: list contacts for a customer
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const contacts = await prisma.contact.findMany({
    where: { customerId: id },
    include: { notificationPreferences: true },
    orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }],
  });

  return NextResponse.json(contacts);
}

// POST: create a contact for a customer
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { firstName, lastName, email, phone, position, isPrimary } = body;

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "firstName, lastName, and email are required" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // If this contact is primary, unset any existing primary
  if (isPrimary) {
    await prisma.contact.updateMany({
      where: { customerId: id, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email,
      phone: phone || null,
      position: position || null,
      isPrimary: isPrimary || false,
      customerId: id,
    },
    include: { notificationPreferences: true },
  });

  // Create default notification preferences for this contact
  const channels = ["EMAIL"];
  const categories = ["TICKETS", "INVOICES", "PAYMENTS", "PROJECTS", "HOSTING", "MAINTENANCE", "GENERAL"];
  await prisma.contactNotificationPref.createMany({
    data: channels.flatMap((channel) =>
      categories.map((category) => ({
        contactId: contact.id,
        channel,
        category,
        enabled: true,
      }))
    ),
  });

  logAudit({
    action: "CREATE",
    entity: "CONTACT",
    entityId: contact.id,
    description: `Created contact: ${firstName} ${lastName} (${email}) for ${customer.company}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  // Return contact with prefs
  const full = await prisma.contact.findUnique({
    where: { id: contact.id },
    include: { notificationPreferences: true },
  });

  return NextResponse.json(full, { status: 201 });
}
