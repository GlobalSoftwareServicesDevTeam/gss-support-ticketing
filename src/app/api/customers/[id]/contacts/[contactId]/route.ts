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
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, contactId } = await params;
  const isAdminUser = (session.user as { role?: string }).role === "ADMIN";

  // Allow admin OR primary contact of same customer to update
  let isPrimaryOfCustomer = false;
  if (!isAdminUser) {
    const callerContact = await prisma.contact.findFirst({
      where: { userId: session.user.id, customerId: id, inviteAccepted: true },
    });
    if (!callerContact || (!callerContact.isPrimary && !callerContact.canManageContacts)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    isPrimaryOfCustomer = true;
  }

  const body = await req.json();
  const {
    firstName, lastName, email, phone, position, isPrimary,
    canViewTickets, canViewProjects, canViewBilling, canViewHosting,
    canViewDocuments, canViewCode, canViewNotifications, canManageContacts,
  } = body;

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, customerId: id },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Primary contacts can only change permissions on non-primary contacts
  if (isPrimaryOfCustomer && contact.isPrimary && contact.userId !== session.user.id) {
    return NextResponse.json({ error: "Cannot modify another primary contact" }, { status: 403 });
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
      // Permission flags — only admin or primary contact can set
      ...(canViewTickets !== undefined && { canViewTickets }),
      ...(canViewProjects !== undefined && { canViewProjects }),
      ...(canViewBilling !== undefined && { canViewBilling }),
      ...(canViewHosting !== undefined && { canViewHosting }),
      ...(canViewDocuments !== undefined && { canViewDocuments }),
      ...(canViewCode !== undefined && { canViewCode }),
      ...(canViewNotifications !== undefined && { canViewNotifications }),
      // Only admin can grant manageContacts
      ...(canManageContacts !== undefined && isAdminUser && { canManageContacts }),
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
