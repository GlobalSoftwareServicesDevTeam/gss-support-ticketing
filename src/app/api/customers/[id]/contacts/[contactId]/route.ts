import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// PUT: update a contact
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, contactId } = await params;
  const body = await req.json();
  const { firstName, lastName, email, phone, position, isPrimary } = body;

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, customerId: id },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // If setting as primary, unset others
  if (isPrimary && !contact.isPrimary) {
    await prisma.contact.updateMany({
      where: { customerId: id, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const updated = await prisma.contact.update({
    where: { id: contactId },
    data: {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(position !== undefined && { position }),
      ...(isPrimary !== undefined && { isPrimary }),
    },
    include: { notificationPreferences: true },
  });

  logAudit({
    action: "UPDATE",
    entity: "CONTACT",
    entityId: contactId,
    description: `Updated contact: ${updated.firstName} ${updated.lastName}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json(updated);
}

// DELETE: delete a contact
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, contactId } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, customerId: id },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await prisma.contact.delete({ where: { id: contactId } });

  logAudit({
    action: "DELETE",
    entity: "CONTACT",
    entityId: contactId,
    description: `Deleted contact: ${contact.firstName} ${contact.lastName} (${contact.email})`,
    userId: session.user.id,
    userName: session.user.name || undefined,
  });

  return NextResponse.json({ message: "Contact deleted" });
}
