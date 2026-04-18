import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";
import { sendEmail, contactInviteTemplate } from "@/lib/email";
import { logAudit } from "@/lib/audit";

// POST: invite a new user by email
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, firstName, lastName, role, projectIds, invoiceNinjaClientId, staffRoleId } = body;

  if (!email || !firstName || !lastName) {
    return NextResponse.json({ error: "email, firstName, and lastName are required" }, { status: 400 });
  }

  // Check if user already exists
  const existing = await prisma.user.findFirst({
    where: { email, isDeleted: false },
  });
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const inviteToken = randomBytes(32).toString("hex");
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create user stub with invite token (no password yet, not confirmed)
  const user = await prisma.user.create({
    data: {
      email,
      username: email, // will be updated during accept
      firstName,
      lastName,
      passwordHash: "", // placeholder — set during invite accept
      role: role || "USER",
      emailConfirmed: false,
      inviteToken,
      inviteExpiresAt,
      invoiceNinjaClientId: invoiceNinjaClientId || null,
      staffRoleId: role === "EMPLOYEE" ? staffRoleId || null : null,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "https://support.globalsoftwareservices.co.za";
  const acceptUrl = `${baseUrl}/invite?token=${inviteToken}`;

  // Assign projects to user if provided
  if (Array.isArray(projectIds) && projectIds.length > 0) {
    await prisma.projectAssignment.createMany({
      data: projectIds.map((projectId: string) => ({
        projectId,
        userId: user.id,
      })),
    });
  }

  try {
    await sendEmail({
      to: email,
      subject: "You're invited to the GSS Support Portal",
      html: contactInviteTemplate(firstName, "", acceptUrl),
    });
  } catch {
    // Email send failed but user was created — admin can resend
  }

  logAudit({
    action: "INVITE",
    entity: "USER",
    entityId: user.id,
    description: `Invited user: ${firstName} ${lastName} (${email})`,
    userId: session.user.id,
    userName: session.user.name || undefined,
    metadata: { email, role: role || "USER" },
  });

  return NextResponse.json(
    { id: user.id, email: user.email, message: "Invitation sent" },
    { status: 201 }
  );
}
