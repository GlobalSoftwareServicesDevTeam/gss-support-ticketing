import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// PUT: bulk update notification preferences for a contact
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
  const { preferences } = body as {
    preferences: { channel: string; category: string; enabled: boolean }[];
  };

  if (!Array.isArray(preferences)) {
    return NextResponse.json({ error: "preferences array is required" }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, customerId: id },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Upsert each preference
  for (const pref of preferences) {
    await prisma.contactNotificationPref.upsert({
      where: {
        contactId_channel_category: {
          contactId,
          channel: pref.channel,
          category: pref.category,
        },
      },
      update: { enabled: pref.enabled },
      create: {
        contactId,
        channel: pref.channel,
        category: pref.category,
        enabled: pref.enabled,
      },
    });
  }

  const updated = await prisma.contactNotificationPref.findMany({
    where: { contactId },
  });

  return NextResponse.json(updated);
}
