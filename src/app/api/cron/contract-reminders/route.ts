import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail, contractReminderTemplate } from "@/lib/email";

const BASE_URL = process.env.NEXTAUTH_URL || "https://support.globalsoftwareservices.co.za";
const REMINDER_INTERVAL_DAYS = 3;

// Cron endpoint: send reminders to primary contacts who skipped contract signing
// Protected by AUTH_SECRET bearer token
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.AUTH_SECRET}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - REMINDER_INTERVAL_DAYS);

  // Find contacts with skipped contracts that haven't been reminded recently
  const skippedContracts = await prisma.clientContract.findMany({
    where: {
      status: "SKIPPED",
      OR: [
        { reminderLastSent: null },
        { reminderLastSent: { lt: cutoffDate } },
      ],
    },
    select: {
      id: true,
      contractType: true,
      contactId: true,
      userId: true,
      reminderCount: true,
    },
  });

  // Group by contact to send one email per contact
  const contactMap = new Map<string, { contractIds: string[]; userId: string }>();
  for (const contract of skippedContracts) {
    const existing = contactMap.get(contract.contactId);
    if (existing) {
      existing.contractIds.push(contract.id);
    } else {
      contactMap.set(contract.contactId, {
        contractIds: [contract.id],
        userId: contract.userId,
      });
    }
  }

  let sent = 0;
  const errors: string[] = [];

  for (const [contactId, { contractIds }] of contactMap) {
    try {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { firstName: true, email: true },
      });

      if (!contact) continue;

      await sendEmail({
        to: contact.email,
        subject: "Reminder: Outstanding Service Agreements - GSS Support Portal",
        html: contractReminderTemplate(contact.firstName, BASE_URL),
      });

      // Update reminder timestamps
      await prisma.clientContract.updateMany({
        where: { id: { in: contractIds } },
        data: {
          reminderLastSent: new Date(),
          reminderCount: { increment: 1 },
        },
      });

      sent++;
    } catch (err) {
      errors.push(`Failed to send to contact ${contactId}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  // Also check for primary contacts who haven't created any contract records yet
  // (they never visited the contract page at all)
  const contactsWithContracts = await prisma.clientContract.findMany({
    select: { contactId: true },
    distinct: ["contactId"],
  });
  const contactIdsWithContracts = contactsWithContracts.map((c) => c.contactId);

  const primaryContactsWithoutContracts = await prisma.contact.findMany({
    where: {
      isPrimary: true,
      inviteAccepted: true,
      userId: { not: null },
      id: { notIn: contactIdsWithContracts },
    },
    select: { id: true, firstName: true, email: true },
  });

  for (const contact of primaryContactsWithoutContracts) {
    try {
      await sendEmail({
        to: contact.email,
        subject: "Action Required: Sign Your Service Agreements - GSS Support Portal",
        html: contractReminderTemplate(contact.firstName, BASE_URL),
      });
      sent++;
    } catch (err) {
      errors.push(`Failed to send to new contact ${contact.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return NextResponse.json({
    success: true,
    reminders_sent: sent,
    skipped_contracts: skippedContracts.length,
    new_contacts: primaryContactsWithoutContracts.length,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  });
}
