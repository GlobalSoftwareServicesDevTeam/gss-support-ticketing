import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendEmail } from "@/lib/email";
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
      subject: "You're invited to GSS Support Portal",
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px;">
            <div style="background-color: #1a365d; color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px;">GSS Support Portal</h1>
            </div>
            <h2 style="color: #1a365d;">Welcome, ${contact.firstName}!</h2>
            <p>You've been invited to join the GSS Support Portal on behalf of <strong>${contact.customer.company}</strong>.</p>
            <p>Click the button below to set up your account:</p>
            <a href="${acceptUrl}" style="display: inline-block; background-color: #465fff; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; margin: 20px 0; font-weight: bold;">Accept Invitation & Set Up Account</a>
            <p style="color: #718096; font-size: 13px;">This invitation expires in 7 days.</p>
            <p style="color: #718096; font-size: 13px;">During setup you'll:</p>
            <ul style="color: #718096; font-size: 13px;">
              <li>Create your username and password</li>
              <li>Enter your company information</li>
              <li>Review and sign our terms of service</li>
            </ul>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #a0aec0; font-size: 11px;">
              <p>If you didn't expect this invitation, please ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
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
