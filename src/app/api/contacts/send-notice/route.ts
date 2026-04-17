import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail, testEmailNoticeTemplate } from "@/lib/email";
import { logAudit } from "@/lib/audit";

// POST: send "disregard test emails" notice to all contacts who have been invited at least once
export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Target contacts who have been invited (invitedAt is set) but haven't accepted yet,
  // plus those who have never been invited — anyone who may have received a test email.
  const contacts = await prisma.contact.findMany({
    where: { inviteAccepted: false, email: { not: "" } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (contacts.length === 0) {
    return NextResponse.json({ message: "No eligible contacts found", sent: 0, failed: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const contact of contacts) {
    try {
      await sendEmail({
        to: contact.email,
        subject: "Important: Please Disregard Previous Portal Invitation Emails",
        html: testEmailNoticeTemplate(contact.firstName),
      });
      sent++;
    } catch {
      failed++;
    }
  }

  logAudit({
    action: "BULK_EMAIL",
    entity: "CONTACT",
    entityId: "all",
    description: `Sent test-email disregard notice to ${sent} contacts (${failed} failed)`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { sent, failed, total: contacts.length },
  });

  return NextResponse.json({ message: "Notice emails sent", sent, failed });
}
