import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET: Get the current user's customer context (company info + permissions)
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  // Find the contact record linking this user to a customer
  const contact = await prisma.contact.findFirst({
    where: { userId, inviteAccepted: true },
    include: {
      customer: {
        include: {
          contacts: {
            where: { inviteAccepted: true },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              position: true,
              isPrimary: true,
              userId: true,
            },
          },
          _count: {
            select: {
              issues: true,
              repos: true,
            },
          },
        },
      },
    },
  });

  if (!contact) {
    return NextResponse.json({
      linked: false,
      isAdmin,
      customer: null,
      contact: null,
      permissions: null,
    });
  }

  return NextResponse.json({
    linked: true,
    isAdmin,
    customer: {
      id: contact.customer.id,
      company: contact.customer.company,
      phoneNumber: contact.customer.phoneNumber,
      contactPerson: contact.customer.contactPerson,
      emailAddress: contact.customer.emailAddress,
      address: contact.customer.address,
      vatNumber: contact.customer.vatNumber,
      regNumber: contact.customer.regNumber,
      isActive: contact.customer.isActive,
      contacts: contact.customer.contacts,
      stats: {
        tickets: contact.customer._count.issues,
        repos: contact.customer._count.repos,
      },
    },
    contact: {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      isPrimary: contact.isPrimary,
      position: contact.position,
    },
    permissions: {
      tickets: contact.canViewTickets,
      projects: contact.canViewProjects,
      billing: contact.canViewBilling,
      hosting: contact.canViewHosting,
      documents: contact.canViewDocuments,
      code: contact.canViewCode,
      notifications: contact.canViewNotifications,
      manageContacts: contact.canManageContacts || contact.isPrimary,
    },
  });
}
