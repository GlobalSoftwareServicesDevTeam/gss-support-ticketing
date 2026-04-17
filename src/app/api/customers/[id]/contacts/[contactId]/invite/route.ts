import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendEmail, contactInviteTemplate } from "@/lib/email";
import { logAudit } from "@/lib/audit";

// POST: send invite to a contact to join the platform
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, contactId } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, customerId: id },
    include: { customer: true },
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (contact.inviteAccepted) {
    return NextResponse.json({ error: "Contact has already accepted the invite" }, { status: 400 });
  }

  // Check if a User already exists with this email
  const existingUser = await prisma.user.findFirst({
    where: { email: contact.email, isDeleted: false },
  });
  if (existingUser) {
    // Link the contact to the user and mark as accepted
    await prisma.contact.update({
      where: { id: contactId },
      data: { userId: existingUser.id, inviteAccepted: true },
    });
    return NextResponse.json({ message: "Contact linked to existing user account", userId: existingUser.id });
  }

  const inviteToken = randomBytes(32).toString("hex");
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.contact.update({
    where: { id: contactId },
    data: { inviteToken, inviteExpiresAt, invitedAt: new Date() },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "https://support.globalsoftwareservices.co.za";
  const acceptUrl = `${baseUrl}/invite?token=${inviteToken}`;

  try {
    await sendEmail({
      to: contact.email,
      subject: "You're invited to the GSS Support Portal",
      html: contactInviteTemplate(contact.firstName, contact.customer.company, acceptUrl),
    });
  } catch {
    // Email failed, but invite token is saved - admin can resend
  }

  logAudit({
    action: "INVITE",
    entity: "CONTACT",
    entityId: contactId,
    description: `Sent invite to contact: ${contact.firstName} ${contact.lastName} (${contact.email}) for ${contact.customer.company}`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { email: contact.email, customerId: id },
  });

  return NextResponse.json({ message: "Invitation sent", invitedAt: new Date().toISOString() });
}
